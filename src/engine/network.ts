// ---------------------------------------------------------------------------
// Network availability: turn a topology (components + connectivity on one layer)
// into the probability that a SOURCE reaches a SINK through "up" components.
//
// Components are the unreliable elements (each up with probability A_i);
// connections are perfect. We add a virtual perfect SUPER-SOURCE joined to every
// designated source, and a virtual perfect SINK joined to the delivery node, then
// compute 2-terminal reliability.
//
// The topology is fixed across Monte Carlo draws while only the A_i change, so we
// COMPILE the structure into a reusable evaluation tree once and evaluate it per
// draw in O(tree size). Two exact strategies:
//   1. Series / parallel reduction — handles the overwhelmingly common case of
//      series chains with parallel redundancy. Non-duplicating and exact.
//   2. For any residual non-series-parallel topology (e.g. a bridge), exact
//      inclusion-exclusion over minimal source-sink paths.
//
// `bruteForceReliability` is an independent O(2^n) oracle used to validate the
// compiler in tests.
// ---------------------------------------------------------------------------

export type RelTree =
  | { op: 'const'; value: number }
  | { op: 'var'; index: number }
  | { op: 'series'; children: RelTree[] }
  | { op: 'parallel'; children: RelTree[] }
  | { op: 'ie'; terms: Array<{ sign: number; vars: number[] }> };

const ONE: RelTree = { op: 'const', value: 1 };
const ZERO: RelTree = { op: 'const', value: 0 };

export function evalTree(t: RelTree, probs: Float64Array): number {
  switch (t.op) {
    case 'const':
      return t.value;
    case 'var':
      return probs[t.index];
    case 'series': {
      let p = 1;
      for (const c of t.children) p *= evalTree(c, probs);
      return p;
    }
    case 'parallel': {
      let q = 1;
      for (const c of t.children) q *= 1 - evalTree(c, probs);
      return 1 - q;
    }
    case 'ie': {
      let sum = 0;
      for (const term of t.terms) {
        let prod = term.sign;
        for (const v of term.vars) prod *= probs[v];
        sum += prod;
      }
      return sum;
    }
  }
}

function seriesOf(children: RelTree[]): RelTree {
  const flat: RelTree[] = [];
  for (const c of children) {
    if (c.op === 'const') {
      if (c.value === 0) return ZERO;
      if (c.value === 1) continue;
    }
    if (c.op === 'series') flat.push(...c.children);
    else flat.push(c);
  }
  if (flat.length === 0) return ONE;
  if (flat.length === 1) return flat[0];
  return { op: 'series', children: flat };
}

function parallelOf(a: RelTree, b: RelTree): RelTree {
  const parts = [a, b];
  const children: RelTree[] = [];
  for (const t of parts) {
    if (t.op === 'const' && t.value === 1) return ONE;
    if (t.op === 'const' && t.value === 0) continue;
    if (t.op === 'parallel') children.push(...t.children);
    else children.push(t);
  }
  if (children.length === 0) return ZERO;
  if (children.length === 1) return children[0];
  return { op: 'parallel', children };
}

// --- Working graph (pure node reliability; edges carry RelTrees) ------------

interface WEdge {
  tree: RelTree;
}

interface WGraph {
  vertices: Set<number>;
  terminals: Set<number>;
  edges: Map<string, WEdge>;
  adj: Map<number, Set<number>>;
}

const ekey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function newGraph(): WGraph {
  return { vertices: new Set(), terminals: new Set(), edges: new Map(), adj: new Map() };
}

function addVertex(g: WGraph, v: number) {
  if (!g.vertices.has(v)) {
    g.vertices.add(v);
    g.adj.set(v, new Set());
  }
}

function addEdge(g: WGraph, a: number, b: number, tree: RelTree) {
  if (a === b) return;
  addVertex(g, a);
  addVertex(g, b);
  const k = ekey(a, b);
  const existing = g.edges.get(k);
  if (existing) {
    existing.tree = parallelOf(existing.tree, tree);
  } else {
    g.edges.set(k, { tree });
    g.adj.get(a)!.add(b);
    g.adj.get(b)!.add(a);
  }
}

function removeVertex(g: WGraph, v: number) {
  for (const u of g.adj.get(v) ?? []) {
    g.edges.delete(ekey(u, v));
    g.adj.get(u)?.delete(v);
  }
  g.adj.delete(v);
  g.vertices.delete(v);
}

/** Series / parallel / degree-1 reductions until none apply. Exact, non-duplicating. */
function reduce(g: WGraph) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const v of Array.from(g.vertices)) {
      if (g.terminals.has(v)) continue;
      const deg = g.adj.get(v)?.size ?? 0;
      if (deg <= 1) {
        // Dead-end: cannot lie on a source-sink path.
        removeVertex(g, v);
        changed = true;
        break;
      }
      if (deg === 2) {
        // Series: a-v-b becomes an a-b edge gated by v's reliability.
        const [a, b] = Array.from(g.adj.get(v)!);
        const ta = g.edges.get(ekey(a, v))!.tree;
        const tb = g.edges.get(ekey(v, b))!.tree;
        const through = seriesOf([ta, { op: 'var', index: v }, tb]);
        removeVertex(g, v);
        addEdge(g, a, b, through);
        changed = true;
        break;
      }
    }
  }
}

function connected(g: WGraph, s: number, t: number): boolean {
  if (s === t) return true;
  if (!g.vertices.has(s) || !g.vertices.has(t)) return false;
  const seen = new Set<number>([s]);
  const stack = [s];
  while (stack.length) {
    const u = stack.pop()!;
    if (u === t) return true;
    for (const w of g.adj.get(u) ?? []) {
      if (!seen.has(w)) {
        seen.add(w);
        stack.push(w);
      }
    }
  }
  return false;
}

const MAX_IE_PATHS = 22;

/** Enumerate minimal source-sink paths as sets of internal vertices. */
function minimalPaths(
  adj: Map<number, Set<number>>,
  source: number,
  sink: number,
): number[][] {
  const paths: number[][] = [];
  const visited = new Set<number>([source]);
  const stack: number[] = [];
  const dfs = (u: number) => {
    if (paths.length > 5000) return; // safety valve
    if (u === sink) {
      paths.push([...stack]);
      return;
    }
    for (const w of adj.get(u) ?? []) {
      if (visited.has(w)) continue;
      visited.add(w);
      if (w !== sink) stack.push(w);
      dfs(w);
      if (w !== sink) stack.pop();
      visited.delete(w);
    }
  };
  dfs(source);
  // Keep only minimal paths (no vertex set is a superset of another).
  const sets = paths.map((p) => new Set(p));
  const minimal: number[][] = [];
  for (let i = 0; i < sets.length; i++) {
    let dominated = false;
    for (let j = 0; j < sets.length; j++) {
      if (i === j) continue;
      // sets[i] dominated if it is a superset of sets[j] (j is a tighter path)
      if (sets[j].size < sets[i].size && [...sets[j]].every((x) => sets[i].has(x))) {
        dominated = true;
        break;
      }
      if (sets[j].size === sets[i].size && j < i && [...sets[j]].every((x) => sets[i].has(x))) {
        dominated = true;
        break;
      }
    }
    if (!dominated) minimal.push(paths[i]);
  }
  return minimal;
}

/** Build an exact inclusion-exclusion tree from minimal paths (vertex sets). */
function inclusionExclusionTree(paths: number[][]): RelTree {
  const P = paths.length;
  if (P === 0) return ZERO;
  if (P > MAX_IE_PATHS) {
    throw new Error('Topology too complex to evaluate exactly; simplify or split the network.');
  }
  const pathSets = paths.map((p) => p.slice().sort((x, y) => x - y));
  const acc = new Map<string, { sign: number; vars: number[] }>();
  const total = 1 << P;
  for (let mask = 1; mask < total; mask++) {
    const union = new Set<number>();
    let bits = 0;
    for (let i = 0; i < P; i++) {
      if (mask & (1 << i)) {
        bits++;
        for (const v of pathSets[i]) union.add(v);
      }
    }
    const sign = bits % 2 === 1 ? 1 : -1;
    const vars = Array.from(union).sort((x, y) => x - y);
    const key = vars.join(',');
    const cur = acc.get(key);
    if (cur) cur.sign += sign;
    else acc.set(key, { sign, vars });
  }
  const terms = Array.from(acc.values()).filter((t) => t.sign !== 0);
  return { op: 'ie', terms };
}

export interface CompiledNetwork {
  tree: RelTree;
  hasSource: boolean;
  hasSink: boolean;
}

const SOURCE = -1;
const SINK = -2;

/**
 * Compile a layer's topology into an evaluation tree.
 * @param n           number of components (probability indices 0..n-1)
 * @param edges       connections on this layer, as [i, j] component-index pairs
 * @param sourceIdxs  components joined to the virtual super-source
 * @param sinkIdxs    components joined to the virtual sink (delivery point)
 */
export function compileNetwork(
  n: number,
  edges: Array<[number, number]>,
  sourceIdxs: number[],
  sinkIdxs: number[],
): CompiledNetwork {
  const hasSource = sourceIdxs.length > 0;
  const hasSink = sinkIdxs.length > 0;
  if (!hasSource || !hasSink) return { tree: ZERO, hasSource, hasSink };

  const build = (): WGraph => {
    const g = newGraph();
    g.terminals.add(SOURCE);
    g.terminals.add(SINK);
    addVertex(g, SOURCE);
    addVertex(g, SINK);
    for (let i = 0; i < n; i++) addVertex(g, i);
    for (const [a, b] of edges) addEdge(g, a, b, ONE);
    for (const s of sourceIdxs) addEdge(g, SOURCE, s, ONE);
    for (const t of sinkIdxs) addEdge(g, t, SINK, ONE);
    return g;
  };

  // Strategy 1: series / parallel reduction.
  const g = build();
  reduce(g);
  if (!connected(g, SOURCE, SINK)) return { tree: ZERO, hasSource, hasSink };
  const internal = Array.from(g.vertices).filter((v) => !g.terminals.has(v));
  if (internal.length === 0) {
    const e = g.edges.get(ekey(SOURCE, SINK));
    return { tree: e ? e.tree : ZERO, hasSource, hasSink };
  }

  // Strategy 2: residual non-series-parallel topology -> inclusion-exclusion.
  const full = build();
  const paths = minimalPaths(full.adj, SOURCE, SINK);
  return { tree: inclusionExclusionTree(paths), hasSource, hasSink };
}

/**
 * Independent O(2^n) oracle: exact source-sink reliability by enumerating every
 * up/down combination of the n internal components. For tests and tiny graphs.
 */
export function bruteForceReliability(
  n: number,
  edges: Array<[number, number]>,
  sourceIdxs: number[],
  sinkIdxs: number[],
  probs: Float64Array,
): number {
  if (sourceIdxs.length === 0 || sinkIdxs.length === 0) return 0;
  const S = n;
  const T = n + 1;
  const adj: number[][] = Array.from({ length: n + 2 }, () => []);
  const link = (a: number, b: number) => {
    adj[a].push(b);
    adj[b].push(a);
  };
  for (const [a, b] of edges) link(a, b);
  for (const s of sourceIdxs) link(S, s);
  for (const t of sinkIdxs) link(t, T);

  let total = 0;
  const combos = 1 << n;
  for (let mask = 0; mask < combos; mask++) {
    let p = 1;
    for (let i = 0; i < n; i++) p *= mask & (1 << i) ? probs[i] : 1 - probs[i];
    if (p === 0) continue;
    const up = (v: number) => v === S || v === T || mask & (1 << v);
    const seen = new Set<number>([S]);
    const stack = [S];
    let reached = false;
    while (stack.length) {
      const u = stack.pop()!;
      if (u === T) {
        reached = true;
        break;
      }
      for (const w of adj[u]) {
        if (up(w) && !seen.has(w)) {
          seen.add(w);
          stack.push(w);
        }
      }
    }
    if (reached) total += p;
  }
  return total;
}
