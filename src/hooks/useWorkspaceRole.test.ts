import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as useActiveWorkspaceModule from '@/business/client/hooks/useActiveWorkspace';

import { useWorkspaceRole } from './useWorkspaceRole';

const mockActiveWorkspace = (workspace: { role?: string } | null) => {
  vi.spyOn(useActiveWorkspaceModule, 'useActiveWorkspace').mockReturnValue(workspace as any);
};

const readRole = () => {
  const { result } = renderHook(() => useWorkspaceRole());

  return result.current;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useWorkspaceRole', () => {
  // No workspace context: the caller owns everything, so every gate stays open.
  it('grants every capability in personal scope', () => {
    mockActiveWorkspace(null);

    expect(readRole()).toMatchObject({
      canEditOwnContent: true,
      canInvokeModel: true,
      canManageMembers: true,
      canManageSettings: true,
      canViewBilling: true,
      isPersonal: true,
      role: 'owner',
    });
  });

  it('lets the owner manage settings and read billing', () => {
    mockActiveWorkspace({ role: 'owner' });

    expect(readRole()).toMatchObject({
      canEditOwnContent: true,
      canInvokeModel: true,
      canManageSettings: true,
      canViewBilling: true,
      isPersonal: false,
      role: 'owner',
    });
  });

  // `workspace_admin` holds WORKSPACE_SETTINGS_UPDATE + member management but no
  // WORKSPACE_BILLING_READ, so the money pages must stay hidden from it.
  it('lets an admin manage settings but not view billing', () => {
    mockActiveWorkspace({ role: 'admin' });

    expect(readRole()).toMatchObject({
      canEditOwnContent: true,
      canInvokeModel: true,
      canManageMembers: true,
      canManageSettings: true,
      canViewBilling: false,
      role: 'admin',
    });
  });

  it('keeps a member able to chat and edit own content only', () => {
    mockActiveWorkspace({ role: 'member' });

    expect(readRole()).toMatchObject({
      canEditOwnContent: true,
      canInvokeModel: true,
      canManageMembers: false,
      canManageSettings: false,
      canViewBilling: false,
      role: 'member',
    });
  });

  // `workspace_viewer` is denied AI_MODEL_INVOKE and every write grant.
  it('demotes a viewer to strict read-only', () => {
    mockActiveWorkspace({ role: 'viewer' });

    expect(readRole()).toMatchObject({
      canEditOwnContent: false,
      canInvokeModel: false,
      canManageMembers: false,
      canManageSettings: false,
      canViewBilling: false,
      role: 'viewer',
    });
  });

  // `workspace.list` may omit the role before the cache fills; degrade to the
  // read-only role instead of silently granting writes.
  it('falls back to viewer when the role is missing', () => {
    mockActiveWorkspace({});

    expect(readRole()).toMatchObject({ canManageSettings: false, role: 'viewer' });
  });
});
