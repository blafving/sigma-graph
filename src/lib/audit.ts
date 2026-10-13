/**
 * The model audit published beside the graph by `app/audit_model.py` as `data/audit.json`.
 *
 * Loaded on demand: a page view that never opens Settings never asks for it. A missing or
 * unreadable file is `null`, not an exception - the audit explains the map, it never blocks it.
 */

export const AUDIT_URL = `${import.meta.env.BASE_URL}data/audit.json`;

export interface AuditReport {
  generatedAt: string;
  vault_notes: number;
  /** Notes publish_policy.py keeps out of this build. */
  withheld_notes: number;
  published_nodes: number;
  published_edges: number;
  stubs: number;
  status: 'ok' | 'warn' | 'fail';
  /** What the data must satisfy to be considered publishable. */
  floors: Record<string, boolean>;
  fields: {
    registry: string;
    unreviewed: Array<[string, number]>;
    denylisted: Array<[string, number]>;
    looks_like_a_relationship: Array<[string, number, number]>;
    relationship_poorly_resolved: Array<[string, number, number]>;
  };
  time: {
    notes_with_subject_time: number;
    usable: number;
    kinds: Record<string, number>;
    by_type: Record<string, [number, number]>;
  };
  phi_tech: {
    philosophy_side_nodes: number;
    technology_nodes: number;
    edges_between: number;
    semantic_edges: string[];
  };
  references: {
    notes_with_pointer: number;
    reference_edges_in_graph: number;
    source_group_nodes: number;
    dangling_declared_links: Record<string, number>;
    placeholder_notes: number;
  };
  identity: {
    uids_claimed_by_several_notes: number;
    merges_spanning_types: number;
    examples: Record<string, Array<[string, string]>>;
  };
  connectivity: {
    isolated_notes: number;
  };
}

let cached: Promise<AuditReport | null> | null = null;

/** The published audit, fetched once per page load; `null` when there is none. */
export function fetchAudit(): Promise<AuditReport | null> {
  if (!cached) {
    cached = (async () => {
      try {
        const res = await fetch(AUDIT_URL, { cache: 'no-cache' });
        return res.ok ? ((await res.json()) as AuditReport) : null;
      } catch {
        return null;
      }
    })();
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
