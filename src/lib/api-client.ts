const API_BASE = import.meta.env.VITE_API_URL || 'https://research-2-912098182204.us-central1.run.app';

export interface ApiNode {
  label: string;
  name: string;
  properties: Record<string, unknown>;
}

export interface ApiFullNode {
  id: string;
  label: string;
  name: string;
  properties: Record<string, unknown>;
}

export interface ApiRelationship {
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface FullGraphResponse {
  nodes: ApiFullNode[];
  relationships: ApiRelationship[];
}

export interface TypeCount {
  label: string;
  count: number;
}

export interface TypeCountsResponse {
  types: TypeCount[];
}

export interface SubgraphResponse {
  nodes: ApiFullNode[];
  relationships: ApiRelationship[];
  center: { label: string; name: string };
  hops: number;
}

export interface SearchResponse {
  results: ApiNode[];
  query: string;
  count: number;
}

export interface HealthResponse {
  status: string;
  neo4j: string;
  version: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function fetchFullGraph(limit = 10000): Promise<FullGraphResponse> {
  console.log('[API] fetchFullGraph: starting, limit=', limit);
  const res = await fetch(`${API_BASE}/graph/full?limit=${limit}`, { cache: 'no-store' });
  console.log('[API] graph/full: status=', res.status);
  if (!res.ok) throw new Error(`Failed to fetch full graph: ${res.status}`);
  const data = await res.json();
  console.log('[API] full graph: nodes=', data.nodes?.length || 0, 'rels=', data.relationships?.length || 0);
  return {
    nodes: data.nodes || [],
    relationships: data.relationships || [],
  };
}

export async function fetchTypeCounts(): Promise<TypeCountsResponse> {
  const res = await fetch(`${API_BASE}/graph/types`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch type counts: ${res.status}`);
  const data = await res.json();
  const types: TypeCount[] = data.types || [];
  return { types };
}

export async function searchNodes(query: string, limit = 50): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, limit }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function fetchSubgraph(label: string, name: string, hops = 2): Promise<SubgraphResponse> {
  const res = await fetch(`${API_BASE}/graph/${encodeURIComponent(label)}/${encodeURIComponent(name)}?hops=${hops}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Subgraph fetch failed: ${res.status}`);
  return res.json();
}

export { API_BASE };
