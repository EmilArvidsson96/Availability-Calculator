import { useState } from 'react';
import { CATALOG, SUBSYSTEMS } from '../data/componentLibrary';

/** Left-hand palette of draggable BESS components, grouped by subsystem. */
export function Palette() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

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
      <p className="palette__notice">
        Illustrative defaults — override every value per project from the datasheet, LTSA/TAG and SLD.
      </p>
      <div className="palette__groups">
        {SUBSYSTEMS.map((group) => {
          const items = CATALOG.filter(
            (c) => c.subsystem === group.key && (!q || c.label.toLowerCase().includes(q) || c.kind.includes(q)),
          );
          if (items.length === 0) return null;
          return (
            <div key={group.key} className="palette__group">
              <div className="palette__group-title" style={{ borderLeftColor: group.color }}>
                {group.label}
              </div>
              {items.map((c) => (
                <div
                  key={c.kind}
                  className="palette__item"
                  draggable
                  onDragStart={(e) => onDragStart(e, c.kind)}
                  title={c.hint}
                >
                  <span className="palette__item-icon">{c.icon}</span>
                  <span className="palette__item-label">{c.label}</span>
                  <span className={`badge badge--${c.overrides.availabilitySource?.toLowerCase() ?? 'estimated'}`}>
                    {(c.overrides.availabilitySource ?? 'ESTIMATED').slice(0, 3)}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
