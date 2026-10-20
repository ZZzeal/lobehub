'use client';

import type { WorkspaceMemberItem } from '@lobechat/database/schemas';
import { useEffect } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

import { useActiveWorkspaceId } from './useActiveWorkspaceId';

export interface WorkspaceMemberUserProfile {
  avatar?: string | null;
  email?: string | null;
  fullName?: string | null;
  username?: string | null;
}

export type WorkspaceMemberWithProfile = WorkspaceMemberItem & {
  user?: WorkspaceMemberUserProfile | null;
};

export const WORKSPACE_MEMBERS_SWR_KEY = 'workspace:members';

/**
 * Synchronous snapshot for imperative callers (tool executors, gateway
 * payloads) that cannot await SWR. Updated by the hook below.
 */
let membersSnapshot: WorkspaceMemberWithProfile[] = [];

export const useWorkspaceMembersSWR = () => {
  const activeWorkspaceId = useActiveWorkspaceId();

  const result = useSWR<WorkspaceMemberWithProfile[]>(
    activeWorkspaceId ? [WORKSPACE_MEMBERS_SWR_KEY, activeWorkspaceId] : null,
    () => lambdaClient.workspaceMember.list.query() as Promise<WorkspaceMemberWithProfile[]>,
    { dedupingInterval: 0, shouldRetryOnError: false },
  );

  useEffect(() => {
    if (result.data) membersSnapshot = result.data;
  }, [result.data]);

  return result;
};

export const useWorkspaceMembers = (): WorkspaceMemberWithProfile[] =>
  useWorkspaceMembersSWR().data ?? [];

export const getWorkspaceMembers = (): WorkspaceMemberWithProfile[] => membersSnapshot;
