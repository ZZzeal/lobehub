import { create } from 'zustand';

const STORAGE_KEY = 'lobe-workspace-active';

interface StoredWorkspace {
  id: string | null;
  slug: string | null;
}

const EMPTY: StoredWorkspace = { id: null, slug: null };

const readStored = (): StoredWorkspace => {
  if (typeof window === 'undefined') return EMPTY;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<StoredWorkspace>;
    return { id: parsed.id ?? null, slug: parsed.slug ?? null };
  } catch {
    return EMPTY;
  }
};

const writeStored = (state: StoredWorkspace) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private mode, quota); in-memory state still works.
  }
};

interface WorkspaceStoreState {
  activeWorkspaceId: string | null;
  activeWorkspaceSlug: string | null;
  setActiveWorkspace: (id: string | null, slug: string | null) => void;
}

const initial = readStored();

/**
 * The active workspace lives outside the URL so imperative callers (tRPC
 * headers, tool executors) can read it synchronously. The URL remains the
 * source of truth — `useWorkspaceUrlSync` reconciles this store with the
 * `/:workspaceSlug` segment.
 */
export const useWorkspaceStore = create<WorkspaceStoreState>((set) => ({
  activeWorkspaceId: initial.id,
  activeWorkspaceSlug: initial.slug,

  setActiveWorkspace: (id, slug) => {
    set({ activeWorkspaceId: id, activeWorkspaceSlug: slug });
    writeStored({ id, slug });
  },
}));

export const getWorkspaceStoreState = () => useWorkspaceStore.getState();
