import { useState, useEffect, useCallback, useRef } from 'react';
import {
  SigmaContainer,
  useSigma,
  useCamera,
  useRegisterEvents,
  useLoadGraph,
  ControlsContainer,
  ZoomControl,
} from '@react-sigma/core';
import { MiniMap } from '@react-sigma/minimap';
import { LayoutForceAtlas2Control, useLayoutForceAtlas2 } from '@react-sigma/layout-forceatlas2';
import { useGraphData } from '../hooks/useGraphData';
import { useGraphFilters } from '../hooks/useGraphFilters';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { FilterBar } from './FilterBar';
import { NodeList } from './NodeList';
import { DetailPanel } from './DetailPanel';
import { StatsBar } from './StatsBar';
import { StatusIndicator } from './StatusIndicator';
import { fetchTypeCounts } from '../lib/api-client';

// Component inside SigmaContainer — has access to all hooks
function SigmaCanvasInner() {
  const sigma = useSigma();
  const { goto } = useCamera();
  const loadGraph = useLoadGraph();

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
  const [filterTick, setFilterTick] = useState(0);
  const layoutAppliedRef = useRef(false);

  // Load the graph on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await loadData();
        if (!cancelled) {
          loadGraph(g);
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

  // Run layout after graph loads
  const layout = useLayoutForceAtlas2({
    iterations: 100,
    settings: {
      scalingRatio: 2,
      strongGravityMode: true,
      barnesHutOptimize: true,
      barnesHutTheta: 0.5,
    },
  });

  useEffect(() => {
    if (!graphRef.current || !graphLoaded) return;
    if (layoutAppliedRef.current) return;
    layoutAppliedRef.current = true;

    setIsLayoutRunning(true);
    layout.assign();

    setTimeout(() => {
      try {
        const g = sigma.getGraph();
        if (g && g.order > 0) {
          goto({ x: 0, y: 0, ratio: 0.5 });
        }
      } catch { /* ignore */ }
      setIsLayoutRunning(false);
    }, 1500);
  }, [graphLoaded, graphRef, sigma, goto, layout]);

  // Apply filters when they change (uses sigma v3 native `hidden` so filtered-out
  // nodes AND their labels/edges are fully removed from the render + picking)
  useEffect(() => {
    if (!graphRef.current || !graphLoaded) return;

    const sGraph = sigma.getGraph();
    if (!sGraph) return;

    const filtered = applyFilters(graphRef.current);
    if (!filtered) {
      sGraph.clear();
      sigma.refresh();
      return;
    }

    const visibleNodes = new Set<string>();
    filtered.forEachNode((node) => visibleNodes.add(node));

    sGraph.forEachNode((node) => {
      const shouldHide = !visibleNodes.has(node);
      if (Boolean(sGraph.getNodeAttribute(node, 'hidden')) !== shouldHide) {
        sGraph.setNodeAttribute(node, 'hidden', shouldHide);
      }
    });

    sGraph.forEachEdge((edge) => {
      const [src, tgt] = sGraph.extremities(edge);
      const shouldHide = !(src && tgt && visibleNodes.has(src) && visibleNodes.has(tgt));
      if (Boolean(sGraph.getEdgeAttribute(edge, 'hidden')) !== shouldHide) {
        sGraph.setEdgeAttribute(edge, 'hidden', shouldHide);
      }
    });

    sigma.refresh();
    // Force a React re-render so the stats bar recomputes counts from hidden attrs
    setFilterTick(t => t + 1);
  }, [visibleTypes, searchQuery, graphLoaded, graphRef, applyFilters, sigma, setFilterTick]);

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

      const relationships = (subgraph.relationships || []).map((rel) => ({
        type: rel.type,
        source: rel.source,
        target: rel.target,
        targetLabel: rel.target.split(':')[0],
      }));

      const g = sigma.getGraph();
      const centerNode = subgraph.nodes.find(n => n.id === node);
      if (centerNode) {
        setSelectedNode({
          id: centerNode.id,
          label: centerNode.label,
          name: centerNode.name,
          properties: centerNode.properties,
          relationships,
        });
      } else if (g && g.hasNode(node)) {
        // The clicked node was not in the subgraph response (isolated node or
        // backend hop match). Fall back to its main-graph attributes so the
        // detail panel always opens instead of silently staying blank.
        const attrs = g.getNodeAttributes(node);
        setSelectedNode({
          id: node,
          label: (attrs.nodeType as string) || label,
          name: (attrs.label as string) || name,
          properties: (attrs.properties as Record<string, unknown>) || {},
          relationships,
        });
      }

      // Recenter on the clicked node when it has a layout position
      const nodeData = g ? g.getNodeAttributes(node) : null;
      if (nodeData && 'x' in nodeData && 'y' in nodeData) {
        goto({
          x: nodeData.x as number,
          y: nodeData.y as number,
          ratio: 0.5,
        });
      }
    } catch (err) {
      console.error('Failed to fetch subgraph:', err);
      setSelectedNode(null);
    }
  }, [sigma, goto]);

  const registerEvents = useRegisterEvents();

  // Hover highlighting
  useEffect(() => {
    registerEvents({
      clickNode: onNodeClick,
      enterNode: (event: { node: string }) => {
        const g = sigma.getGraph();
        if (!g) return;
        const neighbors = new Set(g.neighbors(event.node));
        neighbors.add(event.node);

        g.forEachNode((node) => {
          g.setNodeAttribute(node, 'labelColor', neighbors.has(node) ? '#e0e0e0' : '#333');
          g.setNodeAttribute(node, 'size', neighbors.has(node) ? 4 : 2);
        });
        sigma.refresh();
      },
      leaveNode: () => {
        const g = sigma.getGraph();
        if (!g) return;
        g.forEachNode((node) => {
          g.setNodeAttribute(node, 'labelColor', '#e0e0e0');
          g.setNodeAttribute(node, 'size', 4);
        });
        sigma.refresh();
      },
    });
  }, [registerEvents, onNodeClick]);

  // Count visible (non-hidden) nodes/edges
  const graph = sigma.getGraph();
  void filterTick; // re-render when filters change so counts stay in sync
  let visibleNodeCount = 0;
  let visibleEdgeCount = 0;
  graph.forEachNode((_, nodeAttrs) => {
    if (!nodeAttrs.hidden) visibleNodeCount++;
  });
  graph.forEachEdge((edge) => {
    if (!graph.getEdgeAttribute(edge, 'hidden')) visibleEdgeCount++;
  });

  const totalNodes = graphLoaded
    ? (typeCounts.size > 0 ? Array.from(typeCounts).reduce((s, t) => s + t[1], 0) : visibleNodeCount)
    : 0;

  return (
    <div style={styles.container}>
      {/* Top bar */}
      <div style={styles.filterBar}>
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          allTypes={allTypes}
          visibleTypes={visibleTypes}
          typeCounts={typeCounts}
          onToggleType={toggleType}
        />
      </div>

      {/* Middle row: sidebar - graph - sidebar */}
      <div style={styles.middleRow}>
        {/* Left sidebar */}
        <div style={styles.leftSidebar}>
          <NodeList
            allTypes={allTypes}
            visibleTypes={visibleTypes}
            visibleTypeCounts={visibleTypeCounts}
            onToggleType={toggleType}
            searchQuery={searchQuery}
            graph={graphRef.current}
            selectedNode={selectedNode}
            onNodeClick={onNodeClick}
          />
        </div>

        {/* Center column: sigma canvas + controls */}
        <div style={styles.centerColumn}>
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

        {/* Right sidebar */}
        <div style={styles.rightSidebar}>
          <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        </div>
      </div>

      {/* Bottom bar */}
      <div style={styles.statsBar}>
        <StatsBar
          totalNodes={totalNodes}
          visibleNodes={visibleNodeCount}
          visibleEdges={visibleEdgeCount}
          zoom={zoomLevel}
          backendStatus={backendStatus}
          lastChecked={lastChecked}
          typeCount={allTypes.size}
        />
      </div>

      {/* Status indicator */}
      <div style={styles.statusIndicator}>
        <StatusIndicator status={backendStatus} lastChecked={lastChecked} />
      </div>
    </div>
  );
}

// This is the outermost wrapper — SigmaContainer provides context for all hooks
export function GraphView() {
  return (
    <SigmaContainer
      style={{ width: '100vw', height: '100vh' }}
      settings={{
        defaultNodeType: 'circle',
        defaultNodeColor: '#333',
        defaultEdgeType: 'line',
        defaultEdgeColor: '#aaa',
        labelSize: 14,
        labelFont: 'sans-serif',
        labelRenderedSizeThreshold: 15,
        labelDensity: 0.07,
        labelGridCellSize: 60,
        enableEdgeEvents: true,
      }}
    >
      <SigmaCanvasInner />
    </SigmaContainer>
  );
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
  filterBar: {
    zIndex: 10,
    position: 'relative',
    flexShrink: 0,
  },
  middleRow: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
    zIndex: 10,
    position: 'relative',
  },
  leftSidebar: {
    zIndex: 10,
    position: 'relative',
  },
  centerColumn: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    minWidth: 0,
    zIndex: 10,
  },
  rightSidebar: {
    zIndex: 10,
    position: 'relative',
  },
  statsBar: {
    zIndex: 10,
    position: 'relative',
    flexShrink: 0,
  },
  statusIndicator: {
    zIndex: 10,
    position: 'relative',
    flexShrink: 0,
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
    zIndex: 20,
    pointerEvents: 'none',
  },
};
