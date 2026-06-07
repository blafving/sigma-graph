import type { BackendStatus } from '../hooks/useBackendStatus';

interface StatusIndicatorProps {
  status: BackendStatus;
  lastChecked: Date | null;
}

export function StatusIndicator({ status, lastChecked }: StatusIndicatorProps) {
  const color = status === 'ok' ? '#2ecc71' : status === 'offline' ? '#e74c3c' : '#f39c12';

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'rgba(22, 33, 62, 0.9)',
        padding: '4px 10px',
        borderRadius: 12,
        border: '1px solid #333',
        zIndex: 20,
        fontSize: 10,
        color: '#aaa',
      }}
      title={status === 'ok' ? 'Backend reachable' : status === 'offline' ? 'Backend unreachable' : 'Checking backend...'}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span>{status === 'ok' ? 'Graph Online' : status === 'offline' ? 'Graph Offline' : 'Checking...'}</span>
      {lastChecked && (
        <span style={{ color: '#666' }}>
          {lastChecked.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
