import { useCallback, useEffect, useRef, useState } from 'react';
import { DirectedGraph } from 'graphology';
import { fetchGraph } from '../lib/api-client';
import type { GraphQuery, V2GraphResponse } from '../lib/api-client';
import { groupColor } from '../lib/color-palette';

export interface GraphStats {
  /** Nodes the API returned (it omits nodes that have no precomputed position). */
  nodes: number;
  edges: number;
  /** Subset with finite x/y. Should equal `nodes` on a healthy load. */
  positioned: number;
  /** Relations the API returned; higher than `edges` because parallel types merge. */
  relations: number;
  groups: Map<string, number>;
  maxDegree: number;
  precomputed: boolean;
}

const EMPTY_STATS: GraphStats = {
  nodes: 0,
  edges: 0,
  relations: 0,
  positioned: 0,
  groups: new Map(),
  maxDegree: 1,
  precomputed: false,
};

const MIN_SIZE = 2.5;
const MAX_SIZE = 18;
/** Blend target for de-emphasised nodes: the map background. */
const BACKDROP: [number, number, number] = [13, 17, 28];

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  const n = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

/** Mix a color toward the backdrop, for reducer-side de-emphasis. */
export function dim(hex: string, amount = 0.72): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number, d: number) => Math.round(c + (d - c) * amount);
  return `rgb(${mix(r, BACKDROP[0])}, ${mix(g, BACKDROP[1])}, ${mix(b, BACKDROP[2])})`;
}

/** Degree to radius, square-rooted so the degree-192 hub does not swallow the map. */
export function sizeForDegree(degree: number, maxDegree: number): number {
  const d = Math.max(1, degree);
  const m = Math.max(1, maxDegree);
  return MIN_SIZE + (MAX_SIZE - MIN_SIZE) * Math.sqrt(d / m);
}

/**
 * Build a render graph straight from the API payload.
 *
 * Positions arrive precomputed (PAR-77): there is no client-side layout, and a node without
 * finite coordinates is dropped rather than parked on the origin, where it would punch NaN
 * through the renderer. Ids are unique by construction in the v2 identity-first model, so
 * there is no dedupe pass, and edges are keyed so nothing can stack duplicates.
 */
export function buildGraph(data: V2GraphResponse): { graph: DirectedGraph; stats: GraphStats } {
  const graph = new DirectedGraph();
  const groups = new Map<string, number>();
  let maxDegree = 1;
  for (const n of data.nodes) {
    if (n.degree > maxDegree) maxDegree = n.degree;
    const g = n.typeGroup || 'Other';
    groups.set(g, (groups.get(g) || 0) + 1);
  }

  let positioned = 0;
  for (const n of data.nodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    positioned += 1;
    const color = groupColor(n.typeGroup);
    graph.addNode(n.id, {
      label: n.name,
      x: n.x as number,
      y: n.y as number,
      size: sizeForDegree(n.degree, maxDegree),
      color,
      // Precomputed so the node reducer never does string math per frame.
      dimColor: dim(color),
      // `type` is sigma's renderer discriminator; keep our category out of its way.
      nodeType: n.typeGroup || 'Other',
      nodeKind: n.type,
      degree: n.degree,
      stub: Boolean(n.stub),
      filePath: n.filePath ?? null,
    });
  }

  // The API keys edges by relation type, so one node pair can arrive several times (419 pairs
  // carry RELATED_TO + MENTIONS, up to 3 types). graphology's non-multi Graph - which is what
  // sigma requires - stores a single edge per ordered pair and throws on the second one, so
  // parallel relations merge into one edge that lists them all. 2019 relations -> 1592 edges.
  let relations = 0;
  for (const e of data.edges) {
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue;
    relations += 1;
    const key = `${e.source}\u0000${e.target}`;
    if (graph.hasEdge(key)) {
      const attrs = graph.getEdgeAttributes(key);
      if (e.type && !attrs.relations.includes(e.type)) attrs.relations.push(e.type);
      for (const f of e.fields || []) if (!attrs.fieldNames.includes(f)) attrs.fieldNames.push(f);
      continue;
    }
    graph.addDirectedEdgeWithKey(key, e.source, e.target, {
      label: e.type,
      relation: e.type,
      relations: [e.type],
      fieldNames: [...(e.fields || [])],
      size: 0.5,
      color: '#48566e',
      dimColor: dim('#48566e', 0.85),
    });
  }
  const added = graph.size;

  return {
    graph,
    stats: {
      nodes: data.nodes.length,
      edges: added,
      relations,
      positioned,
      groups,
      maxDegree,
      precomputed: Boolean(data.layout?.precomputed),
    },
  };
}

/**
 * Copy `source` into the stable `target` instance so sigma never swaps graphs.
 *
 * `forEachEdge` yields the edge **key** as its first argument (arity is
 * `edge, attributes, source, target, sourceAttributes, targetAttributes, undirected`); there
 * is no trailing key argument. Keying on a non-string here silently collapses every edge onto
 * the same index, which is how a 1592-edge map once came back with size 1.
 */
function applyInto(target: DirectedGraph, source: DirectedGraph): void {
  target.clear();
  source.forEachNode((node, attrs) => target.addNode(node, attrs));
  source.forEachEdge((edge, attrs, sourceNode, targetNode) => {
    if (typeof edge !== 'string') return;
    if (!target.hasEdge(edge)) target.addDirectedEdgeWithKey(edge, sourceNode, targetNode, attrs);
  });
}

export interface UseGraphData {
  /** Stable instance: filters re-fill it instead of remounting the renderer. */
  graph: DirectedGraph;
  stats: GraphStats;
  loading: boolean;
  error: string | null;
  /** Bumped on every successful load so the canvas knows to refresh. */
  revision: number;
  reload: () => void;
}

/**
 * Fetch and build once per query. Filters are API params, so a filter change is a new request;
 * the graph instance stays the same object, which keeps sigma's index and camera alive.
 */
export function useGraphData(query: GraphQuery): UseGraphData {
  const instanceRef = useRef<DirectedGraph | null>(null);
  if (instanceRef.current === null) instanceRef.current = new DirectedGraph();
  const graph = instanceRef.current;

  const [stats, setStats] = useState<GraphStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [nonce, setNonce] = useState(0);

  const key = JSON.stringify(query);

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGraph(JSON.parse(key) as GraphQuery, ctrl.signal)
      .then((data) => {
        if (cancelled) return;
        const built = buildGraph(data);
        applyInto(graph, built.graph);
        setStats(built.stats);
        setRevision((r) => r + 1);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [graph, key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { graph, stats, loading, error, revision, reload };
}
