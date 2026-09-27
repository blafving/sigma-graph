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
- Positions arrive precomputed (`x`, `y`). **No client-side force layout.** A node without finite
  `x`/`y` is dropped and counted, never sent to the origin: sigma throws on a node that lacks
  numeric coordinates, and a NaN in the layout takes the whole stage down with it.
- **One edge per ordered pair.** `/v2/graph` emits one record per *relation type*: 2,019 relations
  over 1,592 node pairs (419 pairs carry `RELATED_TO` + `MENTIONS`, up to 3 types on a pair).
  graphology's non-multi `Graph` - the only kind sigma accepts - holds one edge per ordered pair and
  throws on the second, so `buildGraph` keys edges `source\u0000target` and merges the remaining
  relation names onto that edge (`relations`, `fieldNames`). The map therefore renders 1,592 edges;
  `stats.relations` still reports 2,019 so nobody "fixes" the missing 427.
- Filters, min-degree and search are API params. The client never filters by walking the graph.
- The set of known groups is fixed by the **first unfiltered** load. Re-deriving it from a filtered
  payload makes "everything visible" true while a group is hidden, which flips the query back to
  unfiltered and refetches the whole map underneath the user (observed in the acceptance gate).

## Rendering contract
- Hover / selection / filter emphasis via `nodeReducer` / `edgeReducer` + `sigma.refresh()`.
  Never `setNodeAttribute('color' | 'size' | 'labelColor')`, never a `baseColor` shadow attribute.
  Emphasis handlers write refs; nothing writes to the graph outside the data layer.
- A reducer's return value **replaces** the node's attributes for that frame - sigma does not merge
  it - so reducers spread their input, and `x`/`y` must survive the spread or sigma throws.
- sigma 3 has no `dimmed` display field: de-emphasis is a colour and size change. The dim variant of
  every colour is precomputed in the data layer (`dimColor`) so a reducer never does string math
  while the camera moves.
- The panels are `memo`-wrapped. Zoom level lives in context, and an unmemoised `NodeList` re-walks
  every group on every camera tick (O(groups x nodes) per frame).
- Mount the renderer before the first fetch resolves, so a slow or failed request shows an
  error + retry instead of a dead stage.
- Camera state is normalised display space (~0..1), never graph space. Focus =
  `sigma.getNodeDisplayData(node)` → `camera.animate({ ...camera.getState(), x, y, ratio })`.
  Writing `x`/`y` straight from node attributes is the black-canvas bug (PAR-21 / PAR-58): the
  camera lands outside the stage and the canvas renders black with no error.
  `getNodeDisplayData` is also what the library's own `useCamera().gotoNode()` uses, which is the
  evidence that it is the right source. `sigma.normalizationFunction` computes the same thing but
  is declared `private` in sigma 3's types, so it is not usable from a typed app. sigma 3 has no
  `focus()`, `locate()`, `animatedZoomTo()`, `panic()` or `unfocus()`.
- `camera.animate()` takes ratio as part of the state; `gotoNode` pans without zooming, so a
  click-to-focus that also zooms needs the explicit state above.
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
- One request per chip toggle, with `groups=` in it; a toggle must never cause an unfiltered
  request. (min-degree slider: Phase 2 - the data layer already sends `minDegree`.)

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
- First paint of 1,185 nodes / 1,592 edges (2,019 relations) from the prod API under ~1.5s.
- Hover/select cost is one reducer pass; no per-frame `setState`, no `sigma.refresh()` outside
  reducer invalidation.
- 60fps pan/zoom at full graph size.

## Acceptance criteria (this build)
`npm run build && npm run gate` starts a preview, drives Chromium against the real API, derives
every expectation from the API response (so it stays valid as the vault grows) and fails on the
first broken rule. Last full run 2026-09-27 against prod, 1,185 nodes / 1,592 edges / 2,019
relations:

- [x] Node count, edge count and coordinates equal the API; nothing is laid out in the browser
- [x] Canvas click frames the node within 60px of stage centre - it cannot be the off-stage camera
      that blanked PAR-21 / PAR-58
- [x] Detail panel lists every neighbour `/v2/node` returned (192 of 192 on the degree-192 hub)
- [x] A chip toggle costs exactly one `groups=` request and never an unfiltered one
- [x] Hover leaves the graph object untouched (emphasis is reducer-side)
- [x] Zero console errors, no "Maximum update depth exceeded", `tsc -b` and `vite build` clean

Still open:

- [ ] Click from the sidebar list frames the node - `NodeList` only lists groups with <=50 nodes,
      so it moves to `/v2/search` in Phase 2
- [ ] Label legibility at every zoom + the right-edge label flip: validated by hand and in the
      buildless preview, still needs pixel assertions here
- [ ] Min-degree slider, reader behaviour, `Esc` ordering with the reader open (PAR-82)
- [x] `GraphView` <=300 LOC (230; canvas layer 113, styles 80)
- [ ] Whole frontend <= ~800 LOC (from 2,087). Now 1,773: the data + render layer I own is 992 and
      the remaining 781 is four untouched panels. That target only closes when `NodeList` (175) is
      replaced by a `/v2/search` list and `FilterBar`/`StatsBar` shrink in Phase 2 - until then the
      honest number is here, not a wishful one.

## Changes
- **2026-09-27 (PAR-78, Phase 0):** the v2 data layer is in. Typed `/v2/*` client, one stable
  graphology instance refilled per query, server-computed layout only, reducer-side emphasis,
  display-space camera focus. Parallel relations merge per node pair (2,019 relations -> 1,592
  edges). Deleted `CustomMiniMap`, `StatusIndicator`, `useGraphEvents`, `useGraphFilters`,
  `test-simple` and 5 layout/minimap packages; panels memoised. `e2e/graph-gate.mjs`
  (`npm run gate`) is now the acceptance gate. The old `tests/ui.spec.ts` is deleted rather than
  updated: it asserted the minimap canvas exists (removed above) and otherwise logged instead of
  asserting, and `playwright.config.ts` went with it so there is one acceptance command, not two. `.env` was still pointing at a stale v1 Cloud Run
  service and now names the v2 one.
- **2026-09-27 (PAR-78):** minimap removed; document reader added (needs the body endpoint);
  data, render and camera contracts pinned to sigma 3 + `/v2`; precomputed layout replaces
  client-side ForceAtlas2; performance targets raised to the real graph size; acceptance criteria
  rewritten as verifiable Playwright gates.
- Earlier: original interaction spec for the legacy label-per-type graph.
