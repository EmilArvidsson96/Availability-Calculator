/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Expected username for the login gate. Empty/unset disables the gate entirely. */
  readonly VITE_AUTH_USERNAME: string;
  /** SHA-256 hex digest of the login password — generate with `npm run hash-password`. */
  readonly VITE_AUTH_PASSWORD_HASH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
