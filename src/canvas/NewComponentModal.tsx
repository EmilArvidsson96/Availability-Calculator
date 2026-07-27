import { useState } from 'react';
import type { AvailabilitySource, ComponentData, Subsystem } from '../types/model';
import { SUBSYSTEMS, type ComponentTemplate } from '../data/componentLibrary';
import { useCatalogStore, nextCustomKind } from '../store/useCatalogStore';

const SOURCE_OPTIONS: { value: AvailabilitySource; label: string }[] = [
  { value: 'ESTIMATED', label: 'Estimated' },
  { value: 'WARRANTED', label: 'Warranted' },
  { value: 'SLA', label: 'SLA' },
];

export interface NewComponentSeed {
  label?: string;
  subsystem?: Subsystem;
  icon?: string;
  hint?: string;
  data?: Partial<ComponentData>;
}

interface FormState {
  label: string;
  subsystem: Subsystem;
  icon: string;
  hint: string;
  availabilitySource: AvailabilitySource;
  mtbfHours: number;
  mttrHours: number;
  warrantedAvailability: number;
  slaAdjustment: number;
  redundancyN: number;
  redundancyK: number;
  isElectricalSource: boolean;
  isDeliverySink: boolean;
  isControlSource: boolean;
  spof: boolean;
}

function formFrom(seed?: NewComponentSeed): FormState {
  const d = seed?.data;
  return {
    label: seed?.label ?? '',
    subsystem: seed?.subsystem ?? 'aggregated',
    icon: seed?.icon ?? '⭐',
    hint: seed?.hint ?? '',
    availabilitySource: d?.availabilitySource ?? 'ESTIMATED',
    mtbfHours: d?.mtbfHours ?? 100000,
    mttrHours: d?.mttrHours ?? 24,
    warrantedAvailability: d?.warrantedAvailability ?? 0.99,
    slaAdjustment: d?.slaAdjustment ?? 0.98,
    redundancyN: d?.redundancyN ?? 1,
    redundancyK: d?.redundancyK ?? 1,
    isElectricalSource: d?.isElectricalSource ?? false,
    isDeliverySink: d?.isDeliverySink ?? false,
    isControlSource: d?.isControlSource ?? false,
    spof: d?.spof ?? false,
  };
}

/** Modal for creating a custom, reusable palette component (a "unit"). */
export function NewComponentModal({ onClose, seed }: { onClose: () => void; seed?: NewComponentSeed }) {
  const addCustomComponent = useCatalogStore((s) => s.addCustomComponent);
  const [form, setForm] = useState<FormState>(() => formFrom(seed));
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const save = () => {
    const label = form.label.trim();
    if (!label) return;
    const overrides: ComponentTemplate['overrides'] = {
      availabilitySource: form.availabilitySource,
      redundancyN: Math.max(1, Math.round(form.redundancyN)),
      redundancyK: Math.max(1, Math.round(form.redundancyK)),
      isElectricalSource: form.isElectricalSource,
      isDeliverySink: form.isDeliverySink,
      isControlSource: form.isControlSource,
      spof: form.spof,
    };
    if (form.availabilitySource === 'ESTIMATED') {
      overrides.mtbfHours = form.mtbfHours;
      overrides.mttrHours = form.mttrHours;
    } else if (form.availabilitySource === 'WARRANTED') {
      overrides.warrantedAvailability = form.warrantedAvailability;
    } else {
      overrides.warrantedAvailability = form.warrantedAvailability;
      overrides.slaAdjustment = form.slaAdjustment;
    }
    addCustomComponent({
      kind: nextCustomKind(label),
      label,
      subsystem: form.subsystem,
      icon: form.icon.trim() || '⭐',
      hint: form.hint.trim(),
      overrides,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>New palette component</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <p className="muted small">
          Define a reusable unit for the left-hand palette — your own aggregated block or any equipment
          not already in the catalog. You can still fine-tune every value per instance after dropping it.
        </p>

        <div className="field-row">
          <div className="field">
            <span className="field__label">Name</span>
            <input value={form.label} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. MV Block" autoFocus />
          </div>
          <div className="field">
            <span className="field__label">Icon (emoji)</span>
            <input value={form.icon} onChange={(e) => set({ icon: e.target.value })} placeholder="⭐" maxLength={4} />
          </div>
        </div>

        <div className="field">
          <span className="field__label">Group</span>
          <select value={form.subsystem} onChange={(e) => set({ subsystem: e.target.value as Subsystem })}>
            {SUBSYSTEMS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <span className="field__label">Hint (shown on hover)</span>
          <textarea
            value={form.hint}
            onChange={(e) => set({ hint: e.target.value })}
            rows={2}
            placeholder="What this block represents and when to use it…"
          />
        </div>

        <section className="inspector__section">
          <h4>Default availability source</h4>
          <div className="segmented">
            {SOURCE_OPTIONS.map((o) => (
              <button key={o.value} className={form.availabilitySource === o.value ? 'active' : ''} onClick={() => set({ availabilitySource: o.value })}>
                {o.label}
              </button>
            ))}
          </div>

          {form.availabilitySource === 'ESTIMATED' && (
            <div className="field-row">
              <div className="field">
                <span className="field__label">MTBF (hours)</span>
                <input type="number" value={form.mtbfHours} min={1} step={1000} onChange={(e) => set({ mtbfHours: parseFloat(e.target.value) })} />
              </div>
              <div className="field">
                <span className="field__label">MTTR (hours)</span>
                <input type="number" value={form.mttrHours} min={0} step={1} onChange={(e) => set({ mttrHours: parseFloat(e.target.value) })} />
              </div>
            </div>
          )}

          {(form.availabilitySource === 'WARRANTED' || form.availabilitySource === 'SLA') && (
            <div className="field-row">
              <div className="field">
                <span className="field__label">{form.availabilitySource === 'SLA' ? 'SLA' : 'Guaranteed'} availability (%)</span>
                <input
                  type="number"
                  value={form.warrantedAvailability * 100}
                  min={0}
                  max={100}
                  step={0.01}
                  onChange={(e) => set({ warrantedAvailability: parseFloat(e.target.value) / 100 })}
                />
              </div>
              {form.availabilitySource === 'SLA' && (
                <div className="field">
                  <span className="field__label">Adjustment factor</span>
                  <input type="number" value={form.slaAdjustment} min={0} step={0.01} onChange={(e) => set({ slaAdjustment: parseFloat(e.target.value) })} />
                </div>
              )}
            </div>
          )}
        </section>

        {form.availabilitySource === 'ESTIMATED' && (
          <section className="inspector__section">
            <h4>Redundancy (k-of-n identical units)</h4>
            <div className="field-row">
              <div className="field">
                <span className="field__label">Units (n)</span>
                <input type="number" value={form.redundancyN} min={1} step={1} onChange={(e) => set({ redundancyN: parseFloat(e.target.value) })} />
              </div>
              <div className="field">
                <span className="field__label">Required (k)</span>
                <input type="number" value={form.redundancyK} min={1} step={1} onChange={(e) => set({ redundancyK: parseFloat(e.target.value) })} />
              </div>
            </div>
          </section>
        )}

        <section className="inspector__section">
          <h4>Network role</h4>
          <label className="check"><input type="checkbox" checked={form.isElectricalSource} onChange={(e) => set({ isElectricalSource: e.target.checked })} /> Electrical source (energy origin)</label>
          <label className="check"><input type="checkbox" checked={form.isDeliverySink} onChange={(e) => set({ isDeliverySink: e.target.checked })} /> Delivery point (grid connection / sink)</label>
          <label className="check"><input type="checkbox" checked={form.isControlSource} onChange={(e) => set({ isControlSource: e.target.checked })} /> Control source (controller on comms layer)</label>
          <label className="check"><input type="checkbox" checked={form.spof} onChange={(e) => set({ spof: e.target.checked })} /> Flag as single point of failure</label>
        </section>

        <button className="btn btn--primary" disabled={!form.label.trim()} onClick={save}>
          Add to palette
        </button>
      </div>
    </div>
  );
}
