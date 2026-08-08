import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SigmaContainer,
  useSigma,
  useCamera,
  useRegisterEvents,
  ControlsContainer,
  ZoomControl,
} from '@react-sigma/core';
import { MiniMap } from '@react-sigma/minimap';
import { LayoutForceAtlas2Control, useLayoutForceAtlas2 } from '@react-sigma/layout-forceatlas2';
import { useGraphData } from '../hooks/useGraphData';
import { useGraphUi } from '../GraphUiContext';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { FilterBar } from './FilterBar';
import { NodeList } from './NodeList';
import { DetailPanel } from './DetailPanel';
import { StatsBar } from './StatsBar';
import { StatusIndicator } from './StatusIndicator';
import { fetchTypeCounts } from '../lib/api-client';
import { GraphUiContext } from '../GraphUiContext';
import type { GraphNodeDetail } from '../GraphUiContext';

// ---------------------------------------------------------------------------
// SigmaCanvasInner: everything that MUST live inside the SigmaContainer.
// The graph arrives via the `graph` prop on SigmaContainer (built at shell
// level), so no useLoadGraph here. Renders only canvas overlays + event wiring.
// ---------------------------------------------------------------------------
function SigmaCanvasInner() {
  const sigma = useSigma();
  const { goto } = useCamera();
  const ui = useGraphUi();
  const { status: backendStatus, lastChecked } = useBackendStatus();
  const { setSelectedNode, searchQuery, visibleTypes } = ui;

  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [filterTick, setFilterTick] = useState(0);
  const zoomLevel = ui.zoomLevel;
  const layoutAppliedRef = useRef(false);

  // Layout runs once after the graph is present
  const layout = useLayoutForceAtlas2({
    iterations: 100,
    settings: { scalingRatio: 2, strongGravityMode: true, barnesHutOptimize: true, barnesHutTheta: 0.5 },
  });

  useEffect(() => {
    const g = sigma.getGraph();
    if (!g || g.order === 0 || !ui.graphLoaded) return;
    if (layoutAppliedRef.current) return;
    layoutAppliedRef.current = true;

    setIsLayoutRunning(true);
    ui.setIsLayoutRunning(true);

    // FA2 degenerates when every node starts at (0,0) - seed an initial
    // random spread first so forces can separate the nodes.
    const g0 = sigma.getGraph();
    if (g0 && g0.order > 0) {
      g0.forEachNode((node) => {
        g0.setNodeAttribute(node, 'x', Math.random() * 20 - 10);
        g0.setNodeAttribute(node, 'y', Math.random() * 20 - 10);
      });
    }

    layout.assign();

    setTimeout(() => {
      try {
        const gg = sigma.getGraph();
        if (gg && gg.order > 0) goto({ x: 0, y: 0, ratio: 0.5 });
      } catch { /* ignore */ }
      setIsLayoutRunning(false);
      ui.setIsLayoutRunning(false);
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigma, ui.graphLoaded, goto, layout]);

  // Apply filters (sigma v3 native `hidden` attribute)
  useEffect(() => {
    const sGraph = sigma.getGraph();
    if (!sGraph || sGraph.order === 0) return;

    const q = searchQuery.trim().toLowerCase();
    const keep = new Set<string>();
    sGraph.forEachNode((node, attrs) => {
      const typeOk = visibleTypes.size === 0 || visibleTypes.has(attrs.nodeType as string);
      const queryOk = !q || String(attrs.label ?? '').toLowerCase().includes(q);
      if (typeOk && queryOk) keep.add(node);
    });

    sGraph.forEachNode((node) => {
      const shouldHide = !keep.has(node);
      if (Boolean(sGraph.getNodeAttribute(node, 'hidden')) !== shouldHide) {
        sGraph.setNodeAttribute(node, 'hidden', shouldHide);
      }
    });
    sGraph.forEachEdge((edge) => {
      const [src, tgt] = sGraph.extremities(edge);
      const shouldHide = !(src && tgt && keep.has(src) && keep.has(tgt));
      if (Boolean(sGraph.getEdgeAttribute(edge, 'hidden')) !== shouldHide) {
        sGraph.setEdgeAttribute(edge, 'hidden', shouldHide);
      }
    });

    sigma.refresh();
    setFilterTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, visibleTypes, ui.graphLoaded, sigma]);

  // Track zoom
  useEffect(() => {
    const updateZoom = () => {
      try { ui.setZoomLevel(1 / sigma.getCamera().ratio); } catch { /* ignore */ }
    };
    const cam = sigma.getCamera();
    cam.on('updated', updateZoom);
    updateZoom();
    return () => { cam.off('updated', updateZoom); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigma]);

  // Click node -> drill-down panel
  const onNodeClick = async ({ node }: { node: string }) => {
    setSelectedNode(null);
    try {
      const { fetchSubgraph } = await import('../lib/api-client');
      const [label, name] = node.split(':');
      const subgraph = await fetchSubgraph(label, name, 2);
      console.log('[CLICK]', node, '-> nodes=' + (subgraph.nodes||[]).length + ' rels=' + (subgraph.relationships||[]).length);
      const relationships = (subgraph.relationships || []).map((rel: any) => ({
        type: rel.type, source: rel.source, target: rel.target,
        targetLabel: rel.target.split(':')[0],
      }));
      const g = sigma.getGraph();
      const centerNode = subgraph.nodes.find((n: any) => n.id === node);
      if (centerNode) {
        setSelectedNode({ id: centerNode.id, label: centerNode.label, name: centerNode.name, properties: centerNode.properties, relationships });
      } else if (g && g.hasNode(node)) {
        const attrs = g.getNodeAttributes(node);
        setSelectedNode({
          id: node,
          label: (attrs.nodeType as string) || label,
          name: (attrs.label as string) || name,
          properties: (attrs.properties as Record<string, unknown>) || {},
          relationships,
        });
      }
      const nodeData = g ? g.getNodeAttributes(node) : null;
      if (nodeData && 'x' in nodeData && 'y' in nodeData) {
        goto({ x: nodeData.x as number, y: nodeData.y as number, ratio: 0.5 });
      }
    } catch (err) {
      console.error('Failed to fetch subgraph:', err);
      setSelectedNode(null);
    }
  };

  const registerEvents = useRegisterEvents();

  // Hover dim + node click
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerEvents]);

  // Listen for node-focus requests from the sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const node = (e as CustomEvent).detail?.node;
      if (node) onNodeClick({ node });
    };
    window.addEventListener('sigma:focus-node', handler);
    return () => window.removeEventListener('sigma:focus-node', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNodeClick]);

  // Stats
  const graph = sigma.getGraph();
  void filterTick;
  let visibleNodeCount = 0;
  let visibleEdgeCount = 0;
  graph.forEachNode((_, a) => { if (!a.hidden) visibleNodeCount++; });
  graph.forEachEdge((e) => { if (!graph.getEdgeAttribute(e, 'hidden')) visibleEdgeCount++; });

  return (
    <>
      <ControlsContainer position="bottom-right"><ZoomControl /></ControlsContainer>
      <ControlsContainer position="bottom-left"><LayoutForceAtlas2Control /></ControlsContainer>
      <ControlsContainer position="top-right"><MiniMap width="140px" height="100px" /></ControlsContainer>
      {isLayoutRunning && <div style={styles.layoutStatus}>Computing layout...</div>}
      <div style={styles.statsOverlayRow}>
        <StatsBar
          totalNodes={ui.typeCounts.size > 0 ? Array.from(ui.typeCounts.values()).reduce((s: number, c: number) => s + c, 0) : visibleNodeCount}
          visibleNodes={visibleNodeCount}
          visibleEdges={visibleEdgeCount}
          zoom={zoomLevel}
          backendStatus={backendStatus}
          lastChecked={lastChecked}
          typeCount={ui.allTypes.size}
        />
        <StatusIndicator status={backendStatus} lastChecked={lastChecked} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// GraphView: the PAGE SHELL. Sidebars are SIBLINGS of the sigma container.
// ---------------------------------------------------------------------------
export function GraphView() {
  const { graphRef, loadGraph: loadData } = useGraphData();
  const [graph, setGraph] = useState<any | null>(null);

  const [selectedNode, setSelectedNode] = useState<GraphNodeDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());
  const [allTypes, setAllTypes] = useState<Set<string>>(new Set());
  const [visibleTypeCounts, setVisibleTypeCounts] = useState<Map<string, number>>(new Map());
  const [graphLoaded, setGraphLoaded] = useState(false);
  const [typeCounts, setTypeCounts] = useState<Map<string, number>>(new Map());
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Load the graph once at shell level (shared with sigma + sidebars)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await loadData();
        if (cancelled) return;
        setGraph(g);
        setGraphLoaded(true);
        // discover types + counts from the loaded graph
        const types = new Set<string>();
        const counts = new Map<string, number>();
        g.forEachNode((_, attrs) => {
          const t = attrs.nodeType as string;
          if (t) {
            types.add(t);
            counts.set(t, (counts.get(t) || 0) + 1);
          }
        });
        setAllTypes(types);
        setVisibleTypes(new Set(types));
        setVisibleTypeCounts(counts);
        try {
          const tc = await fetchTypeCounts();
          setTypeCounts(new Map(tc.types.map((t: any) => [t.label, t.count])));
        } catch { /* ignore */ }
      } catch (err) {
        console.error('Failed to load graph:', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData]);

  const toggleType = (type: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const value = useMemo(
    () => ({
      selectedNode, setSelectedNode,
      searchQuery, setSearchQuery,
      visibleTypes, allTypes, toggleType, visibleTypeCounts,
      graphLoaded, setGraphLoaded,
      typeCounts, setTypeCounts,
      zoomLevel, setZoomLevel,
      isLayoutRunning, setIsLayoutRunning,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedNode, searchQuery, visibleTypes, allTypes, visibleTypeCounts, graphLoaded, typeCounts, zoomLevel, isLayoutRunning],
  );

  return (
    <GraphUiContext.Provider value={value}>
      <div style={styles.shell}>
        <div style={styles.topBar}>
          <FilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            allTypes={allTypes}
            visibleTypes={visibleTypes}
            typeCounts={typeCounts}
            onToggleType={toggleType}
          />
        </div>

        <div style={styles.middleRow}>
          <div style={styles.leftSidebar}>
            <NodeList
              graph={graphRef.current}
              allTypes={allTypes}
              visibleTypes={visibleTypes}
              visibleTypeCounts={visibleTypeCounts}
              onToggleType={toggleType}
              searchQuery={searchQuery}
              selectedNode={selectedNode}
              onNodeClick={({ node }) => {
                window.dispatchEvent(new CustomEvent('sigma:focus-node', { detail: { node } }));
              }}
            />
          </div>

          <div style={styles.centerColumn}>
            <SigmaContainer
              graph={graph ?? undefined}
              style={{ width: '100%', height: '100%' }}
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
          </div>

          <div style={styles.rightSidebar}>
            <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
          </div>
        </div>
      </div>
    </GraphUiContext.Provider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw',
    overflow: 'hidden', background: '#1a1a2e', color: '#e0e0e0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  topBar: { flexShrink: 0, position: 'relative', zIndex: 10 },
  middleRow: { display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', zIndex: 10 },
  leftSidebar: { width: 280, flexShrink: 0, position: 'relative', zIndex: 20, overflowY: 'auto', background: '#0a0a14', borderRight: '2px solid #1e3a5f' },
  centerColumn: { flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', zIndex: 1 },
  rightSidebar: { width: 300, flexShrink: 0, position: 'relative', zIndex: 20, overflowY: 'auto', background: '#070b14', borderLeft: '2px solid #1e3a5f' },
  statsOverlayRow: { position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 30, pointerEvents: 'none', padding: '0 16px', boxSizing: 'border-box' },
  layoutStatus: { position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(30, 30, 50, 0.9)', color: '#aaa', padding: '6px 16px', borderRadius: 4, fontSize: 12, zIndex: 20, pointerEvents: 'none' },
};
