import { createContext, useContext } from 'react';

export interface GraphNodeDetail {
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
}

export interface GraphUiState {
  // selection / drill-down
  selectedNode: GraphNodeDetail | null;
  setSelectedNode: (n: GraphNodeDetail | null) => void;

  // search + type filters (state lifted here so sidebars and sigma share it)
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  visibleTypes: Set<string>;
  allTypes: Set<string>;
  toggleType: (t: string) => void;
  visibleTypeCounts: Map<string, number>;

  // graph lifecycle
  graphLoaded: boolean;
  setGraphLoaded: (v: boolean) => void;
  typeCounts: Map<string, number>;
  setTypeCounts: (m: Map<string, number>) => void;

  // stats
  zoomLevel: number;
  setZoomLevel: (z: number) => void;
  isLayoutRunning: boolean;
  setIsLayoutRunning: (v: boolean) => void;
}

export const GraphUiContext = createContext<GraphUiState | null>(null);

export function useGraphUi(): GraphUiState {
  const ctx = useContext(GraphUiContext);
  if (!ctx) throw new Error('useGraphUi must be used within GraphUiProvider');
  return ctx;
}
