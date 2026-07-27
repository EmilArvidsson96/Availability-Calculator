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

export interface DiagnosticStep {
  name: string;
  ok: boolean;
  detail: string;
}

const API = 'https://api.github.com';
const PROJECTS_DIR = 'projects';

/** Copy-pasted tokens/owners/repos routinely carry a stray leading/trailing space or newline. */
function trimCfg(cfg: GithubSyncConfig): GithubSyncConfig {
  return {
    owner: cfg.owner.trim(),
    repo: cfg.repo.trim(),
    branch: cfg.branch.trim(),
    token: cfg.token.trim(),
  };
}

function authHeaders(token: string): Record<string, string> {
  // GitHub's REST API (as opposed to Bearer-only surfaces like the GraphQL API
  // or GitHub App installation tokens) expects the classic "token" scheme for
  // personal access tokens — both classic (ghp_…) and fine-grained
  // (github_pat_…). "Bearer" is not reliably accepted here.
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes('404');
}

/** A message for when fetch() itself threw — no response was ever received. */
function networkErrorDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    `The request never got a response from GitHub (${msg}). That usually means something on this ` +
    `machine or network blocked it outright — an ad-blocker/privacy extension, a corporate proxy or ` +
    `firewall, or being offline — rather than GitHub rejecting the token. Check the Network tab in ` +
    `dev tools for a request to api.github.com and see how it failed.`
  );
}

async function safeJsonMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { message?: string };
    return body?.message;
  } catch {
    return undefined;
  }
}

async function ghFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...authHeaders(token), ...(init?.headers ?? {}) },
    });
  } catch (err) {
    throw new Error(networkErrorDetail(err));
  }
  if (!res.ok) {
    const ghMessage = await safeJsonMessage(res);
    throw new Error(`${res.status} ${ghMessage ?? res.statusText}`);
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

export async function listProjects(rawCfg: GithubSyncConfig): Promise<RemoteProjectFile[]> {
  const cfg = trimCfg(rawCfg);
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

export async function loadProject(rawCfg: GithubSyncConfig, path: string): Promise<string> {
  const cfg = trimCfg(rawCfg);
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await ghFetch(url, cfg.token);
  const body = (await res.json()) as { content: string; encoding: string };
  if (body.encoding !== 'base64') throw new Error(`Unexpected content encoding: ${body.encoding}`);
  return decodeUtf8Base64(body.content);
}

export async function saveProject(rawCfg: GithubSyncConfig, filename: string, json: string): Promise<void> {
  const cfg = trimCfg(rawCfg);
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

/**
 * Runs a sequence of independent checks against the configured token/repo and
 * reports exactly where things break down, instead of surfacing one opaque
 * error from whatever the app happened to call first.
 */
export async function runDiagnostics(rawCfg: GithubSyncConfig): Promise<DiagnosticStep[]> {
  const cfg = trimCfg(rawCfg);
  const steps: DiagnosticStep[] = [];

  if (!cfg.token) {
    steps.push({ name: 'Token present', ok: false, detail: 'No token entered.' });
    return steps;
  }
  const looksLikeToken = /^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/.test(cfg.token);
  const wasTrimmed = cfg.token !== rawCfg.token;
  steps.push({
    name: 'Token format',
    ok: looksLikeToken,
    detail: looksLikeToken
      ? `Looks like a GitHub token (${cfg.token.slice(0, 12)}…).${wasTrimmed ? ' Note: it had leading/trailing whitespace — probably from copy-paste; trimmed automatically.' : ''}`
      : `Doesn't look like a GitHub personal access token (expected a "ghp_…" or "github_pat_…" prefix). Got "${cfg.token.slice(0, 12)}…" — double check what was pasted into the field.`,
  });

  // Does the token authenticate at all, independent of any repo config?
  try {
    const res = await fetch(`${API}/user`, { headers: authHeaders(cfg.token) });
    if (res.ok) {
      const body = (await res.json()) as { login: string };
      steps.push({ name: 'Token authenticates', ok: true, detail: `Valid — GitHub sees this as user "${body.login}".` });
    } else {
      const msg = await safeJsonMessage(res);
      steps.push({
        name: 'Token authenticates',
        ok: false,
        detail: `GitHub rejected it: ${res.status} ${msg ?? res.statusText}. The token is likely wrong, expired, or revoked — generate a new one.`,
      });
    }
  } catch (err) {
    steps.push({ name: 'Token authenticates', ok: false, detail: networkErrorDetail(err) });
  }

  // Can this token see the target repo at all?
  let defaultBranch: string | undefined;
  try {
    const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}`, { headers: authHeaders(cfg.token) });
    if (res.ok) {
      const body = (await res.json()) as { default_branch: string; private: boolean; size: number };
      defaultBranch = body.default_branch;
      steps.push({
        name: 'Repo reachable',
        ok: true,
        detail:
          `Found ${cfg.owner}/${cfg.repo} (${body.private ? 'private' : 'public'}, default branch ` +
          `"${body.default_branch}")${body.size === 0 ? ' — repo is empty, no commits yet' : ''}.`,
      });
    } else {
      const msg = await safeJsonMessage(res);
      steps.push({
        name: 'Repo reachable',
        ok: false,
        detail:
          `${res.status} ${msg ?? res.statusText} for "${cfg.owner}/${cfg.repo}". Check Owner/Repo are spelled ` +
          `exactly right, and — if this is a fine-grained token — that it's explicitly scoped to include this ` +
          `repository (not just created for "all repositories" under a different account).`,
      });
    }
  } catch (err) {
    steps.push({ name: 'Repo reachable', ok: false, detail: networkErrorDetail(err) });
  }

  if (defaultBranch && defaultBranch !== cfg.branch) {
    steps.push({
      name: 'Branch matches',
      ok: false,
      detail: `Configured branch is "${cfg.branch}" but the repo's actual default branch is "${defaultBranch}". Update the Branch field.`,
    });
  }

  // The actual thing the app needs day-to-day.
  try {
    const res = await fetch(
      `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${PROJECTS_DIR}?ref=${encodeURIComponent(cfg.branch)}`,
      { headers: authHeaders(cfg.token) },
    );
    if (res.ok) {
      steps.push({ name: 'projects/ folder', ok: true, detail: 'Found and readable.' });
    } else if (res.status === 404) {
      steps.push({
        name: 'projects/ folder',
        ok: true,
        detail: `Doesn't exist yet on branch "${cfg.branch}" — that's fine, it's created automatically the first time you save.`,
      });
    } else {
      const msg = await safeJsonMessage(res);
      steps.push({ name: 'projects/ folder', ok: false, detail: `${res.status} ${msg ?? res.statusText}.` });
    }
  } catch (err) {
    steps.push({ name: 'projects/ folder', ok: false, detail: networkErrorDetail(err) });
  }

  return steps;
}
