'use client';

import { useWorkspaceList } from './useWorkspaces';

/** True only before the first successful list response. */
export const useIsWorkspaceLoading = (): boolean => {
  const { data, isLoading } = useWorkspaceList();

  return isLoading && !data;
};
