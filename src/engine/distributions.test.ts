import { describe, it, expect } from 'vitest';
import {
  makeRng,
  gammaSample,
  lognormalSampleWithMean,
  lowerRegularizedGamma,
  gammaInv,
  chi2Inv,
} from './distributions';

describe('incomplete gamma', () => {
  it('P(1, x) = 1 - e^-x (exponential CDF)', () => {
    for (const x of [0.5, 1, 2, 5]) {
      expect(lowerRegularizedGamma(1, x)).toBeCloseTo(1 - Math.exp(-x), 6);
    }
  });

  it('gammaInv inverts lowerRegularizedGamma', () => {
    for (const s of [0.7, 1, 3, 10]) {
      for (const p of [0.05, 0.5, 0.95]) {
        const x = gammaInv(p, s);
        expect(lowerRegularizedGamma(s, x)).toBeCloseTo(p, 4);
      }
    }
  });

  it('chi-square quantiles match known textbook values', () => {
    // chi2_{0.95}(2) ~ 5.991, chi2_{0.95}(10) ~ 18.307
    expect(chi2Inv(0.95, 2)).toBeCloseTo(5.991, 1);
    expect(chi2Inv(0.95, 10)).toBeCloseTo(18.307, 1);
    expect(chi2Inv(0.05, 10)).toBeCloseTo(3.94, 1);
  });
});

describe('samplers', () => {
  it('gamma sample mean ~ shape * scale', () => {
    const rng = makeRng(42);
    const shape = 5;
    const scale = 2;
    let sum = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) sum += gammaSample(rng, shape, scale);
    expect(sum / N).toBeCloseTo(shape * scale, 0);
  });

  it('lognormal sample mean matches target', () => {
    const rng = makeRng(7);
    const mean = 3;
    let sum = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) sum += lognormalSampleWithMean(rng, mean, 0.5);
    expect(sum / N).toBeCloseTo(mean, 0);
  });
});
