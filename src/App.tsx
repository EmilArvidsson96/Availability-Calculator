import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Toolbar } from './panels/Toolbar';
import { Palette } from './canvas/Palette';
import { Canvas } from './canvas/Canvas';
import { Inspector } from './panels/Inspector';
import { Results } from './panels/Results';
import { ExternalEvents } from './panels/ExternalEvents';
import { useGraphStore } from './store/useGraphStore';

type Tab = 'results' | 'component' | 'external';

export default function App() {
  const [tab, setTab] = useState<Tab>('results');
  const hasSelection = useGraphStore(
    (s) => s.selectedId !== null || s.nodes.some((n) => n.selected) || s.edges.some((e) => e.selected),
  );

  // Jump to the component editor when one or more nodes/connections are selected.
  useEffect(() => {
    if (hasSelection) setTab('component');
  }, [hasSelection]);

  return (
    <div className="app">
      <Toolbar />
      <div className="app__body">
        <Palette />
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
        <section className="sidebar">
          <nav className="sidebar__tabs">
            <button className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>
              Results
            </button>
            <button className={tab === 'component' ? 'active' : ''} onClick={() => setTab('component')}>
              Properties
            </button>
            <button className={tab === 'external' ? 'active' : ''} onClick={() => setTab('external')}>
              External
            </button>
          </nav>
          <div className="sidebar__content">
            {tab === 'results' && <Results />}
            {tab === 'component' && <Inspector />}
            {tab === 'external' && <ExternalEvents />}
          </div>
          <footer className="sidebar__foot">
            Modelled figures assume exponential failures, lognormal repair and independent components.
            The P-lower value is a confidence bound for guidance — not a contractual guarantee.
          </footer>
        </section>
      </div>
    </div>
  );
}
