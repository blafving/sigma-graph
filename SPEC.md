# Graph Explorer — Specification (v2)

Single-page knowledge-graph explorer. Goal: explore the graph AND drill into node details,
all on one page, with fast, predictable interaction.

Deployed on Cloud Run, as today. No CDN/Storage move in this scope.
Reference implementation for the hard parts: `../preview/v2.html` and `../preview/sigma-contract.md`.

## Principles
1. The canvas NEVER goes blank on user interaction. Every action leaves the graph visible.
2. Feedback in ~1 second for navigation; interactions never feel "stuck".
3. Context preservation: drill-down must show WHERE the node is in the map, not teleport.
4. Styling is derived, never stored. Hover/selection/filters never write to the graph.
5. `/v2/*` is the only data source. No legacy endpoints, no client-side graph scans.

## Data contract
- `GET /v2/graph?types&groups&minDegree&limit` → `{ nodes: [{ id, name, type, typeGroup, degree,
  description, filePath, stub, x, y }], edges: [{ source, target, type, fields }] }`
- `GET /v2/node/{uid}?limit` → flat node + `neighbours` (typed, with direction)
- `GET /v2/search?q&limit`
- `GET /v2/node/{uid}/document` → `{ id, filePath, markdown }` — see "Document reader"
- Positions arrive precomputed (`x`, `y`). **No client-side force layout.**
- Filters, min-degree and search are API params. The client never filters by walking the graph.

## Rendering contract
- Hover / selection / filter emphasis via `nodeReducer` / `edgeReducer` + `sigma.refresh()`.
  Never `setNodeAttribute('color' | 'size' | 'labelColor')`, never a `baseColor` shadow attribute.
- Mount the renderer before the first fetch resolves, so a slow or failed request shows an
  error + retry instead of a dead stage.
- Camera state is normalised display space. Focus =
  `sigma.normalizationFunction({x, y})` → `camera.animate({ x, y, ratio }, { duration })`.
  Writing `x`/`y` straight from node attributes is the black-canvas bug (PAR-21 / PAR-58).
- Labels use custom `defaultDrawNodeLabel` / `defaultDrawNodeHover` painters: sigma 3 removed
  every label-contrast setting, its default hover painter fills a white plate, and it never
  flips a label at the stage edge. `forceLabel` on the focused node only.

## Interactions & expected behavior

### 1. Node click (list / canvas — same behavior)
- Canvas animates (~0.3s eased) to frame the node and enough context to place it; never blanks.
- Detail panel (right) opens in parallel: name, type, typed relationships, document affordance.
- No relationships: still frame the node, show "no relationships".

### 2. Hover (on canvas)
- Highlights the node, dims non-neighbours, legible label plate. Reducer-driven only.

### 3. Search
- `/v2/search`, debounced; selecting a result behaves as a node click. Sidebar list mirrors it.

### 4. Filters
- `typeGroup` chips + min-degree slider, both sent to the API. Counts shown per chip.

### 5. Detail panel (right sidebar)
- Name, type/typeGroup, degree, description, properties, relationships (type → target, with
  direction). Relationship target click navigates to that node.
- **Read more** button → document reader (section 6). Present only when a document exists.

### 6. Document reader (full markdown of the node's note)
- **Trigger:** "Read more" in the detail panel. Hidden for stub nodes (212 stubs have no file).
- **Layout:** a reading column on the right, `min(52ch, 40vw)`, independently scrollable, sitting
  beside the canvas rather than replacing it — Principle 1 still applies while reading. URL gains
  `?doc=<uid>` so a reading position can be shared and survives reload.
- **Rendering:** `react-markdown` + `remark-gfm`, **raw HTML not rendered**. The vault includes
  web clippings, and skipping raw HTML means no sanitiser dependency and no XSS surface.
  GitHub tables, code blocks, headings and lists all render.
- **Links inside the document:**
  - Wikilinks `[[Target]]` and relative `.md` links resolve through `/v2/search`. A hit navigates
    (new selection + new document). A miss renders as inert muted text, never a dead link —
    there are 422 known broken body links until PAR-79 lands.
  - External links open in a new tab with `rel="noopener"`.
- **Large documents:** vault total is 5.3 MB / 1,404 files, mean ~3.8 KB, largest 227 KB. No
  virtualisation needed; render above 400 KB is truncated with an explicit "show full document".
- **States:** skeleton + spinner while fetching; error state with retry (never an empty pane);
  closing with `Esc` or the close button restores the detail panel and prior selection. `Esc`
  closes the reader first, and only clears the selection if no reader is open. Per-node scroll
  position remembered for the session.
- Out of scope: in-document search (browser find works), editing, image/lightbox handling.

### 7. Canvas navigation
- Wheel zoom, drag pan, zoom buttons, zoom level in the stats bar. `0` fits, `Esc` clears.

### 8. Loading / error / empty states
- Loading: visible indicator until the graph is mounted.
- Error: surfaced in-page with retry; canvas restored to its previous state.
- Empty filters: stats show 0 visible; canvas stays visible (no crash, no blank).

## Backend prerequisite for the reader
Neo4j stores only `description` (first paragraph, ≤1,200 chars) and `excerpt` —
`/v2/node/dasein` returns 283 characters and no body. So the reader needs:
1. the loader to store the full markdown body on `:Node` (5.3 MB across 1,404 files is trivial);
2. `GET /v2/node/{uid}/document` reading that property.

Bodies come **from the database, never the filesystem**: `file_path` stays a display string, so
there is no path handling to get wrong and the vault never has to ship inside the container image.
Kept as its own endpoint so `/v2/graph` and `/v2/node` payloads stay lean.

## Removed / out of scope (this rebuild)
- **Minimap — removed 2026-09-27.** `@react-sigma/minimap` was installed and imported by nobody;
  the 228-LOC hand-rolled version is deleted rather than rewritten. At 1,185 nodes the fit view
  is the overview, and it cost a per-frame bounding-box computation plus the camera-clamp fighting
  in PAR-58 / PAR-59.
- Legacy endpoints and the legacy Neo4j purge (the purge is gated on this shipping).
- PAR-79 vault link cleanup — the reader must degrade safely until then.
- Editing or authoring notes from the UI.

## Performance targets
- First paint of 1,185 nodes / 2,019 edges from the prod API under ~1.5s.
- Hover/select cost is one reducer pass; no per-frame `setState`, no `sigma.refresh()` outside
  reducer invalidation.
- 60fps pan/zoom at full graph size.

## Acceptance criteria (this build)
- [ ] Click from list and canvas frames the node; canvas never blanks (regression test for the
      coordinate bug that killed PAR-21 / PAR-58)
- [ ] Hover + selection emphasis with a legible label plate at every zoom; label flips before
      clipping at the right edge
- [ ] Detail panel shows typed neighbours with direction from `/v2/node`
- [ ] "Read more" opens a scrollable markdown column; no button on stubs; unresolved links inert;
      `Esc` restores the panel
- [ ] Filters, min-degree and search go through API params; stats bar counts match
- [ ] Zero console errors, no "Maximum update depth exceeded", `tsc -b` clean
- [ ] `GraphView` ≤300 LOC; whole frontend ≤ ~800 LOC (from 2,087)

## Changes
- **2026-09-27 (PAR-78):** minimap removed; document reader added (needs the body endpoint);
  data, render and camera contracts pinned to sigma 3 + `/v2`; precomputed layout replaces
  client-side ForceAtlas2; performance targets raised to the real graph size; acceptance criteria
  rewritten as verifiable Playwright gates.
- Earlier: original interaction spec for the legacy label-per-type graph.
