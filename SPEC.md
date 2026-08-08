# Graph Explorer — Interactivity Specification

Single-page knowledge-graph explorer. Goal: explore the graph AND drill into node details,
all on one page, with fast, predictable interaction.

## Principles
1. The canvas NEVER goes blank on user interaction. Every action leaves the graph visible.
2. Feedback in ~1 second for navigation; interactions never feel "stuck".
3. Context preservation: drill-down must show WHERE the node is in the map, not teleport.

## Interactions & expected behavior

### 1. Node click (left sidebar list)
- **Expected:** canvas animates (fly) to the clicked node, zoomed to show the node PLUS its
  closest relationships/neighbors. Animation ~1s so the viewer sees where on the map the node was.
- Canvas must remain populated at all times (no blank/white flash).
- Detail panel (right) shows the node's properties + relationships in parallel.
- If the node has no relationships, still zoom to the node and show "no relationships" in the panel.

### 2. Node click (on canvas)
- Same behavior as sidebar click.

### 3. Hover (on canvas)
- Hover highlights the node, dims non-neighbors, shows a small tooltip (label).

### 4. Search
- Text search filters the canvas live (no layout shift; hidden nodes stay hidden cleanly).
- Sidebar list matches the query; results shown with counts.

### 5. Type filters
- Toggling a type adds/removes that type's nodes from the canvas instantly.

### 6. Detail panel (right sidebar)
- Shows: node name, type, properties (key/value), relationships (type -> target), close button.
- Relationship click may later navigate (future).

### 7. Canvas navigation
- Wheel zoom, drag pan, zoom buttons, minimap; zoom level shown in stats bar.

### 8. Loading / error / empty states
- Loading: visible "Computing layout..." indicator (already present).
- Error: console + non-blocking surface; canvas restored to previous state.
- Empty filters: stats show 0 visible; canvas stays dark (no crash).

## Performance targets
- Camera fly (node click): ~1s, smooth (eased).
- Filter/search updates: resolve within one frame after state change (sigma.refresh).
- Target 60fps pan/zoom on ~200-900 node graphs (WebGL).

## Acceptance criteria (for the current build)
- [ ] Sidebar node click -> canvas flies to node + neighbors in ~1s, never blanks
- [ ] Detail panel opens with properties AND relationships section
- [ ] Hover dims non-neighbors
- [ ] Search filters canvas + list without layout shift
- [ ] Type filter toggles update canvas instantly
- [ ] No page errors in console during any interaction
