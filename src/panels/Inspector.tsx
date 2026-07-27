import { useState } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import type { AvailabilitySource, ComponentData, ControlMode } from '../types/model';
import { componentPointAvailability, componentAvailabilityLowerBound } from '../engine/availability';
import { formatPercent, downtimePerYear } from '../lib/format';
import { SUBSYSTEM_LABEL } from '../data/componentLibrary';
import { NewComponentModal } from '../canvas/NewComponentModal';
import { NumberField } from './NumberField';
import { ConnectionInspector } from './ConnectionInspector';

const SOURCE_OPTIONS: { value: AvailabilitySource; label: string }[] = [
  { value: 'ESTIMATED', label: 'Estimated' },
  { value: 'WARRANTED', label: 'Warranted' },
  { value: 'SLA', label: 'SLA' },
];

const CONFIDENCE_PRESETS = [
  { label: 'Low (3)', value: 3 },
  { label: 'Medium (10)', value: 10 },
  { label: 'High (30)', value: 30 },
];

export function Inspector() {
  const id = useGraphStore((s) => s.selectedId);
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === id));
  const edge = useGraphStore((s) => s.edges.find((e) => e.id === id));
  const selectedCount = useGraphStore((s) => s.nodes.filter((n) => n.selected).length);
  const update = useGraphStore((s) => s.updateNodeData);
  const remove = useGraphStore((s) => s.deleteSelected);
  const confidence = useGraphStore((s) => s.simSettings.confidence);
  const [showSaveAs, setShowSaveAs] = useState(false);

  if (!node) {
    if (edge) return <ConnectionInspector edge={edge} />;
    if (selectedCount > 1) {
      return (
        <div className="inspector inspector--empty">
          <p>{selectedCount} components selected.</p>
          <p className="muted">Press Ctrl/Cmd+C to copy, Ctrl/Cmd+V to paste, or Delete to remove them.</p>
          <button className="btn btn--danger" onClick={remove}>
            Delete {selectedCount} components
          </button>
        </div>
      );
    }
    return (
      <div className="inspector inspector--empty">
        <p>Select a component or connection to edit its reliability inputs.</p>
        <p className="muted">Drag components from the left palette onto the canvas, then draw electrical and communication links between them. Click a connection to give it its own failure model. Drag-select with the left mouse button to mark several at once; pan by dragging with the right button.</p>
      </div>
    );
  }

  const d = node.data as ComponentData;
  const set = (patch: Partial<ComponentData>) => update(node.id, patch);
  const point = componentPointAvailability(d);
  const lower = componentAvailabilityLowerBound(d, confidence);

  return (
    <div className="inspector">
      <div className="inspector__title">
        <input
          className="inspector__name"
          value={d.label}
          onChange={(e) => set({ label: e.target.value })}
        />
        <span className="muted">{SUBSYSTEM_LABEL[d.subsystem]}</span>
      </div>

      <div className="inspector__result">
        <div>
          <span className="muted">Block availability</span>
          <strong>{formatPercent(point)}</strong>
        </div>
        <div>
          <span className="muted">Lower bound @ {Math.round(confidence * 100)}%</span>
          <strong>{formatPercent(lower)}</strong>
        </div>
        <div>
          <span className="muted">Downtime</span>
          <strong>{downtimePerYear(point)}</strong>
        </div>
      </div>

      <section className="inspector__section">
        <h4>Availability source</h4>
        <div className="segmented">
          {SOURCE_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={d.availabilitySource === o.value ? 'active' : ''}
              onClick={() => set({ availabilitySource: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>

        {d.availabilitySource === 'ESTIMATED' && (
          <>
            <NumberField label="MTBF" suffix="hours" value={d.mtbfHours} step={1000} min={1} onChange={(v) => set({ mtbfHours: v })} />
            <NumberField label="MTTR" suffix="hours" value={d.mttrHours} step={1} min={0} onChange={(v) => set({ mttrHours: v })} hint="Mean time to repair/restore. Long for lead-time items (transformers)." />
            <div className="field">
              <span className="field__label">Data confidence (effective failures observed)</span>
              <div className="segmented segmented--sm">
                {CONFIDENCE_PRESETS.map((p) => (
                  <button key={p.value} className={d.effectiveFailures === p.value ? 'active' : ''} onClick={() => set({ effectiveFailures: p.value })}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input type="number" value={d.effectiveFailures} min={1} step={1} onChange={(e) => set({ effectiveFailures: parseFloat(e.target.value) })} />
              <span className="field__hint">Fewer observed failures ⇒ wider uncertainty ⇒ a lower promised bound.</span>
            </div>
            <NumberField label="MTTR uncertainty (log σ)" value={d.mttrLogSigma} step={0.05} min={0} onChange={(v) => set({ mttrLogSigma: v })} hint="Spread of repair time. Repair times are lognormal — higher σ = heavier tail." />
          </>
        )}

        {d.availabilitySource === 'WARRANTED' && (
          <NumberField
            label="Guaranteed availability"
            suffix="%"
            value={d.warrantedAvailability * 100}
            step={0.01}
            min={0}
            onChange={(v) => set({ warrantedAvailability: v / 100 })}
            hint="Contractual lower bound from the supplier LTSA / TAG. Confirm its definition & exclusions."
          />
        )}

        {d.availabilitySource === 'SLA' && (
          <>
            <NumberField label="SLA availability" suffix="%" value={d.warrantedAvailability * 100} step={0.001} min={0} onChange={(v) => set({ warrantedAvailability: v / 100 })} />
            <NumberField label="Adjustment factor" value={d.slaAdjustment} step={0.01} min={0} onChange={(v) => set({ slaAdjustment: v })} hint="Derate the headline SLA for exclusions (throttling, maintenance, correlated outages)." />
          </>
        )}
      </section>

      {d.availabilitySource === 'ESTIMATED' && (
        <section className="inspector__section">
          <h4>Redundancy (k-of-n identical units)</h4>
          <div className="field-row">
            <NumberField label="Units (n)" value={d.redundancyN} step={1} min={1} onChange={(v) => set({ redundancyN: Math.max(1, Math.round(v)) })} />
            <NumberField label="Required (k)" value={d.redundancyK} step={1} min={1} onChange={(v) => set({ redundancyK: Math.max(1, Math.round(v)) })} />
          </div>
          <span className="field__hint">e.g. n=3, k=2 models a triple-redundant cooling skid that tolerates one failure.</span>
        </section>
      )}

      <section className="inspector__section">
        <h4>Network role</h4>
        <label className="check"><input type="checkbox" checked={d.isElectricalSource} onChange={(e) => set({ isElectricalSource: e.target.checked })} /> Electrical source (energy origin)</label>
        <label className="check"><input type="checkbox" checked={d.isDeliverySink} onChange={(e) => set({ isDeliverySink: e.target.checked })} /> Delivery point (grid connection / sink)</label>
        <label className="check"><input type="checkbox" checked={d.isControlSource} onChange={(e) => set({ isControlSource: e.target.checked })} /> Control source (controller on comms layer)</label>
        <label className="field">
          <span className="field__label">Communication impact</span>
          <select value={d.controlMode} onChange={(e) => set({ controlMode: e.target.value as ControlMode })}>
            <option value="delivery">In series for energy delivery</option>
            <option value="dispatch-only">Dispatch / revenue only</option>
            <option value="monitoring">Monitoring only (rides through)</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={d.spof} onChange={(e) => set({ spof: e.target.checked })} /> Flag as single point of failure</label>
      </section>

      <section className="inspector__section">
        <h4>
          <label className="check check--inline">
            <input type="checkbox" checked={d.software.enabled} onChange={(e) => set({ software: { ...d.software, enabled: e.target.checked } })} />
            Hosted software / firmware
          </label>
        </h4>
        {d.software.enabled && (
          <>
            <NumberField label="Software failures" suffix="/year" value={d.software.failuresPerYear} step={0.5} min={0} onChange={(v) => set({ software: { ...d.software, failuresPerYear: v } })} />
            <NumberField label="Watchdog coverage" value={d.software.watchdogCoverage} step={0.01} min={0} onChange={(v) => set({ software: { ...d.software, watchdogCoverage: v } })} hint="Fraction of faults auto-recovered without a full outage (0–1)." />
            <div className="field-row">
              <NumberField label="Auto-recover" suffix="h" value={d.software.mttrAutoHours} step={0.05} min={0} onChange={(v) => set({ software: { ...d.software, mttrAutoHours: v } })} />
              <NumberField label="Full reboot" suffix="h" value={d.software.mttrRebootHours} step={0.25} min={0} onChange={(v) => set({ software: { ...d.software, mttrRebootHours: v } })} />
            </div>
            <NumberField label="Planned patching" suffix="h/year" value={d.software.plannedPatchHoursPerYear} step={1} min={0} onChange={(v) => set({ software: { ...d.software, plannedPatchHoursPerYear: v } })} />
          </>
        )}
      </section>

      <button className="btn btn--ghost" onClick={() => setShowSaveAs(true)}>
        Save as new palette item…
      </button>
      <button className="btn btn--danger" onClick={remove}>
        Delete component
      </button>

      {showSaveAs && (
        <NewComponentModal
          onClose={() => setShowSaveAs(false)}
          seed={{ label: `${d.label} (custom)`, subsystem: d.subsystem, data: d }}
        />
      )}
    </div>
  );
}
