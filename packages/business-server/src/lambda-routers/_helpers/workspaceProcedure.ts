import { TRPCError } from '@trpc/server';

import type { WorkspaceRole } from '@/business/server/trpc-middlewares/workspaceAuth';
import { getActiveWorkspaceMembershipRole } from '@/database/models/workspace';
import { authedProcedure } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

/**
 * Open-source replacement for the cloud `wsProcedure`.
 *
 * The lambda context trusts the `X-Workspace-Id` header and never verifies the
 * membership itself (only API keys are bound to a workspace at context time),
 * so every workspace-scoped procedure must resolve the caller's role here.
 * Without this check any authenticated user could read another tenant's data by
 * sending an arbitrary workspace id.
 */
export const workspaceScopedProcedure = authedProcedure
  .use(serverDatabase)
  .use(async ({ ctx, next }) => {
    if (!ctx.workspaceId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspaceId is required' });
    }

    const role = await getActiveWorkspaceMembershipRole(ctx.serverDB, {
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
    });

    if (!role) {
      // 404-style refusal: do not reveal whether the workspace exists.
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this workspace' });
    }

    return next({
      ctx: {
        role: role as WorkspaceRole,
        workspaceId: ctx.workspaceId,
      },
    });
  });

export const workspaceAdminProcedure = workspaceScopedProcedure.use(({ ctx, next }) => {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Workspace admin role required' });
  }
  return next();
});

export const workspaceOwnerProcedure = workspaceScopedProcedure.use(({ ctx, next }) => {
  if (ctx.role !== 'owner') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Workspace owner role required' });
  }
  return next();
});
