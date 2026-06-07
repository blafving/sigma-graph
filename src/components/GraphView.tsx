import { useState, useEffect, useCallback, useRef } from 'react';
import {
  SigmaContainer,
  useSigma,
  useCamera,
  useRegisterEvents,
  useLoadGraph,
  useSetSettings,
  ControlsContainer,
  ZoomControl,
} from '@react-sigma/core';
import { MiniMap } from '@react-sigma/minimap';
import { LayoutForceAtlas2Control } from '@react-sigma/layout-forceatlas2';
import { useGraphData } from '../hooks/useGraphData';
import { useGraphFilters } from '../hooks/useGraphFilters';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { FilterBar } from './FilterBar';
import { NodeList } from './NodeList';
import { DetailPanel } from './DetailPanel';
import { StatsBar } from './StatsBar';
import { StatusIndicator } from './StatusIndicator';
import { labelToColor } from '../lib/color-palette';
import { fetchTypeCounts } from '../lib/api-client';
import type { DirectedGraph } from 'graphology';

function GraphCanvasInner() {
  const sigma = useSigma();
  const { goto } = useCamera();
  const loadGraph = useLoadGraph();
  const setSettings = useSetSettings();

  const { graphRef, loadGraph: loadData } = useGraphData();
  const { status: backendStatus, lastChecked } = useBackendStatus();
  const {
    visibleTypes,
    allTypes,
    searchQuery,
    setSearchQuery,
    toggleType,
    applyFilters,
    visibleTypeCounts,
  } = useGraphFilters(graphRef.current);

  // Keep a reference to the sigma graph (the one sigma actually renders)
  const sigmaGraphRef = useRef<DirectedGraph | null>(null);

  const [selectedNode, setSelectedNode] = useState<{
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
  } | null>(null);

  const [graphLoaded, setGraphLoaded] = useState(false);
  const [typeCounts, setTypeCounts] = useState<Map<string, number>>(new Map());
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const layoutAppliedRef = useRef(false);

  // Set default settings
  useEffect(() => {
    setSettings({
      defaultNodeColor: '#333',
      defaultNodeType: 'graphology-rendering-webgl-node',
      defaultEdgeColor: '#aaa',
      defaultEdgeType: 'graphology-rendering-webgl-edge',
      labelSize: 12,
      labelFont: 'sans-serif',
      labelRenderedSizeThreshold: 8,
      labelDensity: 0.3,
      labelGridCellSize: 20,
      enableEdgeEvents: true,
    });
  }, [setSettings]);

  // Load the graph on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await loadData();
        if (!cancelled) {
          loadGraph(g);
          // Store reference to the sigma graph for layout
          sigmaGraphRef.current = sigma.getGraph();
          layoutAppliedRef.current = false;
          setGraphLoaded(true);
          try {
            const tc = await fetchTypeCounts();
            setTypeCounts(new Map(tc.types.map(t => [t.label, t.count])));
          } catch { /* ignore */ }
        }
      } catch (err) {
        console.error('Failed to load graph:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [loadData, loadGraph, sigma]);

  // Run layout after graph loads — positions the sigma graph directly
  useEffect(() => {
    if (!graphRef.current || !graphLoaded) return;
    if (layoutAppliedRef.current) return;
    layoutAppliedRef.current = true;

    setIsLayoutRunning(true);

    const timer = setTimeout(() => {
      try {
        const sGraph = sigmaGraphRef.current;
        if (!sGraph || sGraph.isEmpty()) {
          setIsLayoutRunning(false);
          return;
        }

        import('graphology-layout').then(({ random }) => {
          import('graphology-layout-forceatlas2').then(({ default: forceAtlas2 }) => {
            random.assign(sGraph);
            forceAtlas2.assign(sGraph, {
              settings: {
                scalingRatio: 50,
                strongGravityMode: true,
                barnesHutOptimize: true,
                barnesHutTheta: 0.5,
              },
              iterations: 200,
            });
            sigma.refresh();
            goto({ x: 0, y: 0, ratio: 1 });
            setIsLayoutRunning(false);
          });
        });
      } catch (err) {
        console.error('Layout error:', err);
        setIsLayoutRunning(false);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [graphLoaded, graphRef, sigma, goto]);

  // Apply filters when they change
  useEffect(() => {
    if (!graphRef.current || !graphLoaded) return;

    const sGraph = sigmaGraphRef.current;
    if (!sGraph) return;

    const filtered = applyFilters(graphRef.current);
    if (!filtered) {
      sGraph.clear();
      sigma.refresh();
      return;
    }

    const visibleNodes = new Set<string>();
    filtered.forEachNode((node) => visibleNodes.add(node));

    const allNodes = sGraph.nodes();
    allNodes.forEach((node) => {
      if (!visibleNodes.has(node)) {
        sGraph.setNodeAttribute(node, 'size', 0);
      } else {
        sGraph.setNodeAttribute(node, 'size', 4);
      }
    });

    const allEdges = sGraph.edges();
    allEdges.forEach((edge) => {
      const [src, tgt] = sGraph.extremities(edge);
      if (!src || !tgt || !visibleNodes.has(src) || !visibleNodes.has(tgt)) {
        sGraph.setEdgeAttribute(edge, 'size', 0);
      } else {
        sGraph.setEdgeAttribute(edge, 'size', 1);
      }
    });

    sigma.refresh();
  }, [visibleTypes, searchQuery, graphLoaded, graphRef, applyFilters, sigma]);

  // Track zoom level
  useEffect(() => {
    const updateZoom = () => {
      const cam = sigma.getCamera();
      setZoomLevel(1 / cam.ratio);
    };
    const cam = sigma.getCamera();
    cam.on('updated', updateZoom);
    updateZoom();
    return () => { cam.off('updated', updateZoom); };
  }, [sigma]);

  // Node click handler
  const onNodeClick = useCallback(async ({ node }: { node: string }) => {
    setSelectedNode(null);
    try {
      const { fetchSubgraph } = await import('../lib/api-client');
      const [label, name] = node.split(':');
      const subgraph = await fetchSubgraph(label, name, 2);

      const relationships = subgraph.relationships.map((rel) => ({
        type: rel.type,
        source: rel.source,
        target: rel.target,
        targetLabel: rel.target.split(':')[0],
      }));

      const centerNode = subgraph.nodes.find(n => n.id === node);
      if (centerNode) {
        setSelectedNode({
          id: centerNode.id,
          label: centerNode.label,
          name: centerNode.name,
          properties: centerNode.properties,
          relationships,
        });

        const g = sigma.getGraph();
        const nodeData = g.getNodeAttributes(node);
        if (nodeData && 'x' in nodeData && 'y' in nodeData) {
          goto({
            x: nodeData.x as number,
            y: nodeData.y as number,
            ratio: 0.5,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch subgraph:', err);
      setSelectedNode(null);
    }
  }, [sigma, goto]);

  const registerEvents = useRegisterEvents();
  useEffect(() => {
    registerEvents({
      clickNode: onNodeClick,
      enterNode: (_event: { node: string }) => {},
      leaveNode: () => {},
    });
  }, [registerEvents, onNodeClick]);

  // Count visible nodes/edges
  const graph = sigma.getGraph();
  const visibleNodeCount = graph.size;
  let visibleEdgeCount = 0;
  graph.forEachEdge(() => { visibleEdgeCount++; });

  const totalNodes = graphLoaded
    ? (typeCounts.size > 0 ? Array.from(typeCounts).reduce((s, t) => s + t[1], 0) : visibleNodeCount)
    : 0;

  return (
    <div style={styles.container}>
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        allTypes={allTypes}
        visibleTypes={visibleTypes}
        typeCounts={typeCounts}
        onToggleType={toggleType}
      />

      <div style={styles.middleRow}>
        <NodeList
          allTypes={allTypes}
          visibleTypes={visibleTypes}
          typeCounts={typeCounts}
          visibleTypeCounts={visibleTypeCounts}
          onToggleType={toggleType}
          graph={graphRef.current}
        />

        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <ControlsContainer position="bottom-right">
            <ZoomControl />
          </ControlsContainer>

          <ControlsContainer position="bottom-left">
            <LayoutForceAtlas2Control />
          </ControlsContainer>

          <ControlsContainer position="top-right">
            <MiniMap width="120px" height="80px" />
          </ControlsContainer>

          {isLayoutRunning && (
            <div style={styles.layoutStatus}>
              Computing layout...
            </div>
          )}
        </div>

        <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      </div>

      <StatsBar
        totalNodes={totalNodes}
        visibleNodes={visibleNodeCount}
        visibleEdges={visibleEdgeCount}
        zoom={zoomLevel}
        backendStatus={backendStatus}
        lastChecked={lastChecked}
        typeCount={allTypes.size}
      />

      <StatusIndicator status={backendStatus} lastChecked={lastChecked} />
    </div>
  );
}

export function GraphCanvas() {
  return (
    <SigmaContainer
      style={{ width: '100vw', height: '100vh' }}
      settings={{ allowInvalidContainer: true }}
    >
      <GraphCanvasInner />
    </SigmaContainer>
  );
}

export function GraphView() {
  return <GraphCanvas />;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: '#1a1a2e',
    color: '#e0e0e0',
  },
  middleRow: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },
  layoutStatus: {
    position: 'absolute',
    top: 10,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(30, 30, 50, 0.9)',
    color: '#aaa',
    padding: '6px 16px',
    borderRadius: 4,
    fontSize: 12,
    zIndex: 10,
    pointerEvents: 'none',
  },
};
