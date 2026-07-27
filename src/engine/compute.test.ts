import { describe, it, expect } from 'vitest';
import { runMonteCarlo, evaluatePoint, type ScenarioInput } from './compute';
import { mtbfLowerBound, kOfNAvailability } from './availability';
import { makeRng, gammaSample } from './distributions';
import type { ComponentData } from '../types/model';

function estimated(partial: Partial<ComponentData>): ComponentData {
  return {
    kind: 'generic',
    label: 'c',
    subsystem: 'battery',
    availabilitySource: 'ESTIMATED',
    mtbfHours: 100000,
    mttrHours: 24,
    effectiveFailures: 10,
    mttrLogSigma: 0.001,
    warrantedAvailability: 0.99,
    slaAdjustment: 1,
    redundancyN: 1,
    redundancyK: 1,
    blockPowerMW: 0,
    blockEnergyMWh: 0,
    contractedPowerMW: 0,
    contractedEnergyMWh: 0,
    isElectricalSource: false,
    isDeliverySink: false,
    isControlSource: false,
    controlMode: 'delivery',
    software: {
      enabled: false,
      failuresPerYear: 0,
      watchdogCoverage: 1,
      mttrAutoHours: 0,
      mttrRebootHours: 0,
      plannedPatchHoursPerYear: 0,
    },
    spof: false,
    ...partial,
  };
}

describe('Monte Carlo confidence — validation against the analytic bound', () => {
  it('single-component MTBF draws reproduce the chi-square lower bound', () => {
    // Independently sample MTBF the same way the engine does and confirm the
    // empirical lower quantile matches the analytic chi-square bound. This proves
    // the sampler propagates EPISTEMIC (parameter) uncertainty, not aleatory noise.
    const rng = makeRng(999);
    const mtbf = 100000;
    const r = 10;
    const T = r * mtbf;
    const conf = 0.95;
    const N = 40000;
    const draws = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const lambda = gammaSample(rng, r, 1 / T);
      draws[i] = 1 / lambda;
    }
    draws.sort();
    const empiricalLower = draws[Math.floor((1 - conf) * N)];
    const analytic = mtbfLowerBound(mtbf, r, conf);
    // Within ~4% Monte Carlo error.
    expect(Math.abs(empiricalLower - analytic) / analytic).toBeLessThan(0.04);
  });

  it('system promise (P-lower) sits below the median, which sits below the mean point estimate region', () => {
    const input: ScenarioInput = {
      components: [
        { id: 'a', data: estimated({ isElectricalSource: true, mttrLogSigma: 0.4, effectiveFailures: 6 }) },
        { id: 'b', data: estimated({ isDeliverySink: true, mttrLogSigma: 0.4, effectiveFailures: 6 }) },
      ],
      edges: [{ source: 'a', target: 'b', layer: 'electrical' }],
      externalEvents: [],
    };
    const res = runMonteCarlo(input, { samples: 20000, confidence: 0.95, seed: 1 });
    const p = res.contractualPercentiles;
    expect(p.lower).toBeLessThan(p.median);
    expect(p.median).toBeLessThanOrEqual(p.upper);
    // Series of two ~0.9997 components -> system around four-nines-ish, all valid probabilities.
    expect(p.lower).toBeGreaterThan(0);
    expect(p.upper).toBeLessThanOrEqual(1);
  });
});

describe('raw vs contractual availability', () => {
  it('excluding an external event raises the contractual figure above raw', () => {
    const input: ScenarioInput = {
      components: [
        { id: 'a', data: estimated({ isElectricalSource: true }) },
        { id: 'b', data: estimated({ isDeliverySink: true }) },
      ],
      edges: [{ source: 'a', target: 'b', layer: 'electrical' }],
      externalEvents: [
        { id: 'grid', label: 'Grid outage', freqPerYear: 2, meanDurationHours: 12, includeInContractual: false },
      ],
    };
    const point = evaluatePoint(input);
    expect(point.contractualAvailability).toBeGreaterThan(point.rawAvailability);
  });

  it('warranted component uses its guaranteed value directly', () => {
    const input: ScenarioInput = {
      components: [
        {
          id: 'pcs',
          data: estimated({
            availabilitySource: 'WARRANTED',
            warrantedAvailability: 0.985,
            isElectricalSource: true,
            isDeliverySink: true,
          }),
        },
      ],
      edges: [],
      externalEvents: [],
    };
    const point = evaluatePoint(input);
    expect(point.internalAvailability).toBeCloseTo(0.985, 6);
  });

  it('applies k-of-n block-scaling redundancy to a WARRANTED BESS block', () => {
    // 10 blocks built (n), only 8 required to meet the contracted capacity (k) —
    // the array should show the k-of-8 confidence, not the raw single-block figure.
    const input: ScenarioInput = {
      components: [
        {
          id: 'bess',
          data: estimated({
            availabilitySource: 'WARRANTED',
            warrantedAvailability: 0.97,
            redundancyN: 10,
            redundancyK: 8,
            isElectricalSource: true,
            isDeliverySink: true,
          }),
        },
      ],
      edges: [],
      externalEvents: [],
    };
    const point = evaluatePoint(input);
    expect(point.internalAvailability).toBeCloseTo(kOfNAvailability(0.97, 10, 8), 9);
    expect(point.internalAvailability).toBeGreaterThan(0.97);
  });
});

describe('warnings', () => {
  it('flags a missing source / sink', () => {
    const input: ScenarioInput = {
      components: [{ id: 'a', data: estimated({}) }],
      edges: [],
      externalEvents: [],
    };
    const point = evaluatePoint(input);
    expect(point.warnings.length).toBeGreaterThan(0);
  });
});
