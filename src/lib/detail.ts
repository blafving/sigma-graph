/**
 * Map a `/v2/node/{uid}` response onto the shape `DetailPanel` renders.
 *
 * The panel is legacy-shaped on purpose (Phase 0 rewrote the data layer, not the panels): a
 * relationship is `{ type, source, target }`, so the API's `direction` has to become the right
 * endpoint order. `targetLabel` is the neighbour's category; the panel shows ids today and names
 * in Phase 2.
 */
import type { V2NodeDetail } from './api-client';
import type { GraphNodeDetail } from '../GraphUiContext';

export function toPanelDetail(d: V2NodeDetail): GraphNodeDetail {
  return {
    id: d.id,
    label: d.type,
    name: d.name,
    properties: d.properties || {},
    relationships: (d.neighbours || []).map((n) => ({
      type: n.relation,
      source: n.direction === 'out' ? d.id : n.id,
      target: n.direction === 'out' ? n.id : d.id,
      targetLabel: n.type,
    })),
  };
}
