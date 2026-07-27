import { MarkerType, type Edge } from '@xyflow/react';
import type { EdgeLayer } from '../types/model';

export const LAYER_COLOR: Record<EdgeLayer, string> = {
  electrical: '#ea580c',
  communication: '#7c3aed',
};

/** Visual style for an edge of a given layer (solid orange vs dashed purple). */
export function edgeStyleFor(layer: EdgeLayer, highlighted = false) {
  const color = LAYER_COLOR[layer];
  return {
    stroke: color,
    strokeWidth: layer === 'electrical' ? 2.6 : 1.8,
    strokeDasharray: layer === 'communication' ? '6 4' : undefined,
    opacity: highlighted ? 1 : 0.9,
  };
}

export interface EdgeData {
  layer: EdgeLayer;
  [key: string]: unknown;
}

export function makeEdge(
  id: string,
  source: string,
  target: string,
  layer: EdgeLayer,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): Edge {
  return {
    id,
    source,
    target,
    sourceHandle: sourceHandle ?? undefined,
    targetHandle: targetHandle ?? undefined,
    data: { layer },
    style: edgeStyleFor(layer),
    markerEnd: { type: MarkerType.ArrowClosed, color: LAYER_COLOR[layer], width: 14, height: 14 },
  };
}

export function getLayer(edge: Edge): EdgeLayer {
  return (edge.data as EdgeData | undefined)?.layer ?? 'electrical';
}

/** Re-layer an existing edge, refreshing its data/style/marker to match. */
export function restyleEdge(edge: Edge, layer: EdgeLayer): Edge {
  return {
    ...edge,
    data: { ...(edge.data as EdgeData | undefined), layer },
    style: edgeStyleFor(layer, edge.selected),
    markerEnd: { type: MarkerType.ArrowClosed, color: LAYER_COLOR[layer], width: 14, height: 14 },
  };
}
