'use client';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';

export type WorkspaceUiRole = 'admin' | 'member' | 'owner' | 'viewer';

export interface WorkspaceRoleState {
  canEditOwnContent: boolean;
  canInvokeModel: boolean;
  canManageMembers: boolean;
  canManageSettings: boolean;
  /** True when the caller sits in personal scope (no workspace context). */
  isPersonal: boolean;
  role: WorkspaceUiRole;
}

/**
 * UI-side role derivation for the workspace surfaces.
 *
 * Deliberately separate from `usePermission`: the open-source build stubs that
 * hook to `allowed: true` for every action, so gating on it looks correct while
 * hiding nothing. This hook reads the role off `workspace.list` instead.
 *
 * It is a **visibility** signal only — the actual boundary is the server-side
 * `workspaceScopedProcedure` / `workspaceAdminProcedure` /
 * `workspaceOwnerProcedure` chain, which re-derives the role from
 * `workspace_members` on every call.
 */
export const useWorkspaceRole = (): WorkspaceRoleState => {
  const activeWorkspace = useActiveWorkspace();

  // Personal scope has no workspace to gate against: the caller owns their own
  // data, so management affordances must stay available.
  const isPersonal = !activeWorkspace;

  // `workspace.list` defaults a missing role to `viewer`; mirror that so an
  // unresolved role degrades to read-only instead of silently granting writes.
  const role = (
    isPersonal ? 'owner' : ((activeWorkspace.role as WorkspaceUiRole | undefined) ?? 'viewer')
  ) as WorkspaceUiRole;

  const canManageSettings = isPersonal || role === 'owner' || role === 'admin';

  return {
    canEditOwnContent: role !== 'viewer',
    // `workspace_viewer` is intentionally denied `AI_MODEL_INVOKE` — a viewer
    // that could chat would either burn workspace budget without persisting
    // history or need a bypass in the session write path.
    canInvokeModel: role !== 'viewer',
    canManageMembers: canManageSettings,
    canManageSettings,
    isPersonal,
    role,
  };
};
