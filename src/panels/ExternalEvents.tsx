import { useGraphStore } from '../store/useGraphStore';
import type { ExternalEvent } from '../types/model';
import { formatHours } from '../lib/format';

export function ExternalEvents() {
  const events = useGraphStore((s) => s.externalEvents);
  const setEvents = useGraphStore((s) => s.setExternalEvents);

  const update = (id: string, patch: Partial<ExternalEvent>) =>
    setEvents(events.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => setEvents(events.filter((e) => e.id !== id));
  const add = () =>
    setEvents([
      ...events,
      {
        id: `ext_${Date.now()}`,
        label: 'New external event',
        freqPerYear: 1,
        meanDurationHours: 4,
        includeInContractual: false,
      },
    ]);

  return (
    <div className="external">
      <div className="external__head">
        <span className="muted small">
          Grid / carrier outages, force majeure, planned maintenance. Excluded events drop out of the
          contractual figure but stay in the raw figure.
        </span>
      </div>
      <table className="external__table">
        <thead>
          <tr>
            <th>Event</th>
            <th>/yr</th>
            <th>Duration</th>
            <th title="Counts against the contractual (promised) availability?">Contract</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr key={ev.id}>
              <td>
                <input value={ev.label} onChange={(e) => update(ev.id, { label: e.target.value })} />
              </td>
              <td>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={ev.freqPerYear}
                  onChange={(e) => update(ev.id, { freqPerYear: parseFloat(e.target.value) })}
                />
              </td>
              <td>
                <input
                  type="number"
                  step={1}
                  min={0}
                  value={ev.meanDurationHours}
                  onChange={(e) => update(ev.id, { meanDurationHours: parseFloat(e.target.value) })}
                />
                <span className="muted small"> {formatHours(ev.meanDurationHours)}</span>
              </td>
              <td className="external__center">
                <input
                  type="checkbox"
                  checked={ev.includeInContractual}
                  onChange={(e) => update(ev.id, { includeInContractual: e.target.checked })}
                />
              </td>
              <td>
                <button className="icon-btn" onClick={() => remove(ev.id)} title="Remove">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn--ghost" onClick={add}>
        + Add external event
      </button>
    </div>
  );
}
