// ---------------------------------------------------------------------------
// Elementary availability formulas and analytic confidence bounds.
// ---------------------------------------------------------------------------

import { chi2Inv } from './distributions';
import type { ComponentData, SoftwareLayer } from '../types/model';

const HOURS_PER_YEAR = 8760;

/** Steady-state availability of a single repairable unit. */
export function pointAvailability(mtbfHours: number, mttrHours: number): number {
  if (mtbfHours <= 0) return 0;
  return mtbfHours / (mtbfHours + mttrHours);
}

/** Series combination: all blocks must be up. */
export function seriesAvailability(values: number[]): number {
  return values.reduce((p, a) => p * a, 1);
}

/** Active-parallel (1-out-of-n) combination. */
export function parallelAvailability(values: number[]): number {
  return 1 - values.reduce((p, a) => p * (1 - a), 1);
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/**
 * k-out-of-n availability for n identical parallel units each with availability
 * `a` (system up if at least k of n units are up).
 */
export function kOfNAvailability(a: number, n: number, k: number): number {
  if (n <= 1 || k <= 0) return a;
  const kk = Math.min(Math.max(k, 1), n);
  let sum = 0;
  for (let i = kk; i <= n; i++) {
    sum += binomial(n, i) * Math.pow(a, i) * Math.pow(1 - a, n - i);
  }
  return sum;
}

/**
 * Unavailability contributed by a hosted software layer.
 * U_sw = lambda * [ c * MTTR_auto + (1 - c) * MTTR_reboot ] + planned-patch fraction.
 * Most faults are auto-recovered by the watchdog (coverage c); the rest force a
 * full reboot / manual intervention.
 */
export function softwareUnavailability(sw: SoftwareLayer): number {
  if (!sw.enabled) return 0;
  const lambdaPerHour = sw.failuresPerYear / HOURS_PER_YEAR;
  const meanDownPerFault =
    sw.watchdogCoverage * sw.mttrAutoHours + (1 - sw.watchdogCoverage) * sw.mttrRebootHours;
  const uFaults = lambdaPerHour * meanDownPerFault;
  const uPlanned = sw.plannedPatchHoursPerYear / HOURS_PER_YEAR;
  return Math.min(1, uFaults + uPlanned);
}

/**
 * Point (mean) availability of a component block, before it is placed in the
 * network. Includes node-level k-of-n redundancy and the optional software layer.
 */
export function componentPointAvailability(d: ComponentData): number {
  let base: number;
  switch (d.availabilitySource) {
    case 'WARRANTED':
      // Warranted % is the per-unit figure; node-level k-of-n redundancy (e.g. k of
      // n identical warranted BESS blocks) is applied on top of it.
      base = applyRedundancy(clamp01(d.warrantedAvailability), d);
      break;
    case 'SLA':
      base = applyRedundancy(clamp01(d.warrantedAvailability * d.slaAdjustment), d);
      break;
    case 'ESTIMATED':
    default:
      // Per-unit MTBF/MTTR; apply node-level k-of-n redundancy.
      base = applyRedundancy(pointAvailability(d.mtbfHours, d.mttrHours), d);
      break;
  }
  return base * (1 - softwareUnavailability(d.software));
}

/** Apply node-level k-of-n redundancy to a single-unit availability. */
export function applyRedundancy(unitAvailability: number, d: ComponentData): number {
  const n = Math.max(1, Math.round(d.redundancyN));
  const k = Math.max(1, Math.round(d.redundancyK));
  if (n <= 1) return unitAvailability;
  return kOfNAvailability(unitAvailability, n, Math.min(k, n));
}

/**
 * Minimum number of identical blocks (k) needed to cover a contracted power/energy
 * target, given each block's own MW/MWh rating — e.g. 10 blocks of 5 MW / 10 MWh
 * against a 40 MW / 80 MWh contract need at least 8 of the 10 blocks up. Returns
 * null when no capacity inputs are set, so the caller falls back to a manually
 * entered k (plain k-of-n redundancy, as used for control equipment).
 */
export function requiredBlocksForCapacity(
  blockPowerMW: number,
  blockEnergyMWh: number,
  contractedPowerMW: number,
  contractedEnergyMWh: number,
): number | null {
  const ratios: number[] = [];
  if (blockPowerMW > 0 && contractedPowerMW > 0) ratios.push(contractedPowerMW / blockPowerMW);
  if (blockEnergyMWh > 0 && contractedEnergyMWh > 0) ratios.push(contractedEnergyMWh / blockEnergyMWh);
  if (ratios.length === 0) return null;
  // Tolerance guards an exact ratio (e.g. 50 / 5 = 10) from rounding up to 11.
  return Math.max(1, Math.ceil(Math.max(...ratios) - 1e-9));
}

export interface CapacitySizing {
  /** Blocks required (k) to meet the contracted power/energy target. */
  requiredBlocks: number;
  nameplatePowerMW: number;
  nameplateEnergyMWh: number;
  /** How much more is built than required, as a percentage of the requirement. */
  marginPct: number;
}

/** Derive the capacity picture (required blocks, nameplate, margin) for a block node. */
export function capacitySizing(d: ComponentData): CapacitySizing | null {
  const k = requiredBlocksForCapacity(d.blockPowerMW, d.blockEnergyMWh, d.contractedPowerMW, d.contractedEnergyMWh);
  if (k === null) return null;
  const n = Math.max(1, Math.round(d.redundancyN));
  return {
    requiredBlocks: k,
    nameplatePowerMW: n * d.blockPowerMW,
    nameplateEnergyMWh: n * d.blockEnergyMWh,
    marginPct: ((n - k) / k) * 100,
  };
}

/**
 * Analytic one-sided lower confidence bound on MTBF from a Gamma(shape, rate)
 * epistemic posterior with shape = effective failures r and mean = MTBF point.
 * Equivalent to the chi-square interval theta_L = 2T / chi2_{conf}(2r).
 */
export function mtbfLowerBound(mtbfPoint: number, effectiveFailures: number, confidence: number): number {
  const r = Math.max(0.5, effectiveFailures);
  const T = r * mtbfPoint; // total operating hours implied by theta_hat = T/r
  const denom = chi2Inv(confidence, 2 * r);
  if (denom <= 0) return mtbfPoint;
  return (2 * T) / denom;
}

/**
 * A quick analytic lower bound on a single component's availability, using the
 * MTBF lower bound and an MTTR inflated by its lognormal spread. Used for
 * reference figures in the inspector; the system promise comes from the Monte
 * Carlo, which propagates the full joint uncertainty.
 */
export function componentAvailabilityLowerBound(d: ComponentData, confidence: number): number {
  if (d.availabilitySource !== 'ESTIMATED') {
    return componentPointAvailability(d);
  }
  const mtbfL = mtbfLowerBound(d.mtbfHours, d.effectiveFailures, confidence);
  // Inflate MTTR by roughly one sigma of its lognormal spread for a conservative bound.
  const mttrU = d.mttrHours * Math.exp(d.mttrLogSigma);
  const base = applyRedundancy(pointAvailability(mtbfL, mttrU), d);
  return base * (1 - softwareUnavailability(d.software));
}

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
