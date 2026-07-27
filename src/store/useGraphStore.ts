import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge as rfAddEdge,
  type Connection,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type XYPosition,
} from '@xyflow/react';
import {
  type ComponentData,
  type EdgeLayer,
  type ExternalEvent,
  type SimSettings,
  DEFAULT_SIM_SETTINGS,
  SCHEMA_VERSION,
} from '../types/model';
import { instantiateAny } from './useCatalogStore';
import { buildExample, type CompNode } from '../data/example';
import { makeEdge, edgeStyleFor, getLayer } from '../lib/edges';
import {
  evaluatePoint,
  type ScenarioInput,
  type PointResult,
  type ComponentResult,
  type MonteCarloResult,
} from '../engine/compute';

const STORAGE_KEY = 'bess-availability-calculator:v1';

export type LayerVisibility = 'both' | EdgeLayer;

interface PersistShape {
  schemaVersion: number;
  nodes: CompNode[];
  edges: Edge[];
  externalEvents: ExternalEvent[];
  simSettings: SimSettings;
}

interface GraphState {
  nodes: CompNode[];
  edges: Edge[];
  externalEvents: ExternalEvent[];
  simSettings: SimSettings;

  selectedId: string | null;
  drawLayer: EdgeLayer;
  layerVisibility: LayerVisibility;

  pointResult: PointResult | null;
  componentResults: Record<string, ComponentResult>;
  mcResult: MonteCarloResult | null;
  running: boolean;
  progress: number;
  error: string | null;

  // actions
  onNodesChange: OnNodesChange<CompNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: (c: Connection) => void;
  addComponent: (kind: string, position: XYPosition) => void;
  updateNodeData: (id: string, patch: Partial<ComponentData>) => void;
  deleteSelected: () => void;
  setSelected: (id: string | null) => void;
  setDrawLayer: (layer: EdgeLayer) => void;
  setLayerVisibility: (v: LayerVisibility) => void;

  setExternalEvents: (events: ExternalEvent[]) => void;
  setSimSettings: (patch: Partial<SimSettings>) => void;

  recompute: () => void;
  runSimulation: () => void;

  newProject: () => void;
  loadExample: () => void;
  exportJson: () => string;
  importJson: (json: string) => void;
}

function scenarioInput(state: Pick<GraphState, 'nodes' | 'edges' | 'externalEvents'>): ScenarioInput {
  return {
    components: state.nodes.map((n) => ({ id: n.id, data: n.data })),
    edges: state.edges.map((e) => ({ source: e.source, target: e.target, layer: getLayer(e) })),
    externalEvents: state.externalEvents,
  };
}

function persist(state: GraphState) {
  try {
    const data: PersistShape = {
      schemaVersion: SCHEMA_VERSION,
      nodes: state.nodes,
      edges: state.edges,
      externalEvents: state.externalEvents,
      simSettings: state.simSettings,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage may be unavailable; ignore */
  }
}

function applyEdgeVisibility(edges: Edge[], vis: LayerVisibility): Edge[] {
  return edges.map((e) => {
    const layer = getLayer(e);
    const hidden = vis !== 'both' && layer !== vis;
    return { ...e, hidden };
  });
}

function loadInitial(): { nodes: CompNode[]; edges: Edge[]; externalEvents: ExternalEvent[]; simSettings: SimSettings } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed && parsed.nodes) {
        return {
          nodes: parsed.nodes,
          edges: parsed.edges ?? [],
          externalEvents: parsed.externalEvents ?? [],
          simSettings: { ...DEFAULT_SIM_SETTINGS, ...(parsed.simSettings ?? {}) },
        };
      }
    }
  } catch {
    /* fall through to example */
  }
  const ex = buildExample();
  return { ...ex, simSettings: { ...DEFAULT_SIM_SETTINGS } };
}

let worker: Worker | null = null;
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

const initial = loadInitial();

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: initial.nodes,
  edges: applyEdgeVisibility(initial.edges, 'both'),
  externalEvents: initial.externalEvents,
  simSettings: initial.simSettings,

  selectedId: null,
  drawLayer: 'electrical',
  layerVisibility: 'both',

  pointResult: null,
  componentResults: {},
  mcResult: null,
  running: false,
  progress: 0,
  error: null,

  onNodesChange: (changes) => {
    const structural = changes.some((c) => c.type === 'remove' || c.type === 'add');
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    if (structural) {
      get().recompute();
      persist(get());
    }
  },

  onEdgesChange: (changes) => {
    const structural = changes.some((c) => c.type === 'remove' || c.type === 'add');
    set({ edges: applyEdgeChanges(changes, get().edges) });
    if (structural) {
      get().recompute();
      persist(get());
    }
  },

  onConnect: (c) => {
    const layer = get().drawLayer;
    const id = `e_${c.source}_${c.target}_${layer}_${Date.now()}`;
    const edge = makeEdge(id, c.source!, c.target!, layer);
    const edges = applyEdgeVisibility(rfAddEdge(edge, get().edges), get().layerVisibility);
    set({ edges });
    get().recompute();
    persist(get());
  },

  addComponent: (kind, position) => {
    const id = `${kind}_${Date.now()}_${Math.floor(position.x)}`;
    const node: CompNode = { id, type: 'component', position, data: instantiateAny(kind) };
    set({ nodes: [...get().nodes, node], selectedId: id });
    get().recompute();
    persist(get());
  },

  updateNodeData: (id, patch) => {
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    });
    get().recompute();
    persist(get());
  },

  deleteSelected: () => {
    const id = get().selectedId;
    if (!id) return;
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: null,
    });
    get().recompute();
    persist(get());
  },

  setSelected: (id) => set({ selectedId: id }),
  setDrawLayer: (layer) => set({ drawLayer: layer }),
  setLayerVisibility: (v) => set({ edges: applyEdgeVisibility(get().edges, v), layerVisibility: v }),

  setExternalEvents: (events) => {
    set({ externalEvents: events });
    get().recompute();
    persist(get());
  },

  setSimSettings: (patch) => {
    set({ simSettings: { ...get().simSettings, ...patch } });
    persist(get());
  },

  recompute: () => {
    const input = scenarioInput(get());
    const point = evaluatePoint(input);
    const componentResults: Record<string, ComponentResult> = {};
    for (const r of point.componentResults) componentResults[r.id] = r;
    set({ pointResult: point, componentResults });
  },

  runSimulation: () => {
    if (get().running) return;
    const input = scenarioInput(get());
    const settings = get().simSettings;
    set({ running: true, progress: 0, error: null });
    const w = getWorker();
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        set({ progress: msg.frac });
      } else if (msg.type === 'result') {
        const result = msg.result as MonteCarloResult;
        const componentResults: Record<string, ComponentResult> = {};
        for (const r of result.point.componentResults) componentResults[r.id] = r;
        set({ mcResult: result, pointResult: result.point, componentResults, running: false, progress: 1 });
      } else if (msg.type === 'error') {
        set({ running: false, error: msg.message });
      }
    };
    w.onerror = (err) => set({ running: false, error: err.message });
    w.postMessage({ input, settings });
  },

  newProject: () => {
    set({ nodes: [], edges: [], externalEvents: [], selectedId: null, mcResult: null });
    get().recompute();
    persist(get());
  },

  loadExample: () => {
    const ex = buildExample();
    set({
      nodes: ex.nodes,
      edges: applyEdgeVisibility(ex.edges, get().layerVisibility),
      externalEvents: ex.externalEvents,
      selectedId: null,
      mcResult: null,
    });
    get().recompute();
    persist(get());
  },

  exportJson: () => {
    const data: PersistShape = {
      schemaVersion: SCHEMA_VERSION,
      nodes: get().nodes,
      edges: get().edges,
      externalEvents: get().externalEvents,
      simSettings: get().simSettings,
    };
    return JSON.stringify(data, null, 2);
  },

  importJson: (json) => {
    const parsed = JSON.parse(json) as PersistShape;
    if (!parsed.nodes) throw new Error('Invalid file: missing nodes.');
    // Re-style edges so visuals follow the current layer conventions.
    const edges = (parsed.edges ?? []).map((e) => {
      const layer = getLayer(e);
      return { ...e, style: edgeStyleFor(layer) };
    });
    set({
      nodes: parsed.nodes,
      edges: applyEdgeVisibility(edges, get().layerVisibility),
      externalEvents: parsed.externalEvents ?? [],
      simSettings: { ...DEFAULT_SIM_SETTINGS, ...(parsed.simSettings ?? {}) },
      selectedId: null,
      mcResult: null,
    });
    get().recompute();
    persist(get());
  },
}));

// Initial point computation.
useGraphStore.getState().recompute();
