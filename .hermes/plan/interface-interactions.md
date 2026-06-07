# Interface Interactions & API Plan

## Status: ✅ RELATIONSHIPS FIXED

The edge rendering issue is resolved. The graph now shows all 874 nodes and ~794 relationships.

### What was fixed (merged to main via fix-relationships branch)

1. **Node ID case mismatch** — API returns mixed-case names but Cypher uses lowercase. Fixed by lowercasing IDs.
2. **useSetSettings destroying loaded graph** — Settings changes recreated the Sigma instance with empty graph. Fixed by passing settings as props to `<SigmaContainer>`.
3. **Stats bar `order` vs `size`** — graphology convention: `order`=nodes, `size`=edges. Fixed.
4. **Neo4j label vs API label mismatch** — API `n.label` is file type (e.g. `file_path`) but Neo4j label is `properties.label` (e.g. `Entity`). Fixed node IDs to use Neo4j label.
5. **Duplicate edges from Cypher** — `MATCH (a)-[r]-(b)` returns both directions. Added `forEachEdge` dedup check.
6. **Missing nodes from edge references** — Nodes only referenced by edges (not in API node list) were skipped. Now auto-created on demand.

terface Interactions & API Plan

## Current State

### Backend endpoints (research-2-912098182204.us-central1.run.app)

| Endpoint | Method | Status |
|----------|--------|--------|
| `/health` | GET | ✅ 200 |
| `/nodes?limit=N` | GET | ✅ 200 |
| `/query` | POST (Cypher) | ✅ 200 |
| `/search` | POST (json `q`) | ✅ 200 |
| `/graph/{label}/{name}?hops=N` | GET | ❌ 404 / Cypher syntax error |

### Frontend flow

```
App mount
  └── GraphView
       └── GraphCanvasInner
            ├── useGraphData → fetchFullGraph() [GET /nodes + POST /query for edges]
            │     └── loadGraph(g) → sigma.import(graph) → sigma.refresh()
            │     └── sigmaGraphRef.current = sigma.getGraph()
            │
            ├── useEffect(layout) → runs when graphLoaded=true
            │     └── forceAtlas2 layout on sigmaGraphRef.current
            │
            ├── useEffect(filt ers) → runs when visibleTypes/searchQuery change
            │     └── applyFilters(graphRef.current) → hides/shows nodes by type+search
            │
            └── useRegisterEvents
                  └── clickNode → onNodeClick → fetchSubgraph(label, name)
                        └── BUG: calls /graph/{label}/{name} which returns 404
```

## Problems

### 1. Click node → 404 subgraph error
**Root cause:** `fetchSubgraph` calls `GET /graph/{label}/{name}` which is broken on the remote backend.
**Impact:** Clicking any node shows error in console, detail panel stays empty.

### 2. No "see whole graph" zoom works well
**Current:** `useCamera().goto()` with ratio 0.5 on subgraph click, but the "See whole graph" button may not fit all 874 nodes.

### 3. Detail panel shows no data
Because subgraph fetch fails, the `selectedNode` detail panel shows relationships from nowhere.

### 4. Node list search/filter doesn't work well
`NodeList` filters client-side but `useGraphFilters` applies filters via `applyFilters` which hides nodes but doesn't actually remove them from sigma's graph (sets size=0).

## Desired Behavior

### Node click interaction
```
User clicks node in sigma canvas
  → Extract label:name from node.id (e.g. "file_path:Astral")
  → Fetch subgraph from backend: GET /graph/{label}/{name}?hops=2
    → Backend returns { nodes, relationships, center, hops }
  → On success:
    - Pan camera to clicked node
    - Show detail panel with node properties + relationships
    - Highlight connected subgraph in canvas
  → On failure (404/backend error):
    - Still show node detail panel from existing graph data
    - Try to fetch relationships via POST /query with a targeted Cypher
    - Gracefully degrade (no relationships shown)
```

### Search interaction
```
User types in search box
  → Debounce 300ms
  → POST /search?q=query&limit=50
  → Filter node list sidebar results
  → Also filter graph visibility (hide non-matching nodes)
```

### Type filter
```
User clicks type in sidebar
  → Toggle visibility of that type's nodes
  → Graph hides/shows via size=0 approach
```

### "See whole graph" button
```
User clicks "See whole graph"
  → Pan camera to fit all visible nodes
```

## Implementation Plan

### Phase 1: Fix subgraph click (local fallback)
**Goal:** Clicking a node works even when backend `/graph` endpoint is broken.

Steps:
1. In `onNodeClick`, wrap `fetchSubgraph` in try/catch
2. On 404/failure, fall back to computing relationships locally:
   - Use the already-loaded graph data in `graphRef.current`
   - Find all edges connected to the clicked node
   - Fetch connected nodes from the same graph
3. Show the detail panel with locally-computed data
4. Keep `fetchSubgraph` call for when backend is fixed

### Phase 2: Add targeted relationship query
**Goal:** Fetch relationships for a specific node when backend has the `/graph` endpoint working.

Steps:
1. Add `fetchNodeRelationships(label, name)` to api-client.ts
   - Uses `POST /query` with Cypher:
     ```
     MATCH (a)-[r]-(b)
     WHERE labels(a)[0] = $label AND a.name = $name
     RETURN labels(a)[0] + ':' + a.name AS source,
            labels(b)[0] + ':' + b.name AS target,
            type(r) AS type, r
     ```
2. Call this from `onNodeClick` as primary method (with `/graph` as fallback)

### Phase 3: Improve search UX
**Goal:** Search filters both sidebar and graph.

Steps:
1. Add debounce to search input (300ms)
2. Call `POST /search` on query change
3. Filter sidebar node list by search results
4. Apply graph visibility filter

### Phase 4: Backend `/graph` endpoint fix (VM)
**Goal:** Fix the Cypher syntax error in the remote backend.

Steps:
1. The backend returns: `Type mismatch: expected Relationship but was List<Relationship>`
2. The bug is in the Cypher query — `r` is a list, needs to be `r IN relationships` or the query needs `UNWIND`
3. Fix needs to be deployed to the VM hosting the Cloud Run service
4. This is separate from frontend work — note for backend task

## API Endpoints Summary

### Already implemented
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| GET | `/nodes?limit=N&label=X` | List nodes |
| POST | `/query` | Execute Cypher |
| POST | `/search?q=X&limit=N` | Search nodes |

### Needed
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/graph/{label}/{name}?hops=N` | Get subgraph (BROKEN) |
| POST | `/graph/node?label=X&name=Y` | Get relationships for node (NEW) |

## Sigma.js v3 Built-in Events

From `@react-sigma/core` hooks:
- `clickNode` — single click on node
- `enterNode` — mouse enter node
- `leaveNode` — mouse leave node
- `clickEdge` — single click on edge
- `enterEdge` / `leaveEdge` — edge hover
- `drop` — graph dropped on canvas
- `doubleClickNode` — double click on node

We're using `clickNode`, `enterNode`, `leaveNode`. These are the right hooks.
