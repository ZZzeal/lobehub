import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminOnly from './AdminOnly';

const mocks = vi.hoisted(() => ({ canManageSettings: true, isLoading: false }));

vi.mock('@/hooks/useWorkspaceRole', () => ({
  useWorkspaceRole: () => ({
    canEditOwnContent: true,
    canInvokeModel: true,
    canManageMembers: mocks.canManageSettings,
    canManageSettings: mocks.canManageSettings,
    canViewBilling: false,
    isPersonal: false,
    role: 'member',
  }),
}));

vi.mock('@/business/client/hooks/useIsWorkspaceLoading', () => ({
  useIsWorkspaceLoading: () => mocks.isLoading,
}));

vi.mock('@/components/Skeleton/RouteSegment', () => ({
  RouteLoading: () => <div>route-loading</div>,
}));

const renderGuard = () =>
  render(
    <AdminOnly>
      <div>admin content</div>
    </AdminOnly>,
  );

beforeEach(() => {
  mocks.canManageSettings = true;
  mocks.isLoading = false;
});

describe('AdminOnly', () => {
  it('renders the page for an owner or admin', () => {
    renderGuard();

    expect(screen.getByText('admin content')).toBeInTheDocument();
    expect(screen.queryByText('forbidden.title')).not.toBeInTheDocument();
  });

  // The open-source `usePermission` stub used to answer `allowed: true` here, so
  // members reached provider / service-model / storage / audit-log and only the
  // server's 403 stopped them.
  it('renders 403 for a member', () => {
    mocks.canManageSettings = false;
    renderGuard();

    expect(screen.getByText('forbidden.title')).toBeInTheDocument();
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });

  // Role is unknown while the workspace list bootstraps; painting the 403 then
  // would flash the forbidden screen for admins landing directly on the URL.
  it('shows the loading state instead of 403 while the workspace resolves', () => {
    mocks.canManageSettings = false;
    mocks.isLoading = true;
    renderGuard();

    expect(screen.getByText('route-loading')).toBeInTheDocument();
    expect(screen.queryByText('forbidden.title')).not.toBeInTheDocument();
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });
});
