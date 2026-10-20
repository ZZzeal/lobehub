import type { WorkspaceInvitationItem, WorkspaceItem } from '@lobechat/database/schemas';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { WorkspaceModel } from '@/database/models/workspace';
import { WorkspaceAuditLogModel } from '@/database/models/workspaceAuditLog';
import { WorkspaceMemberModel } from '@/database/models/workspaceMember';
import { users } from '@/database/schemas/user';
import { workspaceInvitations, workspaceMembers } from '@/database/schemas/workspace';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

import {
  workspaceAdminProcedure,
  workspaceOwnerProcedure,
  workspaceScopedProcedure,
} from './_helpers/workspaceProcedure';

const assignableRoleSchema = z.enum(['admin', 'member', 'viewer']);

export interface WorkspaceMemberSummary {
  deletedAt: Date | null;
  joinedAt: Date;
  role: string;
  updatedAt: Date;
  user: {
    avatar: string | null;
    email: string | null;
    fullName: string | null;
    id: string;
    username: string | null;
  } | null;
  userId: string;
  workspaceId: string;
}

const audit = async (
  db: any,
  params: {
    action: Parameters<WorkspaceAuditLogModel['create']>[0]['action'];
    ipAddress?: string;
    metadata?: Record<string, any>;
    resourceId?: string;
    resourceType?: string;
    userId: string | null;
    workspaceId: string;
  },
) => {
  await new WorkspaceAuditLogModel(db).create(params).catch((error) => {
    console.error('[workspaceMember] audit failed', error);
  });
};

export const workspaceMemberRouter = router({
  /**
   * Token redemption. Not workspace-scoped: the caller is not a member yet and
   * the invitation itself decides which workspace and role they join.
   */
  accept: authedProcedure
    .use(serverDatabase)
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<WorkspaceItem> => {
      const model = new WorkspaceMemberModel(ctx.serverDB, ctx.userId);
      const invitation = await model.findInvitationByToken(input.token);

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'invitation-not-found' });
      }
      if (invitation.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `invitation-${invitation.status}` });
      }
      if (invitation.expiresAt.getTime() <= Date.now()) {
        await model.updateInvitationStatus(invitation.id, 'expired');
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'invitation-expired' });
      }

      if (invitation.email) {
        const me = await ctx.serverDB.query.users.findFirst({
          columns: { email: true },
          where: eq(users.id, ctx.userId),
        });
        if (me?.email?.toLowerCase() !== invitation.email.toLowerCase()) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'invitation-email-mismatch' });
        }
      }

      await model.addMember({
        role: invitation.role as 'admin' | 'member' | 'viewer',
        userId: ctx.userId,
        workspaceId: invitation.workspaceId,
      });
      await model.updateInvitationStatus(invitation.id, 'accepted');

      await audit(ctx.serverDB, {
        action: 'member.joined',
        ipAddress: ctx.clientIp ?? undefined,
        metadata: { invitationId: invitation.id, role: invitation.role },
        resourceId: ctx.userId,
        resourceType: 'member',
        userId: ctx.userId,
        workspaceId: invitation.workspaceId,
      });

      const workspace = await new WorkspaceModel(ctx.serverDB, ctx.userId).findById(
        invitation.workspaceId,
      );

      if (!workspace) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'workspace-not-found' });
      }
      return workspace;
    }),

  invite: workspaceAdminProcedure
    .input(
      z.object({
        email: z.string().email().optional(),
        role: assignableRoleSchema.default('member'),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<WorkspaceInvitationItem> => {
      if (input.email) {
        const existing = await ctx.serverDB
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .innerJoin(users, eq(users.id, workspaceMembers.userId))
          .where(
            and(
              eq(workspaceMembers.workspaceId, ctx.workspaceId),
              isNull(workspaceMembers.deletedAt),
              eq(users.email, input.email),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'already-a-member' });
        }
      }

      const invitation = await new WorkspaceMemberModel(ctx.serverDB, ctx.userId).createInvitation({
        email: input.email,
        role: input.role,
        workspaceId: ctx.workspaceId,
      });

      await audit(ctx.serverDB, {
        action: 'member.invited',
        ipAddress: ctx.clientIp ?? undefined,
        metadata: { email: input.email, role: input.role },
        resourceId: invitation.id,
        resourceType: 'invitation',
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });

      return invitation;
    }),

  list: workspaceScopedProcedure.query(async ({ ctx }): Promise<WorkspaceMemberSummary[]> => {
    const members = await new WorkspaceMemberModel(ctx.serverDB, ctx.userId).listMembers(
      ctx.workspaceId,
    );

    if (members.length === 0) return [];

    const profiles = await ctx.serverDB
      .select({
        avatar: users.avatar,
        email: users.email,
        fullName: users.fullName,
        id: users.id,
        username: users.username,
      })
      .from(users)
      .where(
        inArray(
          users.id,
          members.map((member) => member.userId),
        ),
      );

    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

    return members.map((member) => ({
      deletedAt: member.deletedAt,
      joinedAt: member.joinedAt,
      role: member.role,
      updatedAt: member.updatedAt,
      user: profileById.get(member.userId) ?? null,
      userId: member.userId,
      workspaceId: member.workspaceId,
    }));
  }),

  listInvitations: workspaceAdminProcedure.query(
    async ({ ctx }): Promise<WorkspaceInvitationItem[]> =>
      new WorkspaceMemberModel(ctx.serverDB, ctx.userId).listPendingInvitations(ctx.workspaceId),
  ),

  remove: workspaceAdminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<void> => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'cannot-remove-yourself' });
      }

      const model = new WorkspaceMemberModel(ctx.serverDB, ctx.userId);
      const target = await model.getMember(ctx.workspaceId, input.userId);
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'member-not-found' });
      }
      if (target.role === 'owner') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'cannot-remove-owner' });
      }

      await model.removeMember(ctx.workspaceId, input.userId);

      await audit(ctx.serverDB, {
        action: 'member.removed',
        ipAddress: ctx.clientIp ?? undefined,
        metadata: { role: target.role },
        resourceId: input.userId,
        resourceType: 'member',
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
    }),

  resendInvitation: workspaceAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<WorkspaceInvitationItem> => {
      const model = new WorkspaceMemberModel(ctx.serverDB, ctx.userId);
      const existing = await ctx.serverDB.query.workspaceInvitations.findFirst({
        where: and(
          eq(workspaceInvitations.id, input.id),
          eq(workspaceInvitations.workspaceId, ctx.workspaceId),
        ),
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'invitation-not-found' });
      }
      if (existing.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `invitation-${existing.status}` });
      }

      await model.revokeInvitation(existing.id);
      const invitation = await model.createInvitation({
        email: existing.email ?? undefined,
        role: existing.role as 'admin' | 'member' | 'viewer',
        workspaceId: ctx.workspaceId,
      });

      await audit(ctx.serverDB, {
        action: 'invitation.resent',
        ipAddress: ctx.clientIp ?? undefined,
        metadata: { email: existing.email, role: existing.role },
        resourceId: invitation.id,
        resourceType: 'invitation',
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });

      return invitation;
    }),

  revokeInvitation: workspaceAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<void> => {
      const invitation = await ctx.serverDB.query.workspaceInvitations.findFirst({
        where: and(
          eq(workspaceInvitations.id, input.id),
          eq(workspaceInvitations.workspaceId, ctx.workspaceId),
        ),
      });

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'invitation-not-found' });
      }

      await new WorkspaceMemberModel(ctx.serverDB, ctx.userId).revokeInvitation(invitation.id);

      await audit(ctx.serverDB, {
        action: 'invitation.revoked',
        ipAddress: ctx.clientIp ?? undefined,
        metadata: { email: invitation.email, role: invitation.role },
        resourceId: invitation.id,
        resourceType: 'invitation',
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
    }),

  transferOwnership: workspaceOwnerProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<void> => {
      const model = new WorkspaceMemberModel(ctx.serverDB, ctx.userId);
      const target = await model.getMember(ctx.workspaceId, input.userId);
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'member-not-found' });
      }

      await new WorkspaceModel(ctx.serverDB, ctx.userId).transferPrimaryOwnership(
        ctx.workspaceId,
        input.userId,
      );

      await audit(ctx.serverDB, {
        action: 'workspace.primary_ownership_transferred',
        ipAddress: ctx.clientIp ?? undefined,
        metadata: { from: ctx.userId, to: input.userId },
        resourceId: ctx.workspaceId,
        resourceType: 'workspace',
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
    }),

  updateRole: workspaceAdminProcedure
    .input(z.object({ role: assignableRoleSchema, userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<void> => {
      const model = new WorkspaceMemberModel(ctx.serverDB, ctx.userId);
      const target = await model.getMember(ctx.workspaceId, input.userId);
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'member-not-found' });
      }
      if (target.role === 'owner') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'cannot-change-owner-role' });
      }

      await model.updateMemberRole(ctx.workspaceId, input.userId, input.role);

      await audit(ctx.serverDB, {
        action: 'member.role_updated',
        ipAddress: ctx.clientIp ?? undefined,
        metadata: { from: target.role, to: input.role },
        resourceId: input.userId,
        resourceType: 'member',
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
    }),
});
