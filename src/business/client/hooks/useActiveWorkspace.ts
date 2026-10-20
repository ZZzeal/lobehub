'use client';

import type { WorkspaceItem } from '@lobechat/database/schemas';

import { useActiveWorkspaceId } from './useActiveWorkspaceId';
import { useWorkspaces } from './useWorkspaces';

export type WorkspaceListItem = WorkspaceItem & {
  /**
   * True when the caller is a non-primary member of a workspace whose paid
   * subscription has lapsed. The cloud override of `workspace.list` sets it.
   */
  lockedOut?: boolean;
  plan?: 'business' | 'free' | 'pro' | string;
  role?: string;
};

export const useActiveWorkspace = (): WorkspaceListItem | null => {
  const activeId = useActiveWorkspaceId();
  const workspaces = useWorkspaces();

  if (!activeId) return null;

  return workspaces.find((workspace) => workspace.id === activeId) ?? null;
};
