// A starter BESS site so the canvas is non-empty on first load.
// The electrical layer is a reliability block diagram (series dependency chain
// with the cooling + aux as required supports); the communication layer shows the
// delivery-critical control path plus dispatch-only cloud links.

import type { Edge, Node } from '@xyflow/react';
import { instantiate } from './componentLibrary';
import { makeEdge } from '../lib/edges';
import type { ComponentData, ExternalEvent } from '../types/model';

export type CompNode = Node<ComponentData>;

let seq = 0;
const nid = () => `n${++seq}`;

function node(kind: string, x: number, y: number, patch: Partial<ComponentData> = {}): CompNode {
  return {
    id: nid(),
    type: 'component',
    position: { x, y },
    data: { ...instantiate(kind), ...patch, software: { ...instantiate(kind).software, ...(patch.software ?? {}) } },
  };
}

export function buildExample(): { nodes: CompNode[]; edges: Edge[]; externalEvents: ExternalEvent[] } {
  seq = 0;
  const X0 = 40;
  const DX = 190;
  const yElec = 140;
  const yComms = 380;
  const yCloud = 600;

  // Electrical reliability chain (left -> right).
  const aux = node('aux-ups', X0, yElec, { isElectricalSource: true });
  const hvac = node('hvac', X0 + DX, yElec);
  const rack = node('battery-rack', X0 + DX * 2, yElec, { isElectricalSource: false });
  const bms = node('bms-master', X0 + DX * 3, yElec);
  const combiner = node('dc-combiner', X0 + DX * 4, yElec);
  const pcs = node('pcs-string', X0 + DX * 5, yElec);
  const lv = node('lv-switchgear', X0 + DX * 6, yElec);
  const tx = node('transformer', X0 + DX * 7, yElec);
  const mv = node('mv-switchgear', X0 + DX * 8, yElec);
  const grid = node('grid-connection', X0 + DX * 9, yElec, { isDeliverySink: true });

  const elecChain = [aux, hvac, rack, bms, combiner, pcs, lv, tx, mv, grid];

  // Delivery-critical control path.
  const ems = node('ems-ppc', X0 + DX * 5, yComms, { isControlSource: true });
  const sw = node('network-switch', X0 + DX * 6.5, yComms);
  const gw = node('comms-gateway', X0 + DX * 8, yComms);

  // Dispatch-only cloud links (do not affect energy delivery).
  const cloud = node('cloud-ems', X0 + DX * 3, yCloud);
  const wan = node('wan', X0 + DX * 4.2, yCloud);
  const market = node('market-api', X0 + DX * 1.8, yCloud);

  const nodes = [...elecChain, ems, sw, gw, cloud, wan, market];

  let e = 0;
  const eid = () => `e${++e}`;
  const edges: Edge[] = [];
  for (let i = 0; i < elecChain.length - 1; i++) {
    edges.push(makeEdge(eid(), elecChain[i].id, elecChain[i + 1].id, 'electrical', 'r', 'l'));
  }
  // Control path: EMS -> switch -> gateway -> grid (delivery point).
  edges.push(makeEdge(eid(), ems.id, sw.id, 'communication', 'r', 'l'));
  edges.push(makeEdge(eid(), sw.id, gw.id, 'communication', 'r', 'l'));
  edges.push(makeEdge(eid(), gw.id, grid.id, 'communication', 't', 'b'));
  // Dispatch path: cloud <-> WAN <-> EMS, market -> WAN.
  edges.push(makeEdge(eid(), cloud.id, wan.id, 'communication', 'r', 'l'));
  edges.push(makeEdge(eid(), wan.id, ems.id, 'communication', 't', 'b'));
  edges.push(makeEdge(eid(), market.id, wan.id, 'communication', 'r', 'l'));

  const externalEvents: ExternalEvent[] = [
    { id: 'grid-outage', label: 'Grid outage / curtailment', freqPerYear: 2, meanDurationHours: 6, includeInContractual: false },
    { id: 'force-majeure', label: 'Force majeure (storm, etc.)', freqPerYear: 0.2, meanDurationHours: 48, includeInContractual: false },
    { id: 'planned-maint', label: 'Planned maintenance', freqPerYear: 2, meanDurationHours: 8, includeInContractual: false },
  ];

  return { nodes, edges, externalEvents };
}
