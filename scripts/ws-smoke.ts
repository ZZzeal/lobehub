import { TRPCError } from '@trpc/server';
import { inArray } from 'drizzle-orm';

import { workspaceRouter } from '@/business/server/lambda-routers/workspace';
import { workspaceMemberRouter } from '@/business/server/lambda-routers/workspaceMember';
import { getServerDB } from '@/database/core/db-adaptor';
import { users } from '@/database/schemas/user';

const A = 'usr_ws_smoke_a';
const B = 'usr_ws_smoke_b';
const C = 'usr_ws_smoke_c';

const expectFailure = async (label: string, fn: () => Promise<unknown>, code: string) => {
  try {
    await fn();
    throw new Error(`[FAIL] ${label}: expected ${code}, got success`);
  } catch (error) {
    if (error instanceof TRPCError && error.code === code) {
      console.log(`[ok] ${label} -> ${code}`);
      return;
    }
    throw error;
  }
};

const main = async () => {
  const db = await getServerDB();

  await db.delete(users).where(inArray(users.id, [A, B, C]));
  for (const [id, email] of [
    [A, 'ws-smoke-a@dev.local'],
    [B, 'ws-smoke-b@dev.local'],
    [C, 'ws-smoke-c@dev.local'],
  ]) {
    await db.insert(users).values({ email, id, username: id });
  }

  const slug = `smoke-${Date.now()}`;

  const asA = workspaceRouter.createCaller({ userId: A } as any);
  const asB = workspaceRouter.createCaller({ userId: B } as any);
  const asC = workspaceRouter.createCaller({ userId: C } as any);

  const created = await asA.create({ name: 'Smoke Space', slug });
  console.log('[ok] create', created.id, created.slug);

  const listA = await asA.list();
  console.log('[ok] list', listA.length, listA[0]?.role);

  const available = await asA.checkSlugAvailable({ slug });
  console.log('[ok] checkSlugAvailable', available);

  await expectFailure('duplicate slug', () => asB.create({ name: 'Dup', slug }), 'CONFLICT');

  const memberA = workspaceMemberRouter.createCaller({ userId: A, workspaceId: created.id } as any);
  const memberB = workspaceMemberRouter.createCaller({ userId: B, workspaceId: created.id } as any);
  const memberC = workspaceMemberRouter.createCaller({ userId: C, workspaceId: created.id } as any);
  const wsA = workspaceRouter.createCaller({ userId: A, workspaceId: created.id } as any);
  const wsB = workspaceRouter.createCaller({ userId: B, workspaceId: created.id } as any);

  const invitation = await memberA.invite({ email: 'ws-smoke-b@dev.local', role: 'member' });
  console.log('[ok] invite', invitation.id, invitation.role, invitation.expiresAt);

  const accepted = await workspaceMemberRouter
    .createCaller({ userId: B } as any)
    .accept({ token: invitation.token });
  console.log('[ok] accept', accepted.id);

  const members = await memberA.list();
  console.log('[ok] members', members.map((m) => `${m.userId}:${m.role}`).join(','));

  await expectFailure('non-member list', () => memberC.list(), 'FORBIDDEN');
  await expectFailure('member invites', () => memberB.invite({ role: 'member' }), 'FORBIDDEN');
  await expectFailure('member updates workspace', () => wsB.update({ name: 'x' }), 'FORBIDDEN');
  await expectFailure('member lists invitations', () => memberB.listInvitations(), 'FORBIDDEN');

  const stats = await wsA.getStatistics();
  console.log('[ok] statistics', stats);

  await memberA.updateRole({ role: 'viewer', userId: B });
  console.log('[ok] updateRole', (await memberA.list()).find((m) => m.userId === B)?.role);

  await memberA.remove({ userId: B });
  console.log('[ok] remove', (await memberA.list()).length);

  console.log('\nSMOKE PASSED');
  process.exit(0);
};

main().catch((error) => {
  console.error('SMOKE FAILED', error);
  process.exit(1);
});
