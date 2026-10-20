'use client';

import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

import type { WorkspaceListItem } from './useActiveWorkspace';

/**
 * The workspace list is user-scoped, not workspace-scoped: keying it by the
 * active workspace would refetch it on every switch and, worse, hide the list
 * while no workspace is active. Hence plain `useSWR` instead of
 * `useClientDataSWR` (which augments the key with the active workspace id).
 */
export const WORKSPACE_LIST_SWR_KEY = 'workspace:list';

export const useWorkspaceList = () =>
  useSWR<WorkspaceListItem[]>(
    WORKSPACE_LIST_SWR_KEY,
    () => lambdaClient.workspace.list.query() as Promise<WorkspaceListItem[]>,
    { dedupingInterval: 0, revalidateOnFocus: true, shouldRetryOnError: false },
  );

export const useWorkspaces = (): WorkspaceListItem[] => {
  const { data } = useWorkspaceList();

  return data ?? [];
};
