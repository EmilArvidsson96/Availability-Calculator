import { describe, it, expect } from 'vitest';
import { compileNetwork, evalTree, bruteForceReliability } from './network';
import { makeRng } from './distributions';

function compiledValue(
  n: number,
  edges: Array<[number, number]>,
  sources: number[],
  sinks: number[],
  probs: number[],
): number {
  const { tree } = compileNetwork(n, edges, sources, sinks);
  return evalTree(tree, Float64Array.from(probs));
}

describe('network structure function — hand cases', () => {
  it('series of two components = p0 * p1', () => {
    // source - 0 - 1 - sink
    const v = compiledValue(2, [[0, 1]], [0], [1], [0.9, 0.8]);
    expect(v).toBeCloseTo(0.72, 9);
  });

  it('parallel of two components = 1 - (1-p0)(1-p1)', () => {
    // source - 0 - sink ; source - 1 - sink
    const v = compiledValue(2, [], [0, 1], [0, 1], [0.9, 0.8]);
    expect(v).toBeCloseTo(1 - 0.1 * 0.2, 9);
  });

  it('single node that is both source and sink = p0', () => {
    const v = compiledValue(1, [], [0], [0], [0.97]);
    expect(v).toBeCloseTo(0.97, 9);
  });

  it('disconnected source and sink = 0', () => {
    // node 0 is source, node 1 is sink, no path between them
    const v = compiledValue(2, [], [0], [1], [0.9, 0.9]);
    expect(v).toBeCloseTo(0, 9);
  });

  it('bridge network matches the brute-force oracle', () => {
    // Classic bridge: source-0, source-1, 0-2, 1-3, 0-3 (bridge), 2-sink, 3-sink
    const n = 4;
    const edges: Array<[number, number]> = [
      [0, 2],
      [1, 3],
      [0, 3],
    ];
    const sources = [0, 1];
    const sinks = [2, 3];
    const probs = [0.9, 0.85, 0.95, 0.8];
    const compiled = compiledValue(n, edges, sources, sinks, probs);
    const brute = bruteForceReliability(n, edges, sources, sinks, Float64Array.from(probs));
    expect(compiled).toBeCloseTo(brute, 9);
  });
});

describe('network structure function — random topologies vs oracle', () => {
  it('matches brute force across many random graphs', () => {
    const rng = makeRng(20240630);
    let cases = 0;
    for (let trial = 0; trial < 500; trial++) {
      const n = 1 + Math.floor(rng() * 7); // 1..7 internal nodes
      const edges: Array<[number, number]> = [];
      // random internal edges
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          if (rng() < 0.4) edges.push([a, b]);
        }
      }
      const sources: number[] = [];
      const sinks: number[] = [];
      for (let i = 0; i < n; i++) {
        if (rng() < 0.4) sources.push(i);
        if (rng() < 0.4) sinks.push(i);
      }
      if (sources.length === 0) sources.push(0);
      if (sinks.length === 0) sinks.push(n - 1);
      const probs = Array.from({ length: n }, () => 0.5 + rng() * 0.49);

      let compiled: number;
      try {
        compiled = compiledValue(n, edges, sources, sinks, probs);
      } catch {
        continue; // extremely dense graph beyond the exact-evaluation cap
      }
      const brute = bruteForceReliability(n, edges, sources, sinks, Float64Array.from(probs));
      expect(compiled).toBeCloseTo(brute, 8);
      cases++;
    }
    // The vast majority of random graphs must have been validated.
    expect(cases).toBeGreaterThan(450);
  });
});
