import { getWorkspaceStoreState } from './workspaceStore';

/**
 * Business headers merged into every lambda tRPC call (and into the imperative
 * fetch helpers that need the same scope). In the open-source build the only
 * business concern is the active workspace, which the server reads from
 * `X-Workspace-Id` and validates against `workspace_members`.
 */
export const getBusinessTrpcHeaders = async (): Promise<Record<string, string>> => {
  const { activeWorkspaceId } = getWorkspaceStoreState();

  return activeWorkspaceId ? { 'X-Workspace-Id': activeWorkspaceId } : {};
};
