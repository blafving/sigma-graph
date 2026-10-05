/**
 * In-browser replacement for the `/v2/*` API.
 *
 * The explorer used to ask a FastAPI service, which asked Neo4j. The pipeline now publishes the
 * whole graph as one file (`app/export_static.py` -> `public/data/graph.json`) and these
 * functions answer the same three questions from it. Each one mirrors the Cypher it replaced in
 * `app/graph_v2.py`, with one deliberate difference: `queryGraph` returns every relationship.
 *
 * Pure and dependency-free on purpose: `e2e/graph-gate.mjs` imports this file directly to derive
 * its expectations, which only works while the syntax here stays erasable by Node.
 */
import type {
  GraphQuery,
  V2Edge,
  V2GraphResponse,
  V2Neighbour,
  V2Node,
  V2NodeDetail,
  V2SearchResponse,
} from './api-client.ts';

/** A node as exported: its Neo4j properties, verbatim. */
export interface RawNode {
  uid: string;
  name: string;
  type: string;
  typeGroup: string;
  stub: boolean;
  description?: string | null;
  file_path?: string | null;
  x?: number | null;
  y?: number | null;
  [property: string]: unknown;
}

export interface RawEdge {
  source: string;
  target: string;
  type: string;
  fields: string[];
}

export interface GraphData {
  generatedAt: string;
  nodes: RawNode[];
  edges: RawEdge[];
}

/** Cypher's ORDER BY on strings: by code point, not by locale. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Real notes only: stubs are unwritten references, Index pages are Obsidian navigation. */
const isNote = (n: RawNode): boolean => n.stub === false && n.type !== 'Index';

export function queryGraph(data: GraphData, q: GraphQuery = {}): V2GraphResponse {
  const types = new Set(q.types ?? []);
  const groups = new Set(q.groups ?? []);
  const minDegree = q.minDegree ?? 0;
  const limit = q.limit ?? 5000;

  const eligible = new Map<string, RawNode>();
  for (const n of data.nodes) {
    if (!isNote(n)) continue;
    if (types.size && !types.has(n.type)) continue;
    if (groups.size && !groups.has(n.typeGroup)) continue;
    eligible.set(n.uid, n);
  }

  const degree = new Map<string, number>();
  for (const e of data.edges) {
    if (!eligible.has(e.source) || !eligible.has(e.target)) continue;
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const nodes: V2Node[] = [];
  for (const n of eligible.values()) {
    const d = degree.get(n.uid) ?? 0;
    if (d < minDegree) continue;
    const node: V2Node = { id: n.uid, name: n.name, type: n.type, typeGroup: n.typeGroup, degree: d };
    if (n.description != null) node.description = n.description;
    if (n.file_path != null) node.filePath = n.file_path;
    if (n.x != null) node.x = n.x;
    if (n.y != null) node.y = n.y;
    nodes.push(node);
  }
  nodes.sort((a, b) => b.degree - a.degree || byText(a.name, b.name));
  nodes.length = Math.min(nodes.length, limit);

  // Every relationship, in its own direction. The API used to keep only `source < target` so a
  // mutual link was not drawn twice, which also hid each one-way link that happened to point
  // backwards alphabetically; drawing a pair once is the renderer's job (buildGraph).
  const kept = new Set(nodes.map((n) => n.id));
  const edges: V2Edge[] = [];
  for (const e of data.edges) {
    if (!kept.has(e.source) || !kept.has(e.target)) continue;
    const edge: V2Edge = { source: e.source, target: e.target, type: e.type };
    if (e.fields.length) edge.fields = e.fields;
    edges.push(edge);
  }

  const positioned = nodes.filter((n) => n.x != null).length;
  return {
    nodes,
    edges,
    count: nodes.length,
    edgeCount: edges.length,
    layout: { precomputed: nodes.length > 0 && positioned === nodes.length, positionsPresent: positioned },
  };
}

/** One node (stubs included) with every relationship touching it, or null if there is none. */
export function queryNode(data: GraphData, uid: string, limit = 200): V2NodeDetail | null {
  const node = data.nodes.find((n) => n.uid === uid);
  if (!node) return null;
  const byUid = new Map(data.nodes.map((n) => [n.uid, n]));

  const neighbours: V2Neighbour[] = [];
  for (const e of data.edges) {
    const out = e.source === uid;
    if (!out && e.target !== uid) continue;
    const other = byUid.get(out ? e.target : e.source);
    if (!other) continue;
    neighbours.push({
      id: other.uid,
      name: other.name,
      type: other.type,
      relation: e.type,
      direction: out ? 'out' : 'in',
      stub: other.stub,
    });
  }
  neighbours.sort(
    (a, b) => byText(a.direction, b.direction) || byText(a.relation, b.relation) || byText(a.name, b.name),
  );

  const properties: Record<string, unknown> = { ...node };
  delete properties.x;
  delete properties.y;

  return {
    id: node.uid,
    name: node.name,
    type: node.type,
    typeGroup: node.typeGroup,
    stub: node.stub,
    description: node.description ?? null,
    filePath: node.file_path ?? null,
    degree: neighbours.length,
    neighbours: neighbours.slice(0, limit),
    properties,
  };
}

/** Name/description substring search over real notes; exact, then prefix, then name matches first. */
export function querySearch(data: GraphData, query: string, limit = 25): V2SearchResponse {
  const needle = query.toLowerCase();
  const hits: Array<{ id: string; name: string; type: string; description?: string; rank: number }> = [];
  for (const n of data.nodes) {
    if (!isNote(n)) continue;
    const name = n.name.toLowerCase();
    const inName = name.includes(needle);
    if (!inName && !(n.description ?? '').toLowerCase().includes(needle)) continue;
    const rank = name === needle ? 0 : name.startsWith(needle) ? 1 : inName ? 2 : 3;
    const hit: (typeof hits)[number] = { id: n.uid, name: n.name, type: n.type, rank };
    if (n.description != null) hit.description = n.description;
    hits.push(hit);
  }
  hits.sort((a, b) => a.rank - b.rank || byText(a.name, b.name));
  const results = hits.slice(0, limit);
  return { results, query, count: results.length };
}
