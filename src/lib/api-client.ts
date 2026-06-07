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
  const res = await fetch(`${API_BASE}/nodes?limit=${limit}`, { cache: 'no-store' });
  console.log('[API] nodes fetch: status=', res.status);
  if (!res.ok) throw new Error(`Failed to fetch nodes: ${res.status}`);
  const data = await res.json();
  console.log('[API] nodes parsed: count=', data.nodes ? data.nodes.length : 'null', 'keys=', Object.keys(data));

  // Build nodes with IDs
  // Use Neo4j label (from properties.label) + lowercase name for the ID so it matches
  // edge source/target from Cypher queries. The API returns n.label as the file import
  // type (e.g. "file_path") but Neo4j's actual node label is in properties.label (e.g. "Entity").
  // Edge Cypher uses labels(a)[0] + ':' + a.name which gives "Entity:lowercase-name".
  const nodes: ApiFullNode[] = (data.nodes || []).map((n: ApiNode) => {
    const props = n.properties as Record<string, string | undefined>;
    const neo4jLabel = props?.label || n.label;
    const nodeLabel = String(n.name || props?.name || '').toLowerCase();
    return {
      id: `${neo4jLabel}:${nodeLabel}`,
      label: n.label,
      name: n.name,
      properties: n.properties,
    };
  });
  console.log('[API] nodes built:', nodes.length);

  // Fetch edges via /query with a Cypher that returns all relationships
  console.log('[API] fetching edges...');
  const edgesRes = await fetch(`${API_BASE}/query`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `MATCH (a)-[r]-(b)
       RETURN labels(a)[0] + ':' + a.name AS source,
       labels(b)[0] + ':' + b.name AS target,
       type(r) AS type,
       r`,
    }),
  });

  let relationships: ApiRelationship[] = [];
  if (edgesRes.ok) {
    const edgeData = await edgesRes.json();
    console.log('[API] edges fetched: status=', edgesRes.status, 'records=', edgeData.records ? edgeData.records.length : 0);
    relationships = (edgeData.records || []).map((rec: any) => ({
      source: rec.source,
      target: rec.target,
      type: rec.type,
      properties: rec.r || {},
    }));
  } else {
    console.error('[API] edges fetch failed:', edgesRes.status);
  }

  console.log('[API] fetchFullGraph complete:', nodes.length, 'nodes,', relationships.length, 'edges');
  return { nodes, relationships };
}

export async function fetchTypeCounts(): Promise<TypeCountsResponse> {
  // Use /query to get label counts
  const res = await fetch(`${API_BASE}/query`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY count DESC',
    }),
  });
  if (!res.ok) throw new Error(`Failed to fetch type counts: ${res.status}`);
  const data = await res.json();
  const types: TypeCount[] = (data.records || []).map((rec: any) => ({
    label: rec.label,
    count: rec.count,
  }));
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
