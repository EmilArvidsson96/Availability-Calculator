import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ComponentData } from '../types/model';
import type { CompNode } from '../data/example';
import { useGraphStore } from '../store/useGraphStore';
import { SUBSYSTEM_COLOR } from '../data/componentLibrary';
import { resolveTemplate } from '../store/useCatalogStore';
import { availabilityColor, formatPercent } from '../lib/format';

const SOURCE_BADGE: Record<ComponentData['availabilitySource'], string> = {
  WARRANTED: 'WAR',
  ESTIMATED: 'EST',
  SLA: 'SLA',
};

function ComponentNodeImpl({ id, data, selected }: NodeProps<CompNode>) {
  const d: ComponentData = data;
  const result = useGraphStore((s) => s.componentResults[id]);
  const accent = SUBSYSTEM_COLOR[d.subsystem];
  const icon = resolveTemplate(d.kind)?.icon ?? '⬛';
  const availability = result?.availability;
  const critical = result?.critical;

  const handleStyle = { width: 9, height: 9, background: '#475569', border: '2px solid #fff' };

  return (
    <div
      className={`node ${selected ? 'node--selected' : ''} ${critical ? 'node--critical' : ''}`}
      style={{ borderLeftColor: accent }}
      title={resolveTemplate(d.kind)?.hint}
    >
      <Handle type="source" position={Position.Left} id="l" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="r" style={handleStyle} />
      <Handle type="source" position={Position.Top} id="t" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="b" style={handleStyle} />

      <div className="node__head">
        <span className="node__icon">{icon}</span>
        <span className="node__label">{d.label}</span>
      </div>
      <div className="node__meta">
        <span className={`badge badge--${d.availabilitySource.toLowerCase()}`}>{SOURCE_BADGE[d.availabilitySource]}</span>
        {d.redundancyN > 1 && (
          <span className="badge badge--redundancy">
            {d.redundancyK}/{d.redundancyN}
          </span>
        )}
        {d.spof && <span className="badge badge--spof">SPOF</span>}
        {d.isElectricalSource && <span className="badge badge--role">SRC</span>}
        {d.isDeliverySink && <span className="badge badge--role">SINK</span>}
        {d.isControlSource && <span className="badge badge--role">CTRL</span>}
      </div>
      {availability !== undefined && (
        <div className="node__avail" style={{ color: availabilityColor(availability) }}>
          <span className="node__dot" style={{ background: availabilityColor(availability) }} />
          {formatPercent(availability)}
        </div>
      )}
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeImpl);
