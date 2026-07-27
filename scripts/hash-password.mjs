#!/usr/bin/env node
// Prints the SHA-256 hex digest of a password for use as VITE_AUTH_PASSWORD_HASH
// (see .env.local.example / README). Uses the same Web Crypto API the browser
// uses at login time, so the digest matches exactly.
import { webcrypto } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "your-password"');
  process.exit(1);
}

const bytes = new TextEncoder().encode(password);
const digest = await webcrypto.subtle.digest('SHA-256', bytes);
const hex = Array.from(new Uint8Array(digest))
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');

console.log(hex);
