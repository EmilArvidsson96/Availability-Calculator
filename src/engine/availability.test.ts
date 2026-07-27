import { describe, it, expect } from 'vitest';
import {
  pointAvailability,
  seriesAvailability,
  parallelAvailability,
  kOfNAvailability,
  softwareUnavailability,
  mtbfLowerBound,
  componentPointAvailability,
  requiredBlocksForCapacity,
  capacitySizing,
  connectionAvailability,
} from './availability';
import type { ComponentData, ConnectionReliability, SoftwareLayer } from '../types/model';

function warrantedBlock(partial: Partial<ComponentData>): ComponentData {
  return {
    kind: 'bess-block',
    label: 'block',
    subsystem: 'aggregated',
    availabilitySource: 'WARRANTED',
    mtbfHours: 100000,
    mttrHours: 24,
    effectiveFailures: 10,
    mttrLogSigma: 0.5,
    warrantedAvailability: 0.97,
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

describe('elementary availability', () => {
  it('single repairable unit', () => {
    expect(pointAvailability(999, 1)).toBeCloseTo(0.999, 6);
    expect(pointAvailability(0, 1)).toBe(0);
  });

  it('series multiplies', () => {
    expect(seriesAvailability([0.99, 0.98, 0.999])).toBeCloseTo(0.99 * 0.98 * 0.999, 9);
  });

  it('parallel uses 1 - product(1 - A)', () => {
    expect(parallelAvailability([0.9, 0.9])).toBeCloseTo(0.99, 9);
    expect(parallelAvailability([0.99, 0.99, 0.99])).toBeCloseTo(1 - 0.01 ** 3, 9);
  });

  it('k-of-n redundancy', () => {
    // 1-of-2 equals active parallel of two identical units.
    expect(kOfNAvailability(0.9, 2, 1)).toBeCloseTo(parallelAvailability([0.9, 0.9]), 9);
    // 2-of-2 equals series.
    expect(kOfNAvailability(0.9, 2, 2)).toBeCloseTo(0.81, 9);
    // 2-of-3: 3a^2(1-a) + a^3
    const a = 0.95;
    expect(kOfNAvailability(a, 3, 2)).toBeCloseTo(3 * a * a * (1 - a) + a ** 3, 9);
  });
});

describe('software layer', () => {
  it('disabled contributes nothing', () => {
    const sw: SoftwareLayer = {
      enabled: false,
      failuresPerYear: 100,
      watchdogCoverage: 0,
      mttrAutoHours: 1,
      mttrRebootHours: 10,
      plannedPatchHoursPerYear: 100,
    };
    expect(softwareUnavailability(sw)).toBe(0);
  });

  it('watchdog coverage reduces impact', () => {
    const base: SoftwareLayer = {
      enabled: true,
      failuresPerYear: 12,
      watchdogCoverage: 0,
      mttrAutoHours: 0.05,
      mttrRebootHours: 2,
      plannedPatchHoursPerYear: 0,
    };
    const highCoverage = { ...base, watchdogCoverage: 0.95 };
    expect(softwareUnavailability(highCoverage)).toBeLessThan(softwareUnavailability(base));
  });
});

describe('BESS block capacity scaling', () => {
  it('applies k-of-n redundancy to a WARRANTED block using its own availability as the per-unit figure', () => {
    const d = warrantedBlock({ redundancyN: 10, redundancyK: 8 });
    const expected = kOfNAvailability(0.97, 10, 8);
    expect(componentPointAvailability(d)).toBeCloseTo(expected, 9);
  });

  it('a single warranted block (n=1) is unaffected, matching prior behaviour', () => {
    const d = warrantedBlock({});
    expect(componentPointAvailability(d)).toBeCloseTo(0.97, 9);
  });

  it('derives required blocks from whichever of power/energy is more binding', () => {
    // 40 MW / 5 MW per block = 8; 80 MWh / 10 MWh per block = 8.
    expect(requiredBlocksForCapacity(5, 10, 40, 80)).toBe(8);
    // Power now binds harder: 47 MW needs 10 blocks (ceil(47/5)), energy only needs 8.
    expect(requiredBlocksForCapacity(5, 10, 47, 80)).toBe(10);
  });

  it('is not thrown off by floating-point rounding at an exact ratio', () => {
    expect(requiredBlocksForCapacity(5, 10, 50, 100)).toBe(10);
  });

  it('returns null when no capacity inputs are set, leaving k to be entered by hand', () => {
    expect(requiredBlocksForCapacity(0, 0, 0, 0)).toBeNull();
    expect(capacitySizing(warrantedBlock({}))).toBeNull();
  });

  it('reports nameplate capacity and spare margin for n built vs k required', () => {
    const d = warrantedBlock({
      redundancyN: 12,
      redundancyK: 10,
      blockPowerMW: 5,
      blockEnergyMWh: 10,
      contractedPowerMW: 50,
      contractedEnergyMWh: 100,
    });
    const sizing = capacitySizing(d)!;
    expect(sizing.requiredBlocks).toBe(10);
    expect(sizing.nameplatePowerMW).toBeCloseTo(60, 9);
    expect(sizing.nameplateEnergyMWh).toBeCloseTo(120, 9);
    // 12 built vs 10 required = 20% spare margin.
    expect(sizing.marginPct).toBeCloseTo(20, 6);
  });
});

describe('connection availability (grace window)', () => {
  it('a disabled connection is treated as perfect', () => {
    const r: ConnectionReliability = { enabled: false, mtbfHours: 100, mttrHours: 10, impactWindowHours: 0 };
    expect(connectionAvailability(r)).toBe(1);
  });

  it('with no grace window, matches plain MTBF/MTTR availability', () => {
    const r: ConnectionReliability = { enabled: true, mtbfHours: 4000, mttrHours: 8, impactWindowHours: 0 };
    expect(connectionAvailability(r)).toBeCloseTo(pointAvailability(4000, 8), 12);
  });

  it('only the repair time beyond the window counts as downtime', () => {
    const r: ConnectionReliability = { enabled: true, mtbfHours: 4000, mttrHours: 8, impactWindowHours: 2 };
    expect(connectionAvailability(r)).toBeCloseTo(pointAvailability(4000, 6), 12);
  });

  it('a grace window covering the whole repair makes the connection effectively perfect', () => {
    const r: ConnectionReliability = { enabled: true, mtbfHours: 4000, mttrHours: 4, impactWindowHours: 8 };
    expect(connectionAvailability(r)).toBe(1);
  });
});

describe('mtbf lower bound', () => {
  it('is below the point estimate and tightens with more failures', () => {
    const point = 100000;
    const fewFailures = mtbfLowerBound(point, 4, 0.9);
    const manyFailures = mtbfLowerBound(point, 40, 0.9);
    expect(fewFailures).toBeLessThan(point);
    expect(manyFailures).toBeLessThan(point);
    // More observed failures => bound closer to the point estimate.
    expect(manyFailures).toBeGreaterThan(fewFailures);
  });
});
