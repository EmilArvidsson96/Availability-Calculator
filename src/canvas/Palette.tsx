import { useState } from 'react';
import { CATALOG, SUBSYSTEMS, type ComponentTemplate } from '../data/componentLibrary';
import { useCatalogStore } from '../store/useCatalogStore';
import { NewComponentModal } from './NewComponentModal';

/** Left-hand palette of draggable BESS components, grouped by subsystem. */
export function Palette() {
  const [query, setQuery] = useState('');
  const [manageMode, setManageMode] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const q = query.trim().toLowerCase();

  const hiddenKinds = useCatalogStore((s) => s.hiddenKinds);
  const customComponents = useCatalogStore((s) => s.customComponents);
  const setHidden = useCatalogStore((s) => s.setHidden);
  const removeCustomComponent = useCatalogStore((s) => s.removeCustomComponent);
  const hidden = new Set(hiddenKinds);

  const allItems: ComponentTemplate[] = [...CATALOG, ...customComponents];

  const onDragStart = (e: React.DragEvent, kind: string) => {
    e.dataTransfer.setData('application/bess-kind', kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="palette">
      <div className="palette__search">
        <input
          type="text"
          placeholder="Search components…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="palette__toolbar">
        <button className={`btn btn--ghost ${manageMode ? 'active' : ''}`} onClick={() => setManageMode((m) => !m)}>
          {manageMode ? 'Done' : '⚙ Manage'}
        </button>
        <button className="btn btn--ghost" onClick={() => setShowNewModal(true)}>
          + New
        </button>
      </div>
      <p className="palette__notice">
        {manageMode
          ? 'Toggle any item to hide it from the palette, or remove a custom unit you created.'
          : 'Illustrative defaults — override every value per project from the datasheet, LTSA/TAG and SLD.'}
      </p>
      <div className="palette__groups">
        {SUBSYSTEMS.map((group) => {
          const items = allItems.filter((c) => {
            if (c.subsystem !== group.key) return false;
            if (!manageMode && hidden.has(c.kind)) return false;
            return !q || c.label.toLowerCase().includes(q) || c.kind.includes(q);
          });
          if (items.length === 0) return null;
          return (
            <div key={group.key} className="palette__group">
              <div className="palette__group-title" style={{ borderLeftColor: group.color }}>
                {group.label}
              </div>
              {items.map((c) => {
                const isHidden = hidden.has(c.kind);
                const isCustom = !CATALOG.some((b) => b.kind === c.kind);
                return (
                  <div
                    key={c.kind}
                    className={`palette__item ${isHidden ? 'palette__item--hidden' : ''}`}
                    draggable={!isHidden}
                    onDragStart={isHidden ? undefined : (e) => onDragStart(e, c.kind)}
                    title={c.hint}
                  >
                    <span className="palette__item-icon">{c.icon}</span>
                    <span className="palette__item-label">{c.label}</span>
                    <span className={`badge badge--${c.overrides.availabilitySource?.toLowerCase() ?? 'estimated'}`}>
                      {(c.overrides.availabilitySource ?? 'ESTIMATED').slice(0, 3)}
                    </span>
                    {manageMode && (
                      <span className="palette__item-actions">
                        <button
                          className="icon-btn"
                          title={isHidden ? 'Unhide' : 'Hide'}
                          onClick={() => setHidden(c.kind, !isHidden)}
                        >
                          {isHidden ? '👁' : '🚫'}
                        </button>
                        {isCustom && (
                          <button
                            className="icon-btn"
                            title="Delete custom component"
                            onClick={() => {
                              if (confirm(`Delete "${c.label}" from the palette?`)) removeCustomComponent(c.kind);
                            }}
                          >
                            🗑
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {showNewModal && <NewComponentModal onClose={() => setShowNewModal(false)} />}
    </aside>
  );
}
