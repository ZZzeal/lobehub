'use client';

import { useMemo } from 'react';

import { useWorkspaceMembersSWR, type WorkspaceMemberWithProfile } from './useWorkspaceMembers';

export interface FetchWorkspaceMembersOptions {
  includeDeleted?: boolean;
}

export const useFetchWorkspaceMembers = (options: FetchWorkspaceMembersOptions = {}) => {
  const { data, isLoading } = useWorkspaceMembersSWR();

  const members = useMemo<WorkspaceMemberWithProfile[]>(() => {
    if (!data) return [];

    return options.includeDeleted ? data : data.filter((member) => !member.deletedAt);
  }, [data, options.includeDeleted]);

  return { data: members, isLoading };
};
