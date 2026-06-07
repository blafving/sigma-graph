import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DirectedGraph } from 'graphology';

export function useGraphFilters(graph: DirectedGraph | null) {
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Get all unique types from the graph (stored in nodeType, not type —
  // sigma.js reserves `type` for its internal renderer dispatch)
  const allTypes = useMemo(() => {
    if (!graph) return new Set<string>();
    const types = new Set<string>();
    graph.forEachNode((_, nodeData) => {
      if (nodeData.nodeType) types.add(nodeData.nodeType as string);
    });
    return types;
  }, [graph]);

  // Initialize visible types on first load
  useEffect(() => {
    if (allTypes.size > 0 && visibleTypes.size === 0) {
      setVisibleTypes(new Set(allTypes));
    }
  }, [allTypes, visibleTypes.size]);

  const toggleType = useCallback((type: string) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const applyFilters = useCallback((g: DirectedGraph | null): DirectedGraph | null => {
    if (!g) return null;

    const filtered = g.copy();

    // Remove nodes that don't match visible types or search
    const nodesToRemove: string[] = [];
    g.forEachNode((node, nodeData) => {
      const typeMatch = visibleTypes.size === 0 || visibleTypes.has(nodeData.nodeType as string);
      const searchMatch = !searchQuery ||
        (nodeData.label as string).toLowerCase().includes(searchQuery.toLowerCase());
      if (!typeMatch || !searchMatch) {
        nodesToRemove.push(node);
      }
    });
    nodesToRemove.forEach(n => filtered.dropNode(n));

    return filtered;
  }, [visibleTypes, searchQuery]);

  const visibleTypeCounts = useMemo(() => {
    if (!graph) return new Map<string, number>();
    const counts = new Map<string, number>();
    graph.forEachNode((_, nodeData) => {
      const type = nodeData.nodeType as string;
      if (type && visibleTypes.has(type)) {
        counts.set(type, (counts.get(type) || 1) + 1);
      }
    });
    return counts;
  }, [graph, visibleTypes]);

  return {
    visibleTypes,
    allTypes,
    searchQuery,
    setSearchQuery,
    toggleType,
    applyFilters,
    visibleTypeCounts,
  };
}
