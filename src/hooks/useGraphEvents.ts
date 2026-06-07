import { useCallback } from 'react';

export function useGraphEvents() {
  const handleNodeClick = useCallback((_event: { node: string }) => {
    // Handled by parent component via callback
  }, []);

  const handleNodeEnter = useCallback((_event: { node: string }) => {
    // Handled by parent component via callback
  }, []);

  const handleNodeLeave = useCallback((_event: { node: string }) => {
    // Handled by parent component via callback
  }, []);

  return { handleNodeClick, handleNodeEnter, handleNodeLeave };
}
