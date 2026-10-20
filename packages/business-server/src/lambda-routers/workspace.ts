import {
  isWorkspaceSlugFormatValid,
  WORKSPACE_SLUG_MAX,
  WORKSPACE_SLUG_MIN,
} from '@lobechat/const';
import type { WorkspaceItem } from '@lobechat/database/schemas';
import { TRPCError } from '@trpc/server';
import { and, count, eq, gte, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { getActiveWorkspaceMembershipRole, WorkspaceModel } from '@/database/models/workspace';
import { WorkspaceAuditLogModel } from '@/database/models/workspaceAuditLog';
import { agents } from '@/database/schemas/agent';
import { messages } from '@/database/schemas/message';
import { topics } from '@/database/schemas/topic';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

import { workspaceAdminProcedure, workspaceScopedProcedure } from './_helpers/workspaceProcedure';

/**
 * A workspace row as the workspace picker sees it: the stored record plus the
 * caller's membership role and the plan tag cloud derives from subscriptions.
 */
export interface WorkspaceMembershipSummary extends WorkspaceItem {
  lockedOut?: boolean;
  plan?: string;
  role: string | null;
}

export interface WorkspaceStatistics {
  agents: number;
  messages: number;
  messagesToday: number;
  topics: number;
}

// Same shape cloud enforces, so a slug the CLI or UI gets past this stub is
// only ever rejected for the reservations cloud adds on top.
const workspaceSlugSchema = z
  .string()
  .min(WORKSPACE_SLUG_MIN)
  .max(WORKSPACE_SLUG_MAX)
  .refine(isWorkspaceSlugFormatValid, { message: 'invalid-slug' });

const workspaceStatisticsInput = z
  .object({ todayStartAt: z.string().datetime().optional() })
  .optional();

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const countAgents = async (db: any, workspaceId: string, userId?: string) => {
  const filters = [eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)];
  if (userId) filters.push(eq(agents.userId, userId));
  const [row] = await db
    .select({ total: count() })
    .from(agents)
    .where(and(...filters));
  return Number(row?.total ?? 0);
};

const countMessages = async (db: any, workspaceId: string, since: Date, userId?: string) => {
  const filters = [eq(messages.workspaceId, workspaceId), gte(messages.createdAt, since)];
  if (userId) filters.push(eq(messages.userId, userId));
  const [row] = await db
    .select({ total: count() })
    .from(messages)
    .where(and(...filters));
  return Number(row?.total ?? 0);
};

const countTopics = async (db: any, workspaceId: string, userId?: string) => {
  const filters = [eq(topics.workspaceId, workspaceId)];
  if (userId) filters.push(eq(topics.userId, userId));
  const [row] = await db
    .select({ total: count() })
    .from(topics)
    .where(and(...filters));
  return Number(row?.total ?? 0);
};

const getStatistics = async (
  db: any,
  workspaceId: string,
  todayStartAt?: string,
  userId?: string,
): Promise<WorkspaceStatistics> => {
  const since = todayStartAt ? new Date(todayStartAt) : startOfToday();
  const [agentTotal, messageTotal, messageToday, topicTotal] = await Promise.all([
    countAgents(db, workspaceId, userId),
    countMessages(db, workspaceId, new Date(0), userId),
    countMessages(db, workspaceId, since, userId),
    countTopics(db, workspaceId, userId),
  ]);

  return {
    agents: agentTotal,
    messages: messageTotal,
    messagesToday: messageToday,
    topics: topicTotal,
  };
};

export const workspaceRouter = router({
  checkSlugAvailable: authedProcedure
    .use(serverDatabase)
    .input(z.object({ slug: z.string().min(WORKSPACE_SLUG_MIN).max(WORKSPACE_SLUG_MAX) }))
    .query(async ({ ctx, input }): Promise<{ available: boolean }> => {
      const existing = await new WorkspaceModel(ctx.serverDB, ctx.userId).findBySlug(input.slug);
      return { available: !existing };
    }),

  create: authedProcedure
    .use(serverDatabase)
    .input(
      z.object({
        avatar: z.string().optional(),
        description: z.string().max(1000).optional(),
        name: z.string().min(1).max(255),
        slug: workspaceSlugSchema,
      }),
    )
    .mutation(async ({ ctx, input }): Promise<WorkspaceItem> => {
      const model = new WorkspaceModel(ctx.serverDB, ctx.userId);

      if (await model.findBySlug(input.slug)) {
        throw new TRPCError({ code: 'CONFLICT', message: 'workspace-slug-taken' });
      }

      let workspace: WorkspaceItem;
      try {
        workspace = await model.create(input);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'workspace-slug-taken', cause: error });
        }
        throw error;
      }

      await new WorkspaceAuditLogModel(ctx.serverDB)
        .create({
          action: 'workspace.created',
          ipAddress: ctx.clientIp ?? undefined,
          metadata: { name: workspace.name, slug: workspace.slug },
          resourceId: workspace.id,
          resourceType: 'workspace',
          userId: ctx.userId,
          workspaceId: workspace.id,
        })
        .catch((error) => {
          console.error('[workspace:create] audit failed', error);
        });

      return workspace;
    }),

  /**
   * Open-source deployments have no market/billing integration; keep the
   * procedure so the UI does not crash, but report that nothing was provisioned.
   */
  ensureMarketOrganization: authedProcedure
    .input(z.object({ autoProvision: z.boolean().optional() }).optional())
    .mutation(async (): Promise<{ created: boolean; marketAccountId: number }> => ({
      created: false,
      marketAccountId: 0,
    })),

  // `wsCompatProcedure` semantics: callers (`buildAppUrl`) ask before they know
  // whether a workspace is in scope, so an unscoped / non-member call is null
  // rather than an error.
  getById: authedProcedure
    .use(serverDatabase)
    .query(async ({ ctx }): Promise<WorkspaceItem | null> => {
      if (!ctx.workspaceId) return null;

      const role = await getActiveWorkspaceMembershipRole(ctx.serverDB, {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      if (!role) return null;

      return (await new WorkspaceModel(ctx.serverDB, ctx.userId).findById(ctx.workspaceId)) ?? null;
    }),

  getMyStatistics: workspaceScopedProcedure
    .input(workspaceStatisticsInput)
    .query(async ({ ctx, input }): Promise<WorkspaceStatistics> =>
      getStatistics(ctx.serverDB, ctx.workspaceId, input?.todayStartAt, ctx.userId),
    ),

  getSettings: workspaceScopedProcedure.query(
    async ({ ctx }): Promise<Record<string, unknown>> =>
      (await new WorkspaceModel(ctx.serverDB, ctx.userId).getSettings(ctx.workspaceId)) as Record<
        string,
        unknown
      >,
  ),

  /** Workspace-wide totals across all members — Admin or higher, like cloud. */
  getStatistics: workspaceAdminProcedure
    .input(workspaceStatisticsInput)
    .query(async ({ ctx, input }): Promise<WorkspaceStatistics> =>
      getStatistics(ctx.serverDB, ctx.workspaceId, input?.todayStartAt),
    ),

  list: authedProcedure
    .use(serverDatabase)
    .query(async ({ ctx }): Promise<WorkspaceMembershipSummary[]> => {
      const rows = await new WorkspaceModel(ctx.serverDB, ctx.userId).listUserWorkspaces();
      return rows.map((row) => ({ ...row, plan: 'self-hosted' }));
    }),

  update: workspaceAdminProcedure
    .input(
      z.object({
        avatar: z.string().optional(),
        description: z.string().max(1000).optional(),
        name: z.string().min(1).max(255).optional(),
        slug: workspaceSlugSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<void> => {
      if (input.slug) {
        const existing = await new WorkspaceModel(ctx.serverDB, ctx.userId).findBySlug(input.slug);
        if (existing && existing.id !== ctx.workspaceId) {
          throw new TRPCError({ code: 'CONFLICT', message: 'workspace-slug-taken' });
        }
      }

      await new WorkspaceModel(ctx.serverDB, ctx.userId).update(ctx.workspaceId, input);

      await new WorkspaceAuditLogModel(ctx.serverDB)
        .create({
          action: 'workspace.updated',
          ipAddress: ctx.clientIp ?? undefined,
          metadata: input,
          resourceId: ctx.workspaceId,
          resourceType: 'workspace',
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
        })
        .catch((error) => {
          console.error('[workspace:update] audit failed', error);
        });
    }),
});
