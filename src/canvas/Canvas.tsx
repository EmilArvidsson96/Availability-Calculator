import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  ConnectionMode,
  SelectionMode,
  useReactFlow,
  type Node,
  type OnSelectionChangeFunc,
  BackgroundVariant,
} from '@xyflow/react';
import { useGraphStore, type LayerVisibility } from '../store/useGraphStore';
import { ComponentNode } from './ComponentNode';
import type { ComponentData, EdgeLayer } from '../types/model';
import { SUBSYSTEM_COLOR } from '../data/componentLibrary';
import { availabilityColor } from '../lib/format';

const nodeTypes = { component: ComponentNode };

const LAYER_OPTIONS: { value: LayerVisibility; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'communication', label: 'Communication' },
];

export function Canvas() {
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const onConnect = useGraphStore((s) => s.onConnect);
  const onReconnect = useGraphStore((s) => s.onReconnect);
  const addComponent = useGraphStore((s) => s.addComponent);
  const setSelected = useGraphStore((s) => s.setSelected);
  const setSelectedEdge = useGraphStore((s) => s.setSelectedEdge);
  const copySelection = useGraphStore((s) => s.copySelection);
  const pasteClipboard = useGraphStore((s) => s.pasteClipboard);
  const drawLayer = useGraphStore((s) => s.drawLayer);
  const setDrawLayer = useGraphStore((s) => s.setDrawLayer);
  const layerVisibility = useGraphStore((s) => s.layerVisibility);
  const setLayerVisibility = useGraphStore((s) => s.setLayerVisibility);
  const componentResults = useGraphStore((s) => s.componentResults);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData('application/bess-kind');
      if (!kind) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addComponent(kind, position);
    },
    [screenToFlowPosition, addComponent],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const minimapColor = useCallback(
    (node: Node) => {
      const r = componentResults[node.id];
      if (r) return availabilityColor(r.availability);
      return SUBSYSTEM_COLOR[(node.data as ComponentData).subsystem] ?? '#94a3b8';
    },
    [componentResults],
  );

  const onSelectionChange = useCallback<OnSelectionChangeFunc>(
    ({ nodes: selectedNodes, edges: selectedEdges }) => {
      setSelected(selectedNodes.length === 1 ? selectedNodes[0].id : null);
      setSelectedEdge(selectedNodes.length === 0 && selectedEdges.length === 1 ? selectedEdges[0].id : null);
    },
    [setSelected, setSelectedEdge],
  );

  // Ctrl/Cmd+C copies the marked components, Ctrl/Cmd+V pastes them back in as a new, offset selection.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      const key = event.key.toLowerCase();
      if (key === 'c') {
        if (window.getSelection()?.toString()) return; // let the browser copy a text selection instead
        copySelection();
        event.preventDefault();
      } else if (key === 'v') {
        pasteClipboard();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [copySelection, pasteClipboard]);

  return (
    <div className="canvas" ref={wrapper} onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onSelectionChange={onSelectionChange}
        panOnDrag={[2]}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={['Backspace', 'Delete']}
        connectionMode={ConnectionMode.Loose}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{}}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#e2e8f0" />
        <Controls />
        <MiniMap pannable zoomable nodeColor={minimapColor} nodeStrokeWidth={2} />

        <Panel position="top-left" className="canvas-panel">
          <div className="canvas-panel__row">
            <span className="canvas-panel__label">View layer</span>
            <div className="segmented">
              {LAYER_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  className={layerVisibility === o.value ? 'active' : ''}
                  onClick={() => setLayerVisibility(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="canvas-panel__row">
            <span className="canvas-panel__label">Draw connections as</span>
            <div className="segmented">
              {(['electrical', 'communication'] as EdgeLayer[]).map((l) => (
                <button
                  key={l}
                  className={drawLayer === l ? `active active--${l}` : ''}
                  onClick={() => setDrawLayer(l)}
                >
                  {l === 'electrical' ? '⚡ Electrical' : '📡 Comms'}
                </button>
              ))}
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
