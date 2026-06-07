import { DirectedGraph } from 'graphology';
import { useCallback, useRef } from 'react';
import { fetchFullGraph } from '../lib/api-client';
import type { ApiFullNode } from '../lib/api-client';
import { labelToColor } from '../lib/color-palette';

export function useGraphData() {
  const graphRef = useRef<DirectedGraph | null>(null);

  const loadGraph = useCallback(async (): Promise<DirectedGraph> => {
    const data = await fetchFullGraph();

    // Always create a fresh graph — avoids duplicate node errors on Strict mode remounts
    const graph = new DirectedGraph();
    graphRef.current = graph;

    // Deduplicate nodes by ID (the API can return duplicates)
    // Keep the first occurrence's properties
    const seenNodes = new Set<string>();
    const uniqueNodes: ApiFullNode[] = [];
    for (const node of data.nodes) {
      if (!seenNodes.has(node.id)) {
        seenNodes.add(node.id);
        uniqueNodes.push(node);
      }
    }

    // Add nodes
    for (const node of uniqueNodes) {
      graph.addNode(node.id, {
        label: node.name,
        x: 0,
        y: 0,
        size: 4,
        color: labelToColor(node.label),
        // Use `nodeType` (not `type`) for our categorization.
        // Sigma.js uses `type` internally for renderer dispatch — don't overwrite it.
        nodeType: node.label,
        properties: node.properties,
      });
    }

    // Add edges
    let edgesAdded = 0;
    let edgesSkipped = 0;
    for (const rel of data.relationships) {
      if (graph.hasNode(rel.source) && graph.hasNode(rel.target)) {
        graph.addEdgeWithKey('e' + Math.random().toString(36).substr(2, 9), rel.source, rel.target, {
          label: rel.type,
          color: '#aaa',
          size: 1,
        });
        edgesAdded++;
      } else {
        edgesSkipped++;
        if (edgesSkipped <= 3) {
          console.warn('[Graph] Edge skipped: source=' + rel.source + ' target=' + rel.target);
        }
      }
    }
    console.log('[Graph] Edges: added=' + edgesAdded + ' skipped=' + edgesSkipped + ' total in data=' + data.relationships.length);

    return graph;
  }, []);

  const clearGraph = useCallback(() => {
    graphRef.current = null;
  }, []);

  return { graphRef, loadGraph, clearGraph };
}
