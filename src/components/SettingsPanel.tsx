/**
 * Settings: the cog in the top-right corner of the explorer and the dialog it opens.
 *
 * One section for now - the model audit that `app/audit_model.py` publishes as
 * `data/audit.json` at publish time. The dialog is mounted only while open, so the audit is
 * never fetched for a page view that does not ask for it.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchAudit, type AuditReport } from '../lib/audit';

type SectionId = 'audit';

const SECTIONS: Array<{ id: SectionId; label: string; hint: string }> = [
  { id: 'audit', label: 'Graph audit', hint: 'what the published data can answer' },
];

const num = (n: number) => n.toLocaleString('en-US');
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function SettingsCog() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionId>('audit');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        style={styles.cog}
        onClick={() => setOpen(true)}
        title="Settings"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {'\u2699'}
      </button>
      {/* The top bar is its own stacking context, so the dialog is portalled to the body or
          the sidebars would paint over it. */}
      {open && createPortal(
        <div style={styles.backdrop} onClick={() => setOpen(false)}>
          <div
            style={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.header}>
              <span style={styles.title}>Settings</span>
              <button type="button" style={styles.close} onClick={() => setOpen(false)} title="Close">
                {'\u2715'}
              </button>
            </div>
            <div style={styles.body}>
              <nav style={styles.nav}>
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    style={{ ...styles.navItem, ...(section === s.id ? styles.navItemActive : null) }}
                    onClick={() => setSection(s.id)}
                    title={s.hint}
                  >
                    {s.label}
                  </button>
                ))}
              </nav>
              <div style={styles.content}>{section === 'audit' ? <GraphAudit /> : null}</div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** The published audit report, or why it is not there. */
function GraphAudit() {
  const [audit, setAudit] = useState<AuditReport | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchAudit().then((a) => {
      if (!live) return;
      setAudit(a);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!loaded) return <div style={styles.muted}>Reading data/audit.json{'\u2026'}</div>;
  if (!audit) {
    return (
      <div style={styles.muted}>
        No audit published yet. <code style={styles.code}>./publish.sh</code> writes
        <code style={styles.code}>data/audit.json</code> with <code style={styles.code}>app/audit_model.py</code>.
      </div>
    );
  }

  const warnings = Object.values(audit.floors).filter((ok) => !ok).length;
  const time = audit.time;
  const identity = Object.entries(audit.identity.examples);

  return (
    <div style={styles.sections}>
      <div style={styles.summary}>
        <span style={{ ...styles.badge, ...statusStyle(audit.status) }}>
          {audit.status === 'ok' ? 'all floors hold' : `${warnings} warning${warnings === 1 ? '' : 's'}`}
        </span>
        <span style={styles.muted}>
          {num(audit.vault_notes)} notes {'\u2192'} {num(audit.published_nodes)} nodes,{' '}
          {num(audit.published_edges)} edges, {num(audit.stubs)} unwritten stubs
        </span>
        <span style={styles.muted}>audited {new Date(audit.generatedAt).toLocaleString()}, counted from the vault</span>
      </div>

      <Card title="Floors">
        {Object.entries(audit.floors).map(([name, ok]) => (
          <div key={name} style={styles.row}>
            <span style={{ ...styles.badge, ...(ok ? styles.ok : styles.warn) }}>{ok ? 'ok' : 'warn'}</span>
            <span style={styles.rowLabel}>{name}</span>
          </div>
        ))}
      </Card>

      <Card title="Fields">
        <Metric label="new fields awaiting review" value={num(audit.fields.unreviewed.length)} />
        <Metric label="denylisted keys" value={num(audit.fields.denylisted.length)} detail={listChips(audit.fields.denylisted)} />
        {audit.fields.relationship_poorly_resolved.length > 0 && (
          <Metric
            label="link fields that rarely resolve"
            value=""
            detail={audit.fields.relationship_poorly_resolved
              .map(([field, uses, share]) => `${field} ${pct(share)} unresolved (${uses})`)
              .join('  ')}
          />
        )}
        {audit.fields.looks_like_a_relationship.length > 0 && (
          <Metric
            label="properties that look like links"
            value=""
            detail={audit.fields.looks_like_a_relationship
              .map(([field, uses, share]) => `${field} ${pct(share)} looks like a link (${uses})`)
              .join('  ')}
          />
        )}
      </Card>

      <Card title="Subject time">
        <Metric
          label="notes naming when the subject existed"
          value={`${num(time.usable)} / ${num(time.notes_with_subject_time)} parseable`}
          detail={Object.entries(time.kinds)
            .sort((a, b) => b[1] - a[1])
            .map(([kind, n]) => `${kind} ${num(n)}`)
            .join('  ')}
        />
        {Object.entries(time.by_type).map(([type, [withTime, total]]) => (
          <Bar key={type} label={type} value={withTime} total={total} />
        ))}
      </Card>

      <Card title="Philosophy {'\u2194'} technology">
        <Metric
          label="edges between the two sides"
          value={num(audit.phi_tech.edges_between)}
          detail={`${num(audit.phi_tech.philosophy_side_nodes)} philosophy-side, ${num(
            audit.phi_tech.technology_nodes,
          )} technology${audit.phi_tech.semantic_edges.length ? `; semantic: ${audit.phi_tech.semantic_edges.join(', ')}` : '; no semantic predicate yet'}`}
        />
      </Card>

      <Card title="References">
        <Metric
          label="source pointers in notes"
          value={num(audit.references.notes_with_pointer)}
          detail={`${num(audit.references.reference_edges_in_graph)} reference edges over ${num(
            audit.references.source_group_nodes,
          )} source nodes`}
        />
        <Metric
          label="declared links that do not resolve"
          value={num(Object.values(audit.references.dangling_declared_links).reduce((a, b) => a + b, 0))}
          detail={Object.entries(audit.references.dangling_declared_links)
            .map(([field, n]) => `${field} ${num(n)}`)
            .join('  ')}
        />
        <Metric label="notes still holding template placeholders" value={num(audit.references.placeholder_notes)} />
      </Card>

      <Card title="Identity">
        <Metric
          label="uids claimed by more than one note"
          value={num(audit.identity.uids_claimed_by_several_notes)}
          detail={`${num(audit.identity.merges_spanning_types)} of them across types, so one node takes the type of whichever file the import reached first`}
        />
        {identity.slice(0, 6).map(([uid, files]) => (
          <div key={uid} style={styles.example}>
            <span style={styles.exampleUid}>{uid}</span>
            <span style={styles.muted}>{files.map(([file]) => file).join(', ')}</span>
          </div>
        ))}
      </Card>

      <Card title="Connectivity">
        <Metric label="non-stub notes with no edge" value={num(audit.connectivity.isolated_notes)} />
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      {children}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: React.ReactNode }) {
  return (
    <div style={styles.metric}>
      <span style={styles.metricLabel}>{label}</span>
      <span style={styles.metricValue}>{value}</span>
      {detail ? <div style={styles.detail}>{detail}</div> : null}
    </div>
  );
}

function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const ratio = total ? value / total : 0;
  return (
    <div style={styles.barRow}>
      <span style={styles.barLabel}>{label}</span>
      <span style={styles.barTrack}>
        <span style={{ ...styles.barFill, width: `${Math.round(ratio * 100)}%` }} />
      </span>
      <span style={styles.barValue}>
        {num(value)}/{num(total)}
      </span>
    </div>
  );
}

const listChips = (rows: Array<[string, number]>) => (
  <span>
    {rows.map(([key, uses]) => (
      <span key={key} style={styles.chip} title={`${uses} notes`}>
        {key}
      </span>
    ))}
  </span>
);

const statusStyle = (status: AuditReport['status']): React.CSSProperties =>
  status === 'ok' ? styles.ok : status === 'warn' ? styles.warn : styles.fail;

const styles: Record<string, React.CSSProperties> = {
  cog: {
    position: 'absolute',
    top: 7,
    right: 12,
    zIndex: 30,
    width: 28,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f3460',
    border: '1px solid #35507a',
    borderRadius: 5,
    color: '#87CEEB',
    fontSize: 15,
    lineHeight: 1,
    cursor: 'pointer',
  },
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(4, 7, 13, 0.66)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
  },
  dialog: {
    width: 'min(900px, 94vw)',
    height: 'min(660px, 88vh)',
    display: 'flex',
    flexDirection: 'column',
    background: '#0d111c',
    border: '1px solid #24344d',
    borderRadius: 8,
    boxShadow: '0 18px 48px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid #1e2a3d',
    flexShrink: 0,
  },
  title: { fontSize: 14, fontWeight: 700, color: '#dbe4f0', letterSpacing: 0.3 },
  close: {
    background: 'none',
    border: 'none',
    color: '#8899ad',
    cursor: 'pointer',
    fontSize: 14,
    padding: '0 2px',
    lineHeight: 1,
  },
  body: { display: 'flex', flex: 1, minHeight: 0 },
  nav: {
    width: 158,
    flexShrink: 0,
    padding: '10px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    background: '#0b0f18',
    borderRight: '1px solid #1e2a3d',
  },
  navItem: {
    textAlign: 'left',
    background: 'none',
    border: 'none',
    borderRadius: 4,
    padding: '6px 8px',
    color: '#9fb6d4',
    fontSize: 12,
    cursor: 'pointer',
  },
  navItemActive: { background: 'rgba(100, 149, 237, 0.18)', color: '#87CEEB', fontWeight: 600 },
  content: { flex: 1, minWidth: 0, overflowY: 'auto', padding: '12px 16px' },
  sections: { display: 'flex', flexDirection: 'column', gap: 12 },
  summary: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '10px 12px',
    background: '#0b0f18',
    border: '1px solid #1e2a3d',
    borderRadius: 6,
  },
  cardTitle: { fontSize: 11, fontWeight: 700, color: '#87CEEB', letterSpacing: 0.6, textTransform: 'uppercase' },
  metric: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, fontSize: 12, color: '#dbe4f0' },
  metricLabel: { color: '#a9bcd4' },
  metricValue: { fontWeight: 700 },
  detail: { width: '100%', fontSize: 11, color: '#7f92ab', lineHeight: 1.5 },
  row: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#dbe4f0' },
  rowLabel: { color: '#a9bcd4' },
  barRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#a9bcd4' },
  barLabel: { width: 108, flexShrink: 0 },
  barTrack: { flex: 1, height: 5, background: '#16233a', borderRadius: 3, overflow: 'hidden' },
  barFill: { display: 'block', height: '100%', background: '#4a7fd0' },
  barValue: { width: 64, textAlign: 'right', color: '#7f92ab' },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    padding: '1px 6px',
    borderRadius: 9,
    textTransform: 'uppercase',
  },
  ok: { background: 'rgba(46, 204, 113, 0.16)', color: '#2ecc71' },
  warn: { background: 'rgba(243, 156, 18, 0.16)', color: '#f39c12' },
  fail: { background: 'rgba(231, 76, 60, 0.16)', color: '#e74c3c' },
  muted: { fontSize: 11, color: '#7f92ab' },
  code: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#87CEEB' },
  chip: {
    display: 'inline-block',
    margin: '0 6px 2px 0',
    padding: '1px 6px',
    background: 'rgba(50, 50, 70, 0.5)',
    border: '1px solid #333',
    borderRadius: 10,
    fontSize: 10,
    color: '#9fb6d4',
  },
  example: { display: 'flex', flexDirection: 'column', fontSize: 11, lineHeight: 1.45 },
  exampleUid: { color: '#dbe4f0' },
};
