import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import { useGraphStore } from '../store/useGraphStore';
import { formatPercent, downtimePerYear, availabilityColor, formatHours, nines } from '../lib/format';
import { SUBSYSTEM_LABEL } from '../data/componentLibrary';
import type { Subsystem } from '../types/model';

const SAMPLE_OPTIONS = [1000, 10000, 50000, 100000];
const CONFIDENCE_OPTIONS = [0.8, 0.9, 0.95, 0.99];

function labelFor(key: string): string {
  if (key === 'external-events') return 'External events';
  return SUBSYSTEM_LABEL[key as Subsystem] ?? key;
}

export function Results() {
  const point = useGraphStore((s) => s.pointResult);
  const mc = useGraphStore((s) => s.mcResult);
  const running = useGraphStore((s) => s.running);
  const progress = useGraphStore((s) => s.progress);
  const error = useGraphStore((s) => s.error);
  const settings = useGraphStore((s) => s.simSettings);
  const setSim = useGraphStore((s) => s.setSimSettings);
  const run = useGraphStore((s) => s.runSimulation);
  const componentResults = useGraphStore((s) => s.componentResults);
  const nodes = useGraphStore((s) => s.nodes);

  const lowerPct = Math.round((1 - settings.confidence) * 100);
  const upperPct = Math.round(settings.confidence * 100);

  const promise = mc ? mc.contractualPercentiles.lower : point?.contractualAvailability ?? 0;
  const expected = mc ? mc.contractualPercentiles.median : point?.contractualAvailability ?? 0;
  const upper = mc ? mc.contractualPercentiles.upper : point?.contractualAvailability ?? 0;

  const weakest = nodes
    .map((n) => ({ label: n.data.label, ...componentResults[n.id] }))
    .filter((r) => r.downtimeHours !== undefined && r.downtimeHours > 1e-6)
    .sort((a, b) => (b.downtimeHours ?? 0) - (a.downtimeHours ?? 0))
    .slice(0, 6);

  return (
    <div className="results">
      <div className="results__run">
        <button className="btn btn--primary" onClick={run} disabled={running}>
          {running ? `Running… ${Math.round(progress * 100)}%` : '▶ Run Monte Carlo'}
        </button>
        <div className="results__run-opts">
          <label>
            Samples
            <select value={settings.samples} onChange={(e) => setSim({ samples: parseInt(e.target.value, 10) })}>
              {SAMPLE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <label>
            Confidence
            <select value={settings.confidence} onChange={(e) => setSim({ confidence: parseFloat(e.target.value) })}>
              {CONFIDENCE_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {Math.round(c * 100)}%
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {running && (
        <div className="progress">
          <div className="progress__bar" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="headline">
        <div className="headline__main">
          <span className="headline__caption">Promise to customer · P{lowerPct} (contractual)</span>
          <span className="headline__value" style={{ color: availabilityColor(promise) }}>
            {formatPercent(promise)}
          </span>
          <span className="headline__sub">
            {nines(promise)} nines · {downtimePerYear(promise)}
            {!mc && ' · point estimate — run the simulation for the confidence bound'}
          </span>
        </div>
        <div className="headline__pair">
          <div>
            <span className="muted">Expected (P50)</span>
            <strong style={{ color: availabilityColor(expected) }}>{formatPercent(expected)}</strong>
          </div>
          <div>
            <span className="muted">Optimistic (P{upperPct})</span>
            <strong style={{ color: availabilityColor(upper) }}>{formatPercent(upper)}</strong>
          </div>
        </div>
      </div>

      {point && (
        <div className="results__grid">
          <div className="stat">
            <span className="muted">Raw (all events)</span>
            <strong>{formatPercent(point.rawAvailability)}</strong>
          </div>
          <div className="stat">
            <span className="muted">Contractual (excl. carve-outs)</span>
            <strong>{formatPercent(point.contractualAvailability)}</strong>
          </div>
          <div className="stat">
            <span className="muted">Electrical</span>
            <strong>{formatPercent(point.electricalAvailability)}</strong>
          </div>
          <div className="stat">
            <span className="muted">Control / comms</span>
            <strong>{point.commsModeled ? formatPercent(point.controlAvailability) : 'not modelled'}</strong>
          </div>
        </div>
      )}

      {point?.warnings.map((w) => (
        <div className="alert alert--warn" key={w}>
          {w}
        </div>
      ))}

      {mc && (
        <section className="results__section">
          <h4>Availability distribution ({mc.samples.toLocaleString()} draws)</h4>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={mc.histogram} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <XAxis
                dataKey="x"
                tickFormatter={(v) => `${(v * 100).toFixed(2)}`}
                tick={{ fontSize: 10 }}
                minTickGap={24}
              />
              <YAxis hide />
              <Tooltip
                formatter={(v: number) => [v, 'draws']}
                labelFormatter={(v: number) => formatPercent(v)}
              />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {mc.histogram.map((h, i) => (
                  <Cell key={i} fill={availabilityColor(h.x)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="muted small">x-axis: contractual availability (%). The promise is the P{lowerPct} of this distribution.</p>
        </section>
      )}

      {point && point.contributions.length > 0 && (
        <section className="results__section">
          <h4>Downtime contribution by subsystem</h4>
          <ResponsiveContainer width="100%" height={Math.max(120, point.contributions.length * 28)}>
            <BarChart
              layout="vertical"
              data={point.contributions.map((c) => ({ name: labelFor(c.label), hours: c.downtimeHours }))}
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(0)}h`} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [formatHours(v) + '/yr', 'downtime']} />
              <Bar dataKey="hours" fill="#ea580c" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {weakest.length > 0 && (
        <section className="results__section">
          <h4>Weakest links</h4>
          <ul className="weakest">
            {weakest.map((w, i) => (
              <li key={i} className={w.critical ? 'weakest--critical' : ''}>
                <span>{w.label}</span>
                <span className="muted">{formatHours(w.downtimeHours ?? 0)}/yr</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
