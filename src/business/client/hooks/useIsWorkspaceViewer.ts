'use client';

import { useActiveWorkspace } from './useActiveWorkspace';

/** Read-only members see no write affordances; personal context is never read-only. */
export const useIsWorkspaceViewer = (): boolean => {
  const workspace = useActiveWorkspace();

  return workspace?.role === 'viewer';
};
