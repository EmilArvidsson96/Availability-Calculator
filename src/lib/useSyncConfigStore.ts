import { create } from 'zustand';
import type { GithubSyncConfig } from './githubSync';

const STORAGE_KEY = 'bess-availability-calculator:github-sync';

interface StoredConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

// Pre-filled with the conventional private data repo so most users only
// need to paste in a token.
const DEFAULTS: StoredConfig = {
  owner: 'EmilArvidsson96',
  repo: 'availability-calculator-data',
  branch: 'main',
  token: '',
};

function load(): StoredConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<StoredConfig>) };
  } catch {
    /* ignore corrupt/unavailable storage, fall back to defaults */
  }
  return DEFAULTS;
}

function persist(cfg: StoredConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* storage may be unavailable; config just won't survive a reload */
  }
}

interface SyncConfigState extends StoredConfig {
  setConfig: (patch: Partial<StoredConfig>) => void;
}

export const useSyncConfigStore = create<SyncConfigState>((set, get) => ({
  ...load(),
  setConfig: (patch) => {
    const next = { ...get(), ...patch };
    persist({ owner: next.owner, repo: next.repo, branch: next.branch, token: next.token });
    set(patch);
  },
}));

export function toSyncConfig(state: StoredConfig): GithubSyncConfig {
  return { owner: state.owner, repo: state.repo, branch: state.branch, token: state.token };
}
