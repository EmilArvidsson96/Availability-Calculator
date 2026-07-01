import { describe, it, expect } from 'vitest';
import {
  pointAvailability,
  seriesAvailability,
  parallelAvailability,
  kOfNAvailability,
  softwareUnavailability,
  mtbfLowerBound,
} from './availability';
import type { SoftwareLayer } from '../types/model';

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
