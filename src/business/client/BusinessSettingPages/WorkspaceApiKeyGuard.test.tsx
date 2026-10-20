import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceApiKeyGuard } from './WorkspaceApiKeyGuard';

const mocks = vi.hoisted(() => ({ canEditOwnContent: true }));

vi.mock('@/hooks/useWorkspaceRole', () => ({
  useWorkspaceRole: () => ({
    canEditOwnContent: mocks.canEditOwnContent,
    canInvokeModel: mocks.canEditOwnContent,
    canManageMembers: false,
    canManageSettings: false,
    canViewBilling: false,
    isPersonal: false,
    role: mocks.canEditOwnContent ? 'member' : 'viewer',
  }),
}));

beforeEach(() => {
  mocks.canEditOwnContent = true;
});

describe('WorkspaceApiKeyGuard', () => {
  it('renders the API key page for a member', () => {
    render(
      <WorkspaceApiKeyGuard>
        <div>api key page</div>
      </WorkspaceApiKeyGuard>,
    );

    expect(screen.getByText('api key page')).toBeInTheDocument();
  });

  // Viewer holds no API_KEY_* grant; the sidebar hides the tab, this closes the URL.
  it('renders 403 for a viewer arriving on the URL directly', () => {
    mocks.canEditOwnContent = false;
    render(
      <WorkspaceApiKeyGuard>
        <div>api key page</div>
      </WorkspaceApiKeyGuard>,
    );

    expect(screen.getByText('forbidden.title')).toBeInTheDocument();
    expect(screen.queryByText('api key page')).not.toBeInTheDocument();
  });
});
