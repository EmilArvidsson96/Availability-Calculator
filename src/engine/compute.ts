// ---------------------------------------------------------------------------
// Orchestration: turn a drawn scenario into availability results.
//
//  - buildModel:     compile the electrical + communication networks once.
//  - evaluatePoint:  the expected (P50-ish) availability and per-component
//                    contribution analysis (drives the waterfall + weakest link).
//  - runMonteCarlo:  propagate per-component EPISTEMIC uncertainty through the
//                    compiled networks to a distribution -> P-lower / P50 / P-upper.
//
// "Raw" availability counts every modelled downtime; "contractual" availability
// drops external events flagged as excluded (force majeure, grid, ...).
// ---------------------------------------------------------------------------

import {
  applyRedundancy,
  pointAvailability,
  softwareUnavailability,
  componentPointAvailability,
  clamp01,
} from './availability';
import { compileNetwork, evalTree, type RelTree } from './network';
import { gammaSample, lognormalSampleWithMean, makeRng } from './distributions';
import type { ComponentData, EdgeLayer, ExternalEvent, SimSettings } from '../types/model';

export const HOURS_PER_YEAR = 8760;

export interface ScenarioComponent {
  id: string;
  data: ComponentData;
}

export interface ScenarioInput {
  components: ScenarioComponent[];
  edges: Array<{ source: string; target: string; layer: EdgeLayer }>;
  externalEvents: ExternalEvent[];
}

interface CompiledModel {
  n: number;
  ids: string[];
  data: ComponentData[];
  elecTree: RelTree;
  commsTree: RelTree;
  commsModeled: boolean;
  swFactor: Float64Array;
  /** Fixed availabilities for WARRANTED / SLA components (NaN for ESTIMATED). */
  fixed: Float64Array;
  estimatedIdx: number[];
  extRawFactor: number;
  extContractualFactor: number;
  warnings: string[];
}

const ONE_TREE: RelTree = { op: 'const', value: 1 };

function buildModel(input: ScenarioInput): CompiledModel {
  const components = input.components;
  const n = components.length;
  const ids = components.map((c) => c.id);
  const data = components.map((c) => c.data);
  const indexOf = new Map<string, number>();
  ids.forEach((id, i) => indexOf.set(id, i));

  const elecEdges: Array<[number, number]> = [];
  const commsEdges: Array<[number, number]> = [];
  for (const e of input.edges) {
    const a = indexOf.get(e.source);
    const b = indexOf.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    if (e.layer === 'electrical') elecEdges.push([a, b]);
    else commsEdges.push([a, b]);
  }

  const sourceIdxs: number[] = [];
  const sinkIdxs: number[] = [];
  const controlSrcIdxs: number[] = [];
  data.forEach((d, i) => {
    if (d.isElectricalSource) sourceIdxs.push(i);
    if (d.isDeliverySink) sinkIdxs.push(i);
    if (d.isControlSource) controlSrcIdxs.push(i);
  });

  const warnings: string[] = [];
  if (n > 0 && sourceIdxs.length === 0) warnings.push('No electrical source is defined — mark the battery (or feed) as a source.');
  if (n > 0 && sinkIdxs.length === 0) warnings.push('No delivery point is defined — mark the grid connection as the delivery sink.');

  const elec = compileNetwork(n, elecEdges, sourceIdxs, sinkIdxs);
  const elecTree = elec.hasSource && elec.hasSink ? elec.tree : { op: 'const', value: 0 } as RelTree;

  // Control / comms layer: model only when it is meaningfully defined.
  let commsTree: RelTree = ONE_TREE;
  let commsModeled = false;
  if (commsEdges.length > 0 && controlSrcIdxs.length > 0 && sinkIdxs.length > 0) {
    const comms = compileNetwork(n, commsEdges, controlSrcIdxs, sinkIdxs);
    commsTree = comms.tree;
    commsModeled = true;
  } else if (commsEdges.length > 0 && controlSrcIdxs.length === 0) {
    warnings.push('Communication links exist but no control source is set — mark a controller (EMS/SCADA) as a control source to include comms in the result.');
  }

  const swFactor = new Float64Array(n);
  const fixed = new Float64Array(n);
  const estimatedIdx: number[] = [];
  data.forEach((d, i) => {
    swFactor[i] = 1 - softwareUnavailability(d.software);
    if (d.availabilitySource === 'ESTIMATED') {
      fixed[i] = NaN;
      estimatedIdx.push(i);
    } else if (d.availabilitySource === 'SLA') {
      fixed[i] = clamp01(d.warrantedAvailability * d.slaAdjustment) * swFactor[i];
    } else {
      fixed[i] = clamp01(d.warrantedAvailability) * swFactor[i];
    }
  });

  let extRawFactor = 1;
  let extContractualFactor = 1;
  for (const ev of input.externalEvents) {
    const u = clamp01((ev.freqPerYear * ev.meanDurationHours) / HOURS_PER_YEAR);
    const a = 1 - u;
    extRawFactor *= a;
    if (ev.includeInContractual) extContractualFactor *= a;
  }

  return {
    n,
    ids,
    data,
    elecTree,
    commsTree,
    commsModeled,
    swFactor,
    fixed,
    estimatedIdx,
    extRawFactor,
    extContractualFactor,
    warnings,
  };
}

function pointProbs(m: CompiledModel): Float64Array {
  const probs = new Float64Array(m.n);
  for (let i = 0; i < m.n; i++) {
    probs[i] = Number.isNaN(m.fixed[i]) ? componentPointAvailability(m.data[i]) : m.fixed[i];
  }
  return probs;
}

export interface ComponentResult {
  id: string;
  availability: number;
  /** Downtime hours/year attributable to this block (Birnbaum-style contribution). */
  downtimeHours: number;
  critical: boolean;
}

export interface PointResult {
  rawAvailability: number;
  contractualAvailability: number;
  internalAvailability: number;
  electricalAvailability: number;
  controlAvailability: number;
  commsModeled: boolean;
  componentResults: ComponentResult[];
  /** Downtime hours/year grouped for the waterfall (by subsystem, plus external). */
  contributions: Array<{ label: string; downtimeHours: number }>;
  warnings: string[];
}

export function evaluatePoint(input: ScenarioInput): PointResult {
  const m = buildModel(input);
  const probs = pointProbs(m);
  const aElec = evalTree(m.elecTree, probs);
  const aCtrl = evalTree(m.commsTree, probs);
  const aInternal = aElec * aCtrl;
  const raw = aInternal * m.extRawFactor;
  const contractual = aInternal * m.extContractualFactor;

  // Per-component contribution: availability gained if the block were perfect.
  const comp: ComponentResult[] = [];
  let maxContribution = 0;
  const contribRaw: number[] = new Array(m.n).fill(0);
  for (let i = 0; i < m.n; i++) {
    const saved = probs[i];
    probs[i] = 1;
    const aInt = evalTree(m.elecTree, probs) * evalTree(m.commsTree, probs);
    probs[i] = saved;
    const delta = Math.max(0, aInt - aInternal);
    contribRaw[i] = delta;
    if (delta > maxContribution) maxContribution = delta;
  }
  for (let i = 0; i < m.n; i++) {
    const critical = maxContribution > 0 && contribRaw[i] >= 0.5 * maxContribution && contribRaw[i] > 0;
    comp.push({
      id: m.ids[i],
      availability: probs[i],
      downtimeHours: contribRaw[i] * HOURS_PER_YEAR,
      critical,
    });
  }

  // Waterfall grouped by subsystem + external events.
  const bySubsystem = new Map<string, number>();
  for (let i = 0; i < m.n; i++) {
    const key = m.data[i].subsystem;
    bySubsystem.set(key, (bySubsystem.get(key) ?? 0) + contribRaw[i] * HOURS_PER_YEAR);
  }
  const contributions: Array<{ label: string; downtimeHours: number }> = [];
  for (const [label, downtimeHours] of bySubsystem) {
    if (downtimeHours > 1e-6) contributions.push({ label, downtimeHours });
  }
  const extDowntime = (1 - m.extRawFactor) * HOURS_PER_YEAR;
  if (extDowntime > 1e-6) contributions.push({ label: 'external-events', downtimeHours: extDowntime });
  contributions.sort((a, b) => b.downtimeHours - a.downtimeHours);

  return {
    rawAvailability: raw,
    contractualAvailability: contractual,
    internalAvailability: aInternal,
    electricalAvailability: aElec,
    controlAvailability: aCtrl,
    commsModeled: m.commsModeled,
    componentResults: comp,
    contributions,
    warnings: m.warnings,
  };
}

export interface Percentiles {
  lower: number; // promised lower confidence bound, quantile(1 - confidence)
  median: number;
  upper: number; // quantile(confidence)
  mean: number;
}

export interface MonteCarloResult {
  point: PointResult;
  rawPercentiles: Percentiles;
  contractualPercentiles: Percentiles;
  /** Histogram of contractual availability draws for charting. */
  histogram: Array<{ x: number; count: number }>;
  samples: number;
  confidence: number;
}

function quantile(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[n - 1];
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function summarize(values: Float64Array, confidence: number): Percentiles {
  const sorted = Float64Array.from(values).sort();
  let sum = 0;
  for (const v of values) sum += v;
  return {
    lower: quantile(sorted, 1 - confidence),
    median: quantile(sorted, 0.5),
    upper: quantile(sorted, confidence),
    mean: sum / (values.length || 1),
  };
}

/** Sample one estimated component's availability for a single draw. */
function sampleEstimated(rng: () => number, d: ComponentData, swFactor: number): number {
  const r = Math.max(0.5, d.effectiveFailures);
  const T = r * d.mtbfHours;
  // Failure rate lambda ~ Gamma(shape = r, rate = T) so E[lambda] = r/T = 1/MTBF.
  const lambda = gammaSample(rng, r, 1 / T);
  const mtbf = lambda > 0 ? 1 / lambda : d.mtbfHours;
  const mttr = lognormalSampleWithMean(rng, d.mttrHours, d.mttrLogSigma);
  const aUnit = pointAvailability(mtbf, mttr);
  return applyRedundancy(aUnit, d) * swFactor;
}

export function runMonteCarlo(input: ScenarioInput, settings: SimSettings, onProgress?: (frac: number) => void): MonteCarloResult {
  const m = buildModel(input);
  const point = evaluatePoint(input);
  const N = Math.max(1, Math.floor(settings.samples));
  const rng = makeRng(settings.seed);

  const probs = new Float64Array(m.n);
  for (let i = 0; i < m.n; i++) if (!Number.isNaN(m.fixed[i])) probs[i] = m.fixed[i];

  const rawDraws = new Float64Array(N);
  const conDraws = new Float64Array(N);
  const progressStep = Math.max(1, Math.floor(N / 50));

  for (let s = 0; s < N; s++) {
    for (const i of m.estimatedIdx) {
      probs[i] = sampleEstimated(rng, m.data[i], m.swFactor[i]);
    }
    const aInternal = evalTree(m.elecTree, probs) * evalTree(m.commsTree, probs);
    rawDraws[s] = aInternal * m.extRawFactor;
    conDraws[s] = aInternal * m.extContractualFactor;
    if (onProgress && s % progressStep === 0) onProgress(s / N);
  }
  if (onProgress) onProgress(1);

  // Histogram over the contractual draws.
  const BINS = 40;
  let min = Infinity;
  let max = -Infinity;
  for (const v of conDraws) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) {
    min = 0;
    max = 1;
  }
  const span = max - min || 1e-9;
  const histogram: Array<{ x: number; count: number }> = Array.from({ length: BINS }, (_, b) => ({
    x: min + ((b + 0.5) / BINS) * span,
    count: 0,
  }));
  for (const v of conDraws) {
    let b = Math.floor(((v - min) / span) * BINS);
    if (b < 0) b = 0;
    if (b >= BINS) b = BINS - 1;
    histogram[b].count++;
  }

  return {
    point,
    rawPercentiles: summarize(rawDraws, settings.confidence),
    contractualPercentiles: summarize(conDraws, settings.confidence),
    histogram,
    samples: N,
    confidence: settings.confidence,
  };
}
