import { useEffect, useState } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { useSyncConfigStore, toSyncConfig } from '../lib/useSyncConfigStore';
import {
  listProjects,
  loadProject,
  saveProject,
  runDiagnostics,
  type RemoteProjectFile,
  type DiagnosticStep,
} from '../lib/githubSync';

export function PrivateDataPanel({ onClose }: { onClose: () => void }) {
  const owner = useSyncConfigStore((s) => s.owner);
  const repo = useSyncConfigStore((s) => s.repo);
  const branch = useSyncConfigStore((s) => s.branch);
  const token = useSyncConfigStore((s) => s.token);
  const setConfig = useSyncConfigStore((s) => s.setConfig);
  const cfg = toSyncConfig({ owner, repo, branch, token });
  const configReady = Boolean(owner && repo && branch && token);

  const exportJson = useGraphStore((s) => s.exportJson);
  const importJson = useGraphStore((s) => s.importJson);

  const [files, setFiles] = useState<RemoteProjectFile[]>([]);
  const [filename, setFilename] = useState('project.json');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticStep[] | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const runDiag = async () => {
    if (!token) return;
    setDiagnosing(true);
    try {
      setDiagnostics(await runDiagnostics(cfg));
    } finally {
      setDiagnosing(false);
    }
  };

  const refresh = async () => {
    if (!configReady) return;
    setBusy(true);
    setStatus(null);
    setDiagnostics(null);
    try {
      const list = await listProjects(cfg);
      setFiles(list);
      if (list.length === 0) setStatus({ kind: 'info', text: 'No project files found in projects/ yet.' });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      await runDiag();
    } finally {
      setBusy(false);
    }
  };

  // Load the file list once when the panel opens, if a token is already saved.
  // refresh() reads owner/repo/branch/token from the enclosing render, so this
  // intentionally does not re-run as those fields change.
  useEffect(() => {
    refresh();
  }, []);

  const doLoad = async (path: string) => {
    setBusy(true);
    setStatus(null);
    setDiagnostics(null);
    try {
      const json = await loadProject(cfg, path);
      importJson(json);
      setStatus({ kind: 'info', text: `Loaded ${path}.` });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      await runDiag();
    } finally {
      setBusy(false);
    }
  };

  const doSave = async () => {
    setBusy(true);
    setStatus(null);
    setDiagnostics(null);
    try {
      await saveProject(cfg, filename, exportJson());
      setStatus({ kind: 'info', text: `Saved to ${owner}/${repo}.` });
      await refresh();
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      await runDiag();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Private data</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <p className="muted small">
          Keep real project data — actual site configs, MTBF/MTTR figures, warranty numbers — out of
          this public app by storing it in your own private GitHub repo instead. The token and repo
          settings below are saved only in this browser's local storage and are sent only to
          api.github.com; they are never bundled into the app or committed anywhere.
        </p>

        <div className="field-row">
          <div className="field">
            <label className="field__label">Owner</label>
            <input value={owner} onChange={(e) => setConfig({ owner: e.target.value })} placeholder="EmilArvidsson96" />
          </div>
          <div className="field">
            <label className="field__label">Repo</label>
            <input value={repo} onChange={(e) => setConfig({ repo: e.target.value })} placeholder="availability-calculator-data" />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field__label">Branch</label>
            <input value={branch} onChange={(e) => setConfig({ branch: e.target.value })} placeholder="main" />
          </div>
          <div className="field">
            <label className="field__label">Personal access token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setConfig({ token: e.target.value })}
              placeholder="github_pat_…"
              autoComplete="off"
            />
          </div>
        </div>
        <p className="field__hint">
          Use a fine-grained token scoped to only this repo (Contents: Read and write) — create one at
          github.com → Settings → Developer settings → Personal access tokens. The repo needs at least
          one commit (e.g. created with a README) so its default branch exists.
        </p>

        <div className="modal__section">
          <div className="modal__section-head">
            <h4>Connection diagnostics</h4>
            <button className="btn btn--ghost" disabled={!token || diagnosing} onClick={runDiag}>
              {diagnosing ? 'Checking…' : 'Run diagnostics'}
            </button>
          </div>
          {diagnostics && (
            <ul className="diaglist">
              {diagnostics.map((d) => (
                <li key={d.name} className={d.ok ? 'diaglist__ok' : 'diaglist__fail'}>
                  <span className="diaglist__icon">{d.ok ? '✓' : '✗'}</span>
                  <div>
                    <strong>{d.name}</strong>
                    <p>{d.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {status && (
          <div className={`alert ${status.kind === 'error' ? 'alert--error' : 'alert--warn'}`}>{status.text}</div>
        )}

        <div className="modal__section">
          <div className="modal__section-head">
            <h4>Save current project</h4>
          </div>
          <div className="field-row">
            <input value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="project.json" />
            <button className="btn btn--primary" disabled={!configReady || busy} onClick={doSave}>
              Save to repo
            </button>
          </div>
        </div>

        <div className="modal__section">
          <div className="modal__section-head">
            <h4>Load a project</h4>
            <button className="btn btn--ghost" disabled={!configReady || busy} onClick={refresh}>
              Refresh
            </button>
          </div>
          {files.length === 0 && <p className="muted small">Nothing to show yet.</p>}
          <ul className="synclist">
            {files.map((f) => (
              <li key={f.path}>
                <span>{f.name}</span>
                <button className="btn btn--ghost" disabled={busy} onClick={() => doLoad(f.path)}>
                  Load
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
