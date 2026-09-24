#!/usr/bin/env node
/*
 * Precompute ForceAtlas2 positions for the v2 graph (PAR-77).
 *
 * Same algorithm and library the explorer used to run at render time
 * (graphology-layout-forceatlas2, the engine behind @react-sigma/layout-forceatlas2),
 * run once here so the browser never lays out again and node positions stop
 * changing between reloads.
 *
 *   node scripts/compute-layout.cjs [--in app/out/vault_graph.json]
 *                                  [--out app/out/layout.json] [--iterations N]
 *                                  [--extent PX] [--main-only]
 */
const fs = require('fs');
const path = require('path');
const Graph = require('graphology');
const forceatlas2 = require('graphology-layout-forceatlas2');
const { random: randomLayout } = require('graphology-layout');

const root = path.resolve(__dirname, '..', '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const inFile = path.resolve(root, arg('in', 'app/out/vault_graph.json'));
const outFile = path.resolve(root, arg('out', 'app/out/layout.json'));
const iterations = Number(arg('iterations', 300));
const extent = Number(arg('extent', 4000));
const mainOnly = flag('main-only');

const payload = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const STUB_TYPES = new Set(['Index']);
const keep = (n) => !n.stub && !STUB_TYPES.has(n.type);
const nodes = payload.nodes.filter(keep);
const ids = new Set(nodes.map((n) => n.uid));

const graph = new Graph({ type: 'undirected', multi: false });
for (const n of nodes) graph.addNode(n.uid, { type: n.type, size: 1 });
for (const e of payload.edges) {
  if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
  if (!graph.hasEdge(e.source, e.target)) graph.addEdge(e.source, e.target, { weight: 1 });
}
// Degree-weight node size: FA2 in the explorer scaled nodes by degree.
graph.forEachNode((node, attrs) => {
  graph.setNodeAttribute(node, 'size', 4 + Math.sqrt(graph.degree(node)) * 2);
});

// Largest component first: FA2 flings disconnected fragments to unpredictable
// distances, so optionally lay out the main component and place the rest later.
const components = [];
const seen = new Set();
graph.forEachNode((node) => {
  if (seen.has(node)) return;
  const stack = [node];
  const comp = [];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    comp.push(n);
    graph.forEachNeighbor(n, (nb) => { if (!seen.has(nb)) stack.push(nb); });
  }
  components.push(comp);
});
components.sort((a, b) => b.length - a.length);
console.log(`components: ${components.length}  sizes: ${components.slice(0, 5).map((c) => c.length).join(', ')}`);

// --main-only lays out the largest component and leaves fragments at the origin,
// which keeps outlier components from being flung to absurd distances.
const active = mainOnly ? new Set(components[0]) : null;
const settings = forceatlas2.inferSettings(graph);
if (active) {
  settings.gravity = 2;          // pull disconnected fragments toward the middle
  graph.forEachNode((node, a) => {
    if (!active.has(node)) { graph.setNodeAttribute(node, 'x', 0); graph.setNodeAttribute(node, 'y', 0); }
  });
}
// graphology-layout's `random()` only RETURNS positions; `random.assign()` writes
// them. Seeding is mandatory: ForceAtlas2 0.10.1 integrates from the coordinates
// present in its matrices, so nodes without x/y silently become NaN everywhere.
randomLayout.assign(graph, { scale: 200 });
console.log(`running ForceAtlas2 (${iterations} iterations, ${graph.order} nodes, ${graph.size} edges, mainOnly=${!!active})`);
forceatlas2.assign(graph, { settings, iterations });

let nan = 0;
graph.forEachNode((node, a) => {
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) nan += 1;
});
if (nan) {
  console.error(`FATAL: ${nan} nodes still non-finite after layout`);
  process.exit(1);
}

// Rescale into a predictable box so the explorer opens at a sane zoom.
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
graph.forEachNode((node, a) => {
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return;
  minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
  minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y);
});
const spanX = Math.max(1e-6, maxX - minX);
const spanY = Math.max(1e-6, maxY - minY);
const scale = Math.min(extent / spanX, extent / spanY);
const out = {};
let clipped = 0;
graph.forEachNode((node, a) => {
  if (active && !active.has(node)) return;
  let x = ((a.x - minX) / spanX - 0.5) * (spanX * scale);
  let y = ((a.y - minY) / spanY - 0.5) * (spanY * scale);
  if (!Number.isFinite(x) || !Number.isFinite(y)) { x = 0; y = 0; clipped += 1; }
  out[node] = [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
});
fs.writeFileSync(outFile, JSON.stringify(out));
const xs = Object.values(out).map((v) => v[0]);
const ys = Object.values(out).map((v) => v[1]);
console.log(`wrote ${Object.keys(out).length} positions -> ${outFile}`);
console.log(`extent x [${Math.min(...xs).toFixed(0)}, ${Math.max(...xs).toFixed(0)}] ` +
            `y [${Math.min(...ys).toFixed(0)}, ${Math.max(...ys).toFixed(0)}] non-finite reset: ${clipped}`);
