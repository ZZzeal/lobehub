import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as ReactRouter from 'react-router';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as useActiveWorkspaceModule from '@/business/client/hooks/useActiveWorkspace';
import { useWorkspaceStore } from '@/business/client/workspaceStore';
import * as useWorkspaceRoleModule from '@/hooks/useWorkspaceRole';

import WorkspaceGeneral from './WorkspaceGeneral';

const mocks = vi.hoisted(() => ({
  checkSlug: vi.fn(async () => ({ available: true })),
  confirm: vi.fn((config: { onOk?: () => unknown }) => config.onOk?.()),
  mutateCache: vi.fn(async () => undefined),
  navigate: vi.fn(),
  update: vi.fn(async () => undefined),
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    workspace: {
      checkSlugAvailable: { query: mocks.checkSlug },
      update: { mutate: mocks.update },
    },
  },
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>();

  return { ...actual, useNavigate: () => mocks.navigate };
});

// Only Button and confirmModal matter here: Button renders a native button so
// `disabled` is observable, and confirmModal is auto-confirmed so the happy
// path of the slug rename can be driven end to end.
vi.mock('@lobehub/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const React = await import('react');

  return {
    ...actual,
    Button: ({ children, loading: _loading, type: _type, ...props }: { children?: ReactNode }) =>
      React.createElement('button', { ...props, type: 'button' }, children),
    confirmModal: mocks.confirm,
  };
});

const workspace = {
  description: 'Team space',
  id: 'ws-1',
  name: 'Acme',
  role: 'owner',
  slug: 'acme',
};

const renderPage = (
  options: { canManageSettings?: boolean; role?: 'admin' | 'member' | 'owner' | 'viewer' } = {},
) => {
  const canManageSettings = options.canManageSettings ?? true;

  vi.spyOn(useActiveWorkspaceModule, 'useActiveWorkspace').mockReturnValue(workspace as any);
  vi.spyOn(useWorkspaceRoleModule, 'useWorkspaceRole').mockReturnValue({
    canEditOwnContent: true,
    canInvokeModel: true,
    canManageMembers: canManageSettings,
    canManageSettings,
    isPersonal: false,
    role: options.role ?? 'owner',
  });

  return render(
    <SWRConfig value={{ mutate: mocks.mutateCache } as any}>
      <WorkspaceGeneral />
    </SWRConfig>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.getState().setActiveWorkspace(null, null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WorkspaceGeneral', () => {
  it('saves name and description through workspace.update and refreshes the list cache', async () => {
    renderPage();

    fireEvent.change(screen.getByDisplayValue('Acme'), { target: { value: 'Acme Team' } });

    const save = screen.getByTestId('workspace-name-save');
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        description: 'Team space',
        name: 'Acme Team',
      }),
    );
    expect(mocks.mutateCache).toHaveBeenCalledWith('workspace:list');
  });

  it('keeps every field read-only for a member without manage rights', () => {
    renderPage({ canManageSettings: false, role: 'member' });

    expect(screen.getByText('workspace.general.noPermissionHint')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Acme')).toBeDisabled();
    expect(screen.getByDisplayValue('acme')).toBeDisabled();
    expect(screen.getByTestId('workspace-name-save')).toBeDisabled();
    expect(screen.getByTestId('workspace-url-save')).toBeDisabled();
  });

  it('blocks a reserved slug before it ever reaches the availability check', async () => {
    renderPage();

    fireEvent.change(screen.getByDisplayValue('acme'), { target: { value: 'settings' } });

    expect(await screen.findByText('workspace.general.url.invalidReserved')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-url-save')).toBeDisabled();
    expect(mocks.checkSlug).not.toHaveBeenCalled();
  });

  it('renames the slug, then syncs the list cache, the store and the URL', async () => {
    renderPage();

    fireEvent.change(screen.getByDisplayValue('acme'), { target: { value: 'acme-team' } });

    const save = screen.getByTestId('workspace-url-save');
    // The 400ms debounced availability check has to land first.
    await waitFor(() => expect(save).toBeEnabled(), { timeout: 3000 });
    fireEvent.click(save);

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ slug: 'acme-team' }));
    expect(mocks.confirm).toHaveBeenCalled();
    expect(mocks.mutateCache).toHaveBeenCalledWith('workspace:list');
    expect(mocks.navigate).toHaveBeenCalledWith('/acme-team/settings/general', { replace: true });
    expect(useWorkspaceStore.getState().activeWorkspaceSlug).toBe('acme-team');
  });
});
