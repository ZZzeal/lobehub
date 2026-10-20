import { beforeEach, describe, expect, it } from 'vitest';

import { getBusinessTrpcHeaders } from '../trpc-headers';
import { getWorkspaceStoreState, useWorkspaceStore } from '../workspaceStore';

beforeEach(() => {
  useWorkspaceStore.getState().setActiveWorkspace(null, null);
});

describe('business tRPC headers', () => {
  it('sends no workspace header in personal context', async () => {
    await expect(getBusinessTrpcHeaders()).resolves.toEqual({});
  });

  it('sends the active workspace id', async () => {
    useWorkspaceStore.getState().setActiveWorkspace('ws-1', 'team');

    await expect(getBusinessTrpcHeaders()).resolves.toEqual({ 'X-Workspace-Id': 'ws-1' });
  });

  it('persists the active workspace and slug', () => {
    useWorkspaceStore.getState().setActiveWorkspace('ws-2', 'design');

    expect(getWorkspaceStoreState().activeWorkspaceId).toBe('ws-2');
    expect(getWorkspaceStoreState().activeWorkspaceSlug).toBe('design');
    expect(JSON.parse(localStorage.getItem('lobe-workspace-active')!)).toEqual({
      id: 'ws-2',
      slug: 'design',
    });
  });
});
