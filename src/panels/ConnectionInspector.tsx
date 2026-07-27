import type { Edge } from '@xyflow/react';
import { useGraphStore } from '../store/useGraphStore';
import type { ConnectionReliability } from '../types/model';
import { getLayer, getReliability, type EdgeData } from '../lib/edges';
import { connectionAvailability } from '../engine/availability';
import { formatPercent, downtimePerYear } from '../lib/format';
import { NumberField } from './NumberField';

export function ConnectionInspector({ edge }: { edge: Edge }) {
  const updateEdgeData = useGraphStore((s) => s.updateEdgeData);
  const deleteEdge = useGraphStore((s) => s.deleteEdge);
  const nodes = useGraphStore((s) => s.nodes);

  const data = (edge.data ?? {}) as Partial<EdgeData>;
  const reliability = getReliability(edge);
  const layer = getLayer(edge);

  const set = (patch: Partial<EdgeData>) => updateEdgeData(edge.id, patch);
  const setReliability = (patch: Partial<ConnectionReliability>) =>
    set({ reliability: { ...reliability, ...patch } });

  const nodeLabel = (nodeId: string) => nodes.find((n) => n.id === nodeId)?.data.label ?? nodeId;
  const defaultName = `${nodeLabel(edge.source)} → ${nodeLabel(edge.target)}`;
  const availability = connectionAvailability(reliability);
  const effectiveMttr = Math.max(0, reliability.mttrHours - reliability.impactWindowHours);

  return (
    <div className="inspector">
      <div className="inspector__title">
        <input
          className="inspector__name"
          placeholder={defaultName}
          value={data.label ?? ''}
          onChange={(e) => set({ label: e.target.value })}
        />
        <span className="muted">{layer === 'electrical' ? '⚡ Electrical connection' : '📡 Communication connection'}</span>
      </div>

      <div className="inspector__result">
        <div>
          <span className="muted">Connection availability</span>
          <strong>{formatPercent(availability)}</strong>
        </div>
        <div>
          <span className="muted">Downtime</span>
          <strong>{downtimePerYear(availability)}</strong>
        </div>
      </div>

      <section className="inspector__section">
        <h4>
          <label className="check check--inline">
            <input
              type="checkbox"
              checked={reliability.enabled}
              onChange={(e) => setReliability({ enabled: e.target.checked })}
            />
            This connection can fail
          </label>
        </h4>
        <p className="field__hint">
          By default a connection is treated as perfect — only the components at each end fail. Enable this
          for a link that can genuinely go down on its own (a grid interconnection, a WAN/telecom circuit, a
          comms channel).
        </p>

        {reliability.enabled && (
          <>
            <NumberField
              label="MTBF"
              suffix="hours"
              value={reliability.mtbfHours}
              step={1000}
              min={1}
              onChange={(v) => setReliability({ mtbfHours: v })}
            />
            <NumberField
              label="MTTR"
              suffix="hours"
              value={reliability.mttrHours}
              step={0.5}
              min={0}
              onChange={(v) => setReliability({ mttrHours: v })}
              hint="Mean time to restore the connection once it fails."
            />
            <NumberField
              label="Hours without impact"
              suffix="hours"
              value={reliability.impactWindowHours}
              step={0.5}
              min={0}
              onChange={(v) => setReliability({ impactWindowHours: v })}
              hint="Grace window: if this connection fails, how long can the system ride through it — via local buffering, a backup path, or manual failover — before the outage starts counting against availability?"
            />
            <span className="field__hint">
              Only the repair time beyond the grace window counts as downtime — effective MTTR ={' '}
              {effectiveMttr.toFixed(2)}h.
            </span>
          </>
        )}
      </section>

      <button className="btn btn--danger" onClick={() => deleteEdge(edge.id)}>
        Delete connection
      </button>
    </div>
  );
}
