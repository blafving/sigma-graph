/**
 * Explorer shell: owns the API query, the selection, and sigma's settings.
 *
 * Everything that touches sigma lives in `GraphCanvas`; everything that touches HTTP lives in
 * `hooks/useGraphData` + `lib/api-client`. Filters are API params, so a chip toggle is a request,
 * not a graph walk - and the group universe is fixed by the first unfiltered load, otherwise
 * hiding a group makes "everything visible" true and quietly refetches the whole map.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SigmaContainer } from '@react-sigma/core';
import type { Settings as SigmaSettings } from 'sigma/settings';
import { fetchNode } from '../lib/api-client';
import type { GraphQuery } from '../lib/api-client';
import { createLabelPainters } from '../lib/labelPainters';
import { toPanelDetail } from '../lib/detail';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { useGraphData } from '../hooks/useGraphData';
import { CanvasLayer } from './GraphCanvas';
import type { FocusRef } from './GraphCanvas';
import { DetailPanel } from './DetailPanel';
import { FilterBar } from './FilterBar';
import { GraphUiContext } from '../GraphUiContext';
import type { GraphNodeDetail } from '../GraphUiContext';
import { NodeList } from './NodeList';
import { SettingsCog } from './SettingsPanel';
import { StatsBar } from './StatsBar';
import { graphStyles as styles } from './graphStyles';

export function GraphView() {
  const [allGroups, setAllGroups] = useState<Set<string>>(() => new Set());
  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(() => new Set());
  const [selectedNode, setSelectedNode] = useState<GraphNodeDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const hoveredRef = useRef<string | null>(null);
  const focusRef = useRef<{ id: string; neighbours: Set<string> } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageWidthRef = useRef(0);
  const detailTokenRef = useRef(0);
  const { status: backendStatus, lastChecked } = useBackendStatus();

  const query = useMemo<GraphQuery>(() => {
    // First load has no filter to send, and "every group" is the same request as "no filter".
    if (allGroups.size === 0 || visibleGroups.size === allGroups.size) return {};
    return { groups: Array.from(visibleGroups) };
  }, [allGroups, visibleGroups]);

  const { graph, stats, loading, error, revision, reload } = useGraphData(query);

  useEffect(() => {
    if (stats.groups.size === 0) return;
    setAllGroups((prev) => (prev.size ? prev : new Set(stats.groups.keys())));
    setVisibleGroups((prev) => (prev.size ? prev : new Set(stats.groups.keys())));
  }, [stats]);

  const stageWidth = useCallback(() => stageWidthRef.current, []);

  const settings = useMemo<Partial<SigmaSettings>>(() => {
    const painters = createLabelPainters(stageWidth);
    // Hover wins over selection so the map reacts to the pointer even mid-selection.
    const focusOf = (): string | null => hoveredRef.current ?? focusRef.current?.id ?? null;

    return {
      ...painters,
      defaultNodeColor: '#8fa3c0',
      defaultEdgeColor: '#48566e',
      defaultEdgeType: 'line',
      renderLabels: true,
      labelSize: 13,
      labelWeight: '600',
      labelRenderedSizeThreshold: 8,
      labelDensity: 0.4,
      labelGridCellSize: 80,
      zIndex: true,
      minCameraRatio: 0.01,
      // Edge events cost a picking pass per pointer move and nothing listens to them (PAR-27).
      enableEdgeEvents: false,
      hideLabelsOnMove: true,
      // Reducer output REPLACES a node's attributes for the frame (sigma does not merge it), so
      // everything is spread and `x`/`y` must survive or sigma throws.
      nodeReducer: (node, data) => {
        const out = { ...data };
        const focus = focusOf();
        if (!focus || focus === node || focusRef.current?.neighbours.has(node)) return out;
        out.color = data.dimColor ?? data.color;
        out.size = (data.size ?? 2) * 0.75;
        return out;
      },
      edgeReducer: (edge, data) => {
        const out = { ...data };
        const focus = focusOf();
        if (!focus || !graph.hasEdge(edge)) return out;
        if (graph.source(edge) === focus || graph.target(edge) === focus) {
          out.color = '#cfe4ff';
          out.size = 1.4;
          out.zIndex = 1;
          return out;
        }
        out.color = data.dimColor ?? data.color;
        out.size = 0.25;
        return out;
      },
    };
  }, [graph, stageWidth]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      stageWidthRef.current = el.clientWidth;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Newest request wins: two quick clicks must not let the first reply overwrite the second.
  const openNode = useCallback((uid: string) => {
    const token = ++detailTokenRef.current;
    void fetchNode(uid)
      .then((detail) => {
        if (token === detailTokenRef.current) setSelectedNode(toPanelDetail(detail));
      })
      .catch((err: unknown) => {
        if (token !== detailTokenRef.current) return;
        console.error('detail fetch failed', err);
      });
  }, []);

  const closeDetail = useCallback(() => setSelectedNode(null), []);

  const toggleType = useCallback((type: string) => {
    setVisibleGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      selectedNode,
      setSelectedNode,
      searchQuery,
      setSearchQuery,
      visibleTypes: visibleGroups,
      allTypes: allGroups,
      toggleType,
      visibleTypeCounts: stats.groups,
      graphLoaded: revision > 0,
      setGraphLoaded: () => undefined,
      typeCounts: stats.groups,
      setTypeCounts: () => undefined,
      zoomLevel,
      setZoomLevel,
      isLayoutRunning: false,
      setIsLayoutRunning: () => undefined,
    }),
    [selectedNode, searchQuery, visibleGroups, allGroups, toggleType, stats, revision, zoomLevel],
  );

  return (
    <GraphUiContext.Provider value={value}>
      <div style={styles.shell}>
        <div style={styles.topBar}>
          <FilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            allTypes={allGroups}
            visibleTypes={visibleGroups}
            typeCounts={stats.groups}
            onToggleType={toggleType}
          />
          <SettingsCog />
        </div>

        <div style={styles.middleRow}>
          <div style={styles.leftSidebar}>
            <NodeList
              graph={graph}
              allTypes={allGroups}
              visibleTypes={visibleGroups}
              visibleTypeCounts={stats.groups}
              onToggleType={toggleType}
              searchQuery={searchQuery}
              selectedNode={selectedNode}
              onNodeClick={({ node }) => openNode(node)}
            />
          </div>

          <div style={styles.centerColumn} ref={stageRef}>
            <SigmaContainer graph={graph} style={styles.stage} settings={settings}>
              <CanvasLayer
                revision={revision}
                hoveredRef={hoveredRef}
                focusRef={focusRef as FocusRef}
                onOpen={openNode}
                onClose={closeDetail}
              />
            </SigmaContainer>
            {loading && <div style={styles.overlay}>Loading graph…</div>}
            {!loading && error && (
              <div style={styles.overlay}>
                <div style={styles.overlayText}>{error}</div>
                <button style={styles.retry} onClick={reload} type="button">
                  Retry
                </button>
              </div>
            )}
            <div style={styles.statsRow}>
              <StatsBar
                totalNodes={graph.order}
                visibleNodes={graph.order}
                visibleEdges={graph.size}
                zoom={zoomLevel}
                backendStatus={backendStatus}
                lastChecked={lastChecked}
                typeCount={allGroups.size}
              />
            </div>
          </div>

          <div style={styles.rightSidebar}>
            <DetailPanel node={selectedNode} onClose={closeDetail} />
          </div>
        </div>
      </div>
    </GraphUiContext.Provider>
  );
}
