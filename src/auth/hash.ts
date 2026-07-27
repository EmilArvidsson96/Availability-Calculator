// SHA-256 hex digest via Web Crypto (browser) — same algorithm used by
// scripts/hash-password.mjs, so hashes generated there match what this
// checks against at login time.
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
