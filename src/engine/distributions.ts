// ---------------------------------------------------------------------------
// Self-contained statistical helpers (no external dependencies).
//
// We need:
//  - a seeded PRNG so Monte Carlo runs are reproducible,
//  - Gamma and Lognormal samplers for epistemic parameter uncertainty,
//  - the inverse regularized incomplete Gamma (and chi-square quantile) for the
//    analytic confidence bounds and for validating the sampler in tests.
// ---------------------------------------------------------------------------

/** Mulberry32 seeded PRNG -> uniform in [0, 1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box-Muller. */
export function normalSample(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Lognormal sample with a target arithmetic MEAN and a log-space sigma.
 * We solve mu = ln(mean) - sigma^2/2 so that E[X] == mean exactly.
 */
export function lognormalSampleWithMean(rng: () => number, mean: number, sigma: number): number {
  if (mean <= 0) return 0;
  if (sigma <= 0) return mean;
  const mu = Math.log(mean) - (sigma * sigma) / 2;
  return Math.exp(mu + sigma * normalSample(rng));
}

/** Gamma sample (shape k > 0, scale theta) via Marsaglia-Tsang. */
export function gammaSample(rng: () => number, shape: number, scale = 1): number {
  if (shape <= 0) return 0;
  if (shape < 1) {
    // Boost: Gamma(k) = Gamma(k+1) * U^(1/k)
    const u = rng();
    return gammaSample(rng, shape + 1, scale) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x: number;
    let v: number;
    do {
      x = normalSample(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}

// --- Log-gamma (Lanczos approximation) -------------------------------------

const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function logGamma(z: number): number {
  if (z < 0.5) {
    // Reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = LANCZOS_C[0];
  for (let i = 1; i < LANCZOS_G + 2; i++) {
    x += LANCZOS_C[i] / (z + i);
  }
  const t = z + LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Regularized lower incomplete gamma P(s, x) = gamma(s, x) / Gamma(s).
 * Numerical Recipes style: series for x < s+1, continued fraction otherwise.
 */
export function lowerRegularizedGamma(s: number, x: number): number {
  if (x <= 0) return 0;
  if (s <= 0) return 1;
  const gln = logGamma(s);
  if (x < s + 1) {
    // Series expansion
    let ap = s;
    let sum = 1 / s;
    let del = sum;
    for (let n = 0; n < 1000; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + s * Math.log(x) - gln);
  }
  // Continued fraction for the complement Q(s, x), then P = 1 - Q.
  const tiny = 1e-30;
  let b = x + 1 - s;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  const q = Math.exp(-x + s * Math.log(x) - gln) * h;
  return 1 - q;
}

/**
 * Inverse of the regularized lower incomplete gamma: find x such that
 * P(s, x) == p. Bisection (robust; precision is ample for our use).
 */
export function gammaInv(p: number, s: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let lo = 0;
  let hi = Math.max(s + 10 * Math.sqrt(s + 1), 1);
  // Expand the upper bracket until it covers p.
  while (lowerRegularizedGamma(s, hi) < p && hi < 1e12) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (lowerRegularizedGamma(s, mid) < p) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Chi-square quantile (inverse CDF): value x with CDF_{chi2,dof}(x) = p. */
export function chi2Inv(p: number, dof: number): number {
  return 2 * gammaInv(p, dof / 2);
}
