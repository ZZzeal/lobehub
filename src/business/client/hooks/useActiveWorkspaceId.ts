'use client';

import { useWorkspaceStore } from '../workspaceStore';

export const getActiveWorkspaceId = (): string | null =>
  useWorkspaceStore.getState().activeWorkspaceId;

export const useActiveWorkspaceId = (): string | null =>
  useWorkspaceStore((state) => state.activeWorkspaceId);
