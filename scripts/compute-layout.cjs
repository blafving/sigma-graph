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
 *                                  [--previous published-graph.json]
 *
 * With --previous (a published graph.json, or an earlier layout.json), every note that
 * already has a position keeps it exactly and only new notes are laid out, each starting
 * beside the notes it links to. The map then stays put between publishes instead of
 * rearranging whenever a note is added. Without it, or when the file is missing or shares
 * no notes with the vault, the whole map is laid out from scratch.
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
const previousFile = arg('previous', null);

// uid -> [x, y] from a published graph.json ({nodes: [{uid, x, y}]}) or a layout.json.
function readPrevious(file) {
  if (!file || !fs.existsSync(file)) return new Map();
  const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = Array.isArray(prev.nodes) ? prev.nodes.map((n) => [n.uid, [n.x, n.y]]) : Object.entries(prev);
  return new Map(entries.filter(([, xy]) => xy && Number.isFinite(xy[0]) && Number.isFinite(xy[1])));
}

// Deterministic stand-in for Math.random, so a new note lands in the same place on every run.
function unit(text, salt) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

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

const previous = readPrevious(previousFile);
const kept = graph.filterNodes((node) => previous.has(node));

if (kept.length) {
  // Incremental: pin what is already on the map, let ForceAtlas2 move only the newcomers.
  let reach = 0;
  for (const node of kept) {
    const [x, y] = previous.get(node);
    graph.mergeNodeAttributes(node, { x, y, fixed: true });
    reach = Math.max(reach, Math.hypot(x, y));
  }
  const added = graph.filterNodes((node) => !previous.has(node));
  for (const node of added) {
    const placed = graph.filterNeighbors(node, (nb) => previous.has(nb));
    const angle = unit(node, 1) * 2 * Math.PI;
    let x;
    let y;
    if (placed.length) {
      // beside the notes it links to, nudged off-centre so nothing starts stacked
      x = placed.reduce((sum, nb) => sum + previous.get(nb)[0], 0) / placed.length + Math.cos(angle) * 30;
      y = placed.reduce((sum, nb) => sum + previous.get(nb)[1], 0) / placed.length + Math.sin(angle) * 30;
    } else {
      // nothing to anchor to yet: start out on the rim
      x = Math.cos(angle) * reach * (0.8 + unit(node, 2) * 0.2);
      y = Math.sin(angle) * reach * (0.8 + unit(node, 2) * 0.2);
    }
    graph.mergeNodeAttributes(node, { x, y });
  }
  console.log(`incremental layout: ${kept.length} notes keep their position, ${added.length} new` +
              ` (${previous.size - kept.length} previous positions no longer in the vault)`);
  if (added.length) forceatlas2.assign(graph, { settings: forceatlas2.inferSettings(graph), iterations });

  const out = {};
  let bad = 0;
  graph.forEachNode((node, a) => {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) bad += 1;
    out[node] = previous.has(node) ? previous.get(node) : [Math.round(a.x * 100) / 100, Math.round(a.y * 100) / 100];
  });
  if (bad) {
    console.error(`FATAL: ${bad} nodes non-finite after incremental layout`);
    process.exit(1);
  }
  fs.writeFileSync(outFile, JSON.stringify(out));
  console.log(`wrote ${Object.keys(out).length} positions -> ${outFile}`);
  process.exit(0);
}
console.log(previousFile ? `no usable positions in ${previousFile}: laying out from scratch` : 'laying out from scratch');

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
