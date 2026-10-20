'use client';

import { useActiveWorkspace } from './useActiveWorkspace';

/**
 * Personal context counts as "owner": there is no workspace permission to
 * restrict, and personal settings/pages must stay usable.
 */
export const useIsWorkspaceOwner = (): boolean => {
  const workspace = useActiveWorkspace();

  if (!workspace) return true;

  return workspace.role === 'owner';
};
