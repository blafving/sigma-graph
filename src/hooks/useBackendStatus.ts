import { useState, useEffect, useCallback } from 'react';
import { fetchHealth } from '../lib/api-client';

export type BackendStatus = 'checking' | 'ok' | 'offline';

export function useBackendStatus(interval = 30000) {
  const [status, setStatus] = useState<BackendStatus>('checking');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const check = useCallback(async () => {
    try {
      await fetchHealth();
      setStatus('ok');
      setLastChecked(new Date());
    } catch {
      setStatus('offline');
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    check();
    const timer = setInterval(check, interval);
    return () => clearInterval(timer);
  }, [check, interval]);

  return { status, lastChecked, check };
}
