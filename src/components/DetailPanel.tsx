interface DetailPanelProps {
  node: {
    id: string;
    label: string;
    name: string;
    properties: Record<string, unknown>;
    relationships: Array<{
      type: string;
      source: string;
      target: string;
      targetLabel?: string;
    }>;
  } | null;
  onClose: () => void;
}

export function DetailPanel({ node, onClose }: DetailPanelProps) {
  const hasNode = node !== null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          {hasNode ? (
            <>
              <div style={styles.nodeName}>{node.name}</div>
              <div style={styles.nodeLabel}>{node.label}</div>
            </>
          ) : (
            <div style={styles.nodeName}>Select a node</div>
          )}
        </div>
        {hasNode && (
          <button style={styles.closeBtn} onClick={onClose} title="Close">
            ✕
          </button>
        )}
      </div>

      {/* Properties */}
      <div style={styles.section}>
        {hasNode ? (
          <>
            <div style={styles.sectionTitle}>Properties</div>
            {Object.keys(node.properties).length === 0 ? (
              <div style={styles.empty}>No properties</div>
            ) : (
              <div style={styles.propsTable}>
                {Object.entries(node.properties).map(([key, value]) => (
                  <div key={key} style={styles.propRow}>
                    <span style={styles.propKey}>{key}</span>
                    <span style={styles.propValue}>
                      {typeof value === 'string' ? value : JSON.stringify(value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '20px 12px', color: '#666', fontSize: 12, textAlign: 'center' }}>
            Click a node to see details
          </div>
        )}
      </div>

      {/* Relationships */}
      {hasNode && node.relationships.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            Relationships ({node.relationships.length})
          </div>
          <div style={styles.relList}>
            {node.relationships.map((rel, i) => (
              <div key={i} style={styles.relItem}>
                <span style={styles.relType}>{rel.type}</span>
                <span style={styles.relTarget}>→ {rel.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 300,
    background: '#070b14',
    borderLeft: '2px solid #1e3a5f',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '12px',
    borderBottom: '1px solid #333',
  },
  nodeName: {
    fontSize: 16,
    fontWeight: 700,
    color: '#e0e0e0',
  },
  nodeLabel: {
    fontSize: 11,
    color: '#87CEEB',
    marginTop: 2,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 14,
    padding: '0 4px',
    lineHeight: 1,
  },
  section: {
    padding: '12px',
    borderBottom: '1px solid #222',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    color: '#888',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  empty: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  propsTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  propRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  propKey: {
    fontSize: 10,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  propValue: {
    fontSize: 12,
    color: '#ccc',
    wordBreak: 'break-word',
  },
  relList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  relItem: {
    fontSize: 11,
    padding: '4px 6px',
    background: 'rgba(15, 52, 96, 0.5)',
    borderRadius: 4,
  },
  relType: {
    color: '#e67e22',
    fontWeight: 600,
  },
  relTarget: {
    color: '#aaa',
    marginLeft: 4,
  },
};
