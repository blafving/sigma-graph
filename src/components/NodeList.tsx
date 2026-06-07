import { useState } from 'react';
import type { DirectedGraph } from 'graphology';
import { labelToColor } from '../lib/color-palette';

interface NodeListProps {
  allTypes: Set<string>;
  visibleTypes: Set<string>;
  typeCounts: Map<string, number>;
  visibleTypeCounts: Map<string, number>;
  onToggleType: (type: string) => void;
  graph: DirectedGraph | null;
}

export function NodeList({
  allTypes,
  visibleTypes,
  typeCounts,
  visibleTypeCounts,
  onToggleType,
  graph,
}: NodeListProps) {
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState<Record<string, string>>({});

  const toggleCollapsed = (type: string) => {
    setCollapsedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const sortedTypes = Array.from(allTypes).sort();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>NODES</span>
        <button
          style={styles.expandAllBtn}
          onClick={() => setCollapsedTypes(new Set())}
          title="Expand all"
        >
          +
        </button>
      </div>

      <div style={styles.list}>
        {sortedTypes.map(type => {
          const count = typeCounts.get(type) || 0;
          const visibleCount = visibleTypeCounts.get(type) || 0;
          const isVisible = visibleTypes.has(type);
          const isCollapsed = collapsedTypes.has(type);
          const color = labelToColor(type);
          const filter = searchFilter[type] || '';

          // Get nodes of this type
          const nodesOfType: string[] = [];
          if (graph && isVisible) {
            graph.forEachNode((_, data) => {
               if (data.type === type && (!filter || (data.label as string).toLowerCase().includes(filter.toLowerCase()))) {
                nodesOfType.push(data.label as string);
              }
            });
            nodesOfType.sort();
          }

          return (
            <div key={type} style={styles.typeGroup}>
              <div
                style={{
                  ...styles.typeHeader,
                  opacity: isVisible ? 1 : 0.4,
                }}
                onClick={() => onToggleType(type)}
              >
                <button
                  style={styles.collapseBtn}
                  onClick={(e) => { e.stopPropagation(); toggleCollapsed(type); }}
                >
                  {isCollapsed ? '▶' : '▼'}
                </button>
                <span style={{ ...styles.typeDot, background: color }} />
                <span style={styles.typeName}>{type}</span>
                <span style={styles.typeCount}>
                  {visibleCount}/{count}
                </span>
              </div>

              {!isCollapsed && (
                <div style={styles.nodeList}>
                  {filter !== '' && (
                    <input
                      type="text"
                      placeholder="Filter..."
                      value={filter}
                      onChange={(e) => setSearchFilter(prev => ({ ...prev, [type]: e.target.value }))}
                      style={styles.filterInput}
                    />
                  )}
                  {nodesOfType.length === 0 ? (
                    <div style={styles.emptyNode}>No nodes</div>
                  ) : (
                    nodesOfType.slice(0, 50).map(name => (
                      <div key={name} style={styles.nodeItem}>
                        {name}
                      </div>
                    ))
                  )}
                  {nodesOfType.length > 50 && (
                    <div style={styles.moreNodes}>+{nodesOfType.length - 50} more</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 240,
    background: '#16213e',
    borderRight: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid #333',
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    color: '#888',
  },
  expandAllBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 14,
    padding: '0 4px',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  typeGroup: {
    borderBottom: '1px solid #222',
  },
  typeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: 11,
    userSelect: 'none',
  },
  typeDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  typeName: {
    flex: 1,
    fontWeight: 500,
  },
  typeCount: {
    fontSize: 10,
    color: '#888',
  },
  collapseBtn: {
    background: 'none',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
    fontSize: 9,
    padding: 0,
    width: 14,
    textAlign: 'center',
  },
  nodeList: {
    padding: '2px 8px 2px 26px',
    maxHeight: 200,
    overflowY: 'auto',
  },
  filterInput: {
    width: '100%',
    padding: '2px 6px',
    background: '#0f3460',
    border: '1px solid #444',
    borderRadius: 3,
    color: '#ccc',
    fontSize: 10,
    outline: 'none',
    marginBottom: 2,
  },
  nodeItem: {
    fontSize: 10,
    padding: '1px 4px',
    color: '#aaa',
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyNode: {
    fontSize: 10,
    color: '#666',
    padding: '2px 4px',
  },
  moreNodes: {
    fontSize: 10,
    color: '#666',
    padding: '2px 4px',
    fontStyle: 'italic',
  },
};
