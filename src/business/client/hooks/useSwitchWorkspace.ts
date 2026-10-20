'use client';

import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useSWRConfig } from 'swr';

import { useWorkspaceStore } from '../workspaceStore';
import { useWorkspaces, WORKSPACE_LIST_SWR_KEY } from './useWorkspaces';

export interface SwitchWorkspaceActions {
  switchToPersonal: () => Promise<void>;
  /**
   * @param slug Resolved slug override. Needed right after `workspace.create`:
   * the caller holds the fresh record, but this hook's `workspaces` snapshot
   * still predates the list revalidation, so the lookup would otherwise return
   * `null` and skip navigation.
   */
  switchWorkspace: (id: string, slug?: string) => Promise<void>;
}

const useWorkspaceSwitcher = (navigateOnSwitch: boolean): SwitchWorkspaceActions => {
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const workspaces = useWorkspaces();
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);

  /**
   * Every workspace-scoped SWR entry is keyed by the active workspace id
   * (`useClientDataSWR` augments keys), so dropping them is enough to force a
   * clean refetch for the new scope. The workspace list itself is not scoped
   * and must survive the switch.
   */
  const invalidateScopedData = useCallback(
    () =>
      mutate((key) => !(typeof key === 'string' && key === WORKSPACE_LIST_SWR_KEY), undefined, {
        revalidate: true,
      }),
    [mutate],
  );

  const switchWorkspace = useCallback(
    async (id: string, slugOverride?: string) => {
      const slug =
        slugOverride ?? workspaces.find((workspace) => workspace.id === id)?.slug ?? null;

      setActiveWorkspace(id, slug);
      await invalidateScopedData();

      if (navigateOnSwitch && slug) navigate(`/${slug}`);
    },
    [invalidateScopedData, navigate, navigateOnSwitch, setActiveWorkspace, workspaces],
  );

  const switchToPersonal = useCallback(async () => {
    setActiveWorkspace(null, null);
    await invalidateScopedData();

    if (navigateOnSwitch) navigate('/');
  }, [invalidateScopedData, navigate, navigateOnSwitch, setActiveWorkspace]);

  return { switchToPersonal, switchWorkspace };
};

/**
 * Workspace switch invoked from imperative call sites that represent an
 * explicit user choice (e.g. switcher click, wizard landing, accept-invite,
 * post-leave redirect).
 */
export const useSwitchWorkspace = (): SwitchWorkspaceActions => useWorkspaceSwitcher(true);

/**
 * Workspace switch invoked from passive reconciliation sources (e.g. URL
 * sync) where the active workspace is being aligned with external state
 * rather than chosen by the user. Must not navigate.
 */
export const useSilentSwitchWorkspace = (): SwitchWorkspaceActions => useWorkspaceSwitcher(false);
