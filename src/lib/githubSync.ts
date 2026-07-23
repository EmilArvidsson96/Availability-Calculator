// Talks to the GitHub Contents API directly from the browser using a
// user-supplied personal access token — no backend involved. This is the
// same pattern used by browser-based Git editors (e.g. github.dev,
// Decap/Netlify CMS's GitHub backend): api.github.com supports CORS for
// token-authenticated requests, so a static site can read/write a repo's
// contents without a server in between.
//
// The token and repo config are supplied by the caller (read from
// localStorage — see PrivateDataPanel) and are never sent anywhere but
// api.github.com.

export interface GithubSyncConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export interface RemoteProjectFile {
  name: string;
  path: string;
  sha: string;
}

const API = 'https://api.github.com';
const PROJECTS_DIR = 'projects';

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes('Not Found');
}

async function ghFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      /* body wasn't JSON; keep the status text */
    }
    throw new Error(message);
  }
  return res;
}

/** Base64-encode UTF-8 text (btoa alone mishandles multi-byte characters). */
function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Inverse of encodeUtf8Base64 — GitHub wraps content with newlines, atob needs those stripped. */
function decodeUtf8Base64(base64: string): string {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/** Strip path separators and anything but the safe charset; always ends in .json. */
export function sanitizeFilename(name: string): string {
  const base = name.trim().replace(/[^a-zA-Z0-9-_. ]/g, '').replace(/\s+/g, '-');
  const cleaned = base.replace(/\.json$/i, '') || 'project';
  return `${cleaned}.json`;
}

export async function listProjects(cfg: GithubSyncConfig): Promise<RemoteProjectFile[]> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${PROJECTS_DIR}?ref=${encodeURIComponent(cfg.branch)}`;
  try {
    const res = await ghFetch(url, cfg.token);
    const items = (await res.json()) as Array<{ name: string; path: string; sha: string; type: string }>;
    return items
      .filter((i) => i.type === 'file' && i.name.toLowerCase().endsWith('.json'))
      .map((i) => ({ name: i.name, path: i.path, sha: i.sha }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    // A projects/ folder that doesn't exist yet is a normal starting state.
    if (isNotFound(err)) return [];
    throw err;
  }
}

export async function loadProject(cfg: GithubSyncConfig, path: string): Promise<string> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await ghFetch(url, cfg.token);
  const body = (await res.json()) as { content: string; encoding: string };
  if (body.encoding !== 'base64') throw new Error(`Unexpected content encoding: ${body.encoding}`);
  return decodeUtf8Base64(body.content);
}

export async function saveProject(cfg: GithubSyncConfig, filename: string, json: string): Promise<void> {
  const safeName = sanitizeFilename(filename);
  const path = `${PROJECTS_DIR}/${safeName}`;
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;

  let sha: string | undefined;
  try {
    const res = await ghFetch(`${url}?ref=${encodeURIComponent(cfg.branch)}`, cfg.token);
    ({ sha } = (await res.json()) as { sha: string });
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  await ghFetch(url, cfg.token, {
    method: 'PUT',
    body: JSON.stringify({
      message: `${sha ? 'Update' : 'Add'} ${safeName} via BESS Availability Calculator`,
      content: encodeUtf8Base64(json),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    }),
  });
}
