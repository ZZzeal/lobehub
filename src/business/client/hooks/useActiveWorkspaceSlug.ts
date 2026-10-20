'use client';

import { useWorkspaceStore } from '../workspaceStore';

export const getActiveWorkspaceSlug = (): string | null =>
  useWorkspaceStore.getState().activeWorkspaceSlug;

export const useActiveWorkspaceSlug = (): string | null =>
  useWorkspaceStore((state) => state.activeWorkspaceSlug);
