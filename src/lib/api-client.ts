/**
 * Graph data client.
 *
 * Same functions the explorer has always called, but nothing here talks to a server any more:
 * the whole graph is one published file (`app/export_static.py` writes it), loaded once, and
 * `graph-store.ts` answers each question from it in the browser. The response shapes are the
 * `/v2/*` API's, unchanged, so the rest of the app did not have to move.
 */
import { queryGraph, queryNode, querySearch, type GraphData } from './graph-store.ts';

/** Where the published graph lives, relative to the app. Exposed as `__kg.api` for the gate. */
export const API_BASE: string = `${import.meta.env.BASE_URL}data/graph.json`;

export interface V2Node {
  id: string;
  name: string;
  type: string;
  typeGroup: string;
  degree: number;
  description?: string | null;
  filePath?: string | null;
  stub?: boolean;
  x?: number | null;
  y?: number | null;
}

export interface V2Edge {
  source: string;
  target: string;
  type: string;
  /** Relation names merged into this edge by the API. */
  fields?: string[];
}

export interface V2GraphResponse {
  count: number;
  edgeCount: number;
  nodes: V2Node[];
  edges: V2Edge[];
  layout?: { precomputed?: boolean; positionsPresent?: number } | null;
}

export interface GraphQuery {
  groups?: string[];
  types?: string[];
  minDegree?: number;
  limit?: number;
}

export interface V2Neighbour {
  id: string;
  name: string;
  type: string;
  relation: string;
  direction: 'in' | 'out';
  stub?: boolean;
}

export interface V2NodeDetail {
  id: string;
  name: string;
  type: string;
  typeGroup: string;
  degree: number;
  description?: string | null;
  filePath?: string | null;
  stub?: boolean;
  neighbours: V2Neighbour[];
  properties: Record<string, unknown>;
}

export interface V2SearchResponse {
  count: number;
  query: string;
  results: Array<{ id: string; name: string; type: string; description?: string }>;
}

export interface HealthResponse {
  status: string;
  /** When the published graph was exported. */
  version: string;
}

export class ApiError extends Error {
  status: number;
  url: string;

  constructor(status: number, url: string) {
    super(`API ${status} from ${url}`);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }
}

let loading: Promise<GraphData> | null = null;

/** The published graph, fetched once per page load. A failed load is retried on the next call. */
function loadData(): Promise<GraphData> {
  if (!loading) {
    loading = (async () => {
      const res = await fetch(API_BASE, { cache: 'no-cache' });
      if (!res.ok) throw new ApiError(res.status, API_BASE);
      return (await res.json()) as GraphData;
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

/** Full graph with precomputed positions, filtered the way the API used to filter it. */
export async function fetchGraph(q: GraphQuery = {}, signal?: AbortSignal): Promise<V2GraphResponse> {
  const data = await loadData();
  throwIfAborted(signal);
  return queryGraph(data, { ...q, limit: q.limit ?? 20000 });
}

/** One node plus its typed, directed neighbourhood. */
export async function fetchNode(uid: string, signal?: AbortSignal, limit = 300): Promise<V2NodeDetail> {
  const data = await loadData();
  throwIfAborted(signal);
  const node = queryNode(data, uid, limit);
  if (!node) throw new ApiError(404, `${API_BASE}#${uid}`);
  return node;
}

export async function searchNodes(
  query: string,
  limit = 25,
  signal?: AbortSignal,
): Promise<V2SearchResponse> {
  const data = await loadData();
  throwIfAborted(signal);
  return querySearch(data, query, limit);
}

/** "Healthy" now means the published graph file loaded. */
export async function fetchHealth(): Promise<HealthResponse> {
  const data = await loadData();
  return { status: 'ok', version: data.generatedAt };
}
