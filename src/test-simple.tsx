import { useEffect, useState } from 'react';

export function TestSimple() {
  const [error, setError] = useState<string | null>(null);
  const [sigmaLoaded, setSigmaLoaded] = useState<string | null>(null);

  useEffect(() => {
    try {
      console.log('[TEST] Starting sigma import...');
      import('sigma').then((sigmaModule) => {
        console.log('[TEST] Sigma module loaded:', Object.keys(sigmaModule));
        console.log('[TEST] Sigma class:', sigmaModule.Sigma);
        console.log('[TEST] Sigma default:', sigmaModule.default);
        setSigmaLoaded(JSON.stringify(Object.keys(sigmaModule)));
      }).catch((err) => {
        console.error('[TEST] Sigma import failed:', err);
        setError(err.message);
      });
    } catch (err: any) {
      console.error('[TEST] Immediate error:', err);
      setError(err.message);
    }
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: 'monospace', background: '#111', color: '#0f0' }}>
      <h1>Test Page</h1>
      <p>Sigma loaded: {sigmaLoaded || 'not yet'}</p>
      {error && <p style={{ color: 'red' }}>ERROR: {error}</p>}
    </div>
  );
}
