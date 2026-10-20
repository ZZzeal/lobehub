'use client';

import type { PropsWithChildren, ReactNode } from 'react';

import { WorkspaceForbidden } from '@/features/WorkspaceSetting/AdminOnly';
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole';

/**
 * Viewer cannot issue API keys (`API_KEY_*` is granted from Member up, and only
 * for the keys they created themselves). The settings sidebar already hides the
 * tab for them; this closes the direct URL so the page does not render a list
 * whose request is bound to 403.
 */
export function WorkspaceApiKeyGuard({ children }: PropsWithChildren): ReactNode {
  const { canEditOwnContent } = useWorkspaceRole();

  if (!canEditOwnContent) return <WorkspaceForbidden />;

  return children;
}
