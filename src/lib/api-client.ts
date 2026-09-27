/**
 * v2 API client — `/v2/*` only.
 *
 * The legacy label-per-type endpoints (`/graph/full`, `/graph/types`, `POST /search`,
 * `/graph/{label}/{name}`) are not used by this app. They still exist server-side for the
 * pre-v2 explorer and disappear with the legacy purge (PAR-76), so nothing here may reach
 * for them.
 */
export const API_BASE: string =
  import.meta.env.VITE_API_URL || 'https://research-2-dqvr2eoj2a-uc.a.run.app';

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
  neo4j: string;
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

export function graphUrl(q: GraphQuery = {}): string {
  const p = new URLSearchParams();
  if (q.groups?.length) p.set('groups', q.groups.join(','));
  if (q.types?.length) p.set('types', q.types.join(','));
  if (typeof q.minDegree === 'number' && q.minDegree > 0) p.set('minDegree', String(q.minDegree));
  p.set('limit', String(q.limit ?? 20000));
  return `${API_BASE}/v2/graph?${p.toString()}`;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', signal });
  if (!res.ok) throw new ApiError(res.status, url);
  return (await res.json()) as T;
}

/** Full graph with precomputed positions. Filters are API params, never client-side scans. */
export function fetchGraph(q: GraphQuery = {}, signal?: AbortSignal): Promise<V2GraphResponse> {
  return getJson<V2GraphResponse>(graphUrl(q), signal);
}

/** One node plus its typed, directed neighbourhood. */
export function fetchNode(uid: string, signal?: AbortSignal, limit = 300): Promise<V2NodeDetail> {
  return getJson<V2NodeDetail>(
    `${API_BASE}/v2/node/${encodeURIComponent(uid)}?limit=${limit}`,
    signal,
  );
}

export function searchNodes(
  query: string,
  limit = 25,
  signal?: AbortSignal,
): Promise<V2SearchResponse> {
  return getJson<V2SearchResponse>(
    `${API_BASE}/v2/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    signal,
  );
}

export function fetchHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>(`${API_BASE}/health`);
}
