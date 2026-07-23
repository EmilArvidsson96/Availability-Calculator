import { create } from 'zustand';
import { sha256Hex } from './hash';

const SESSION_KEY = 'bess-availability-calculator:auth';

const configuredUsername = import.meta.env.VITE_AUTH_USERNAME ?? '';
const configuredHash = import.meta.env.VITE_AUTH_PASSWORD_HASH ?? '';

/**
 * With no hash configured there is nothing to check credentials against, so
 * the gate is disabled outright (local dev without a .env.local behaves like
 * the app did before this feature existed).
 */
export const AUTH_ENABLED = configuredHash.length > 0;

// The "session proof" is the expected hash itself, not just a boolean — so
// rotating VITE_AUTH_PASSWORD_HASH invalidates every previously-stored login.
function hasStoredSession(): boolean {
  if (!AUTH_ENABLED) return true;
  try {
    return localStorage.getItem(SESSION_KEY) === configuredHash;
  } catch {
    return false;
  }
}

interface AuthState {
  isAuthed: boolean;
  checking: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthed: hasStoredSession(),
  checking: false,
  error: null,

  login: async (username, password) => {
    set({ checking: true, error: null });
    const hash = await sha256Hex(password);
    const ok = username === configuredUsername && hash === configuredHash;
    if (ok) {
      try {
        localStorage.setItem(SESSION_KEY, configuredHash);
      } catch {
        /* storage may be unavailable; session just won't survive a reload */
      }
      set({ isAuthed: true, checking: false, error: null });
    } else {
      set({ checking: false, error: 'Incorrect username or password.' });
    }
  },

  logout: () => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    set({ isAuthed: false });
  },
}));
