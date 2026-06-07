import type { BackendStatus } from '../hooks/useBackendStatus';

interface StatsBarProps {
  totalNodes: number;
  visibleNodes: number;
  visibleEdges: number;
  zoom: number;
  backendStatus: BackendStatus;
  lastChecked: Date | null;
  typeCount: number;
}

export function StatsBar({
  totalNodes,
  visibleNodes,
  visibleEdges,
  zoom,
  backendStatus,
  lastChecked,
  typeCount,
}: StatsBarProps) {
  const statusColor = backendStatus === 'ok' ? '#2ecc71' : backendStatus === 'offline' ? '#e74c3c' : '#f39c12';
  const statusText = backendStatus === 'ok' ? 'OK' : backendStatus === 'offline' ? 'OFFLINE' : 'CHECKING';
  const lastCheckedText = lastChecked
    ? lastChecked.toLocaleTimeString()
    : '';

  return (
    <div style={styles.container}>
      <div style={styles.stats}>
        <span>Nodes: {totalNodes}</span>
        <span style={styles.muted}>|</span>
        <span>Visible: {visibleNodes}</span>
        <span style={styles.muted}>|</span>
        <span>Edges: {visibleEdges}</span>
        <span style={styles.muted}>|</span>
        <span>Types: {typeCount}</span>
        <span style={styles.muted}>|</span>
        <span>Zoom: {zoom.toFixed(1)}x</span>
      </div>
      <div style={styles.statusContainer}>
        <span style={{ ...styles.statusDot, background: statusColor }} />
        <span style={{ ...styles.statusText, color: statusColor }}>
          {statusText}
        </span>
        {lastCheckedText && (
          <span style={styles.lastChecked}>{lastCheckedText}</span>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 16px',
    background: '#16213e',
    borderTop: '1px solid #333',
    fontSize: 11,
    color: '#888',
    flexShrink: 0,
  },
  stats: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  muted: {
    color: '#555',
  },
  statusContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  statusText: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  lastChecked: {
    fontSize: 10,
    color: '#666',
  },
};
