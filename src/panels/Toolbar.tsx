import { useRef, useState } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { AUTH_ENABLED, useAuthStore } from '../auth/useAuthStore';
import { PrivateDataPanel } from './PrivateDataPanel';

export function Toolbar() {
  const exportJson = useGraphStore((s) => s.exportJson);
  const importJson = useGraphStore((s) => s.importJson);
  const newProject = useGraphStore((s) => s.newProject);
  const loadExample = useGraphStore((s) => s.loadExample);
  const logout = useAuthStore((s) => s.logout);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showSync, setShowSync] = useState(false);

  const doExport = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bess-availability-model.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importJson(String(reader.result));
      } catch (err) {
        alert(`Could not import file: ${err instanceof Error ? err.message : err}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__logo">🔋</span>
        <div>
          <strong>BESS Availability Calculator</strong>
          <span className="toolbar__tag">topology → confidence-bounded availability</span>
        </div>
      </div>
      <div className="toolbar__actions">
        <button className="btn btn--ghost" onClick={() => { if (confirm('Start an empty model?')) newProject(); }}>
          New
        </button>
        <button className="btn btn--ghost" onClick={() => { if (confirm('Replace the current model with the example site?')) loadExample(); }}>
          Load example
        </button>
        <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <button className="btn btn--ghost" onClick={doExport}>
          Export
        </button>
        <button className="btn btn--ghost" onClick={() => setShowSync(true)}>
          Private data
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) doImport(f);
            e.target.value = '';
          }}
        />
        {AUTH_ENABLED && (
          <button className="btn btn--ghost" onClick={logout}>
            Log out
          </button>
        )}
      </div>
      {showSync && <PrivateDataPanel onClose={() => setShowSync(false)} />}
    </header>
  );
}
