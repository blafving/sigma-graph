import { useState } from 'react';
import type { DirectedGraph } from 'graphology';
import { labelToColor } from '../lib/color-palette';

interface NodeListProps {
  graph: DirectedGraph | null;
  searchQuery: string;
  allTypes: Set<string>;
  visibleTypes: Set<string>;
  visibleTypeCounts: Map<string, number>;
  onToggleType: (type: string) => void;
}

export function NodeList({
  graph,
  searchQuery,
  allTypes,
  visibleTypes,
  visibleTypeCounts,
  onToggleType,
}: NodeListProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Build a search filter map from the query (split by space for multi-word)
  const searchTokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return (
    <div style={{
      width: 280,
      background: '#1a1a2e',
      borderRight: '1px solid #2a2a4a',
      overflowY: 'auto',
      fontSize: 13,
      fontFamily: 'sans-serif',
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2a4a' }}>
        <div style={{ marginBottom: 8, fontWeight: 600, color: '#fff' }}>NODES</div>
        <div style={{
          display: 'flex',
          gap: 4,
        }}>
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={() => {
              // Search is handled by parent's FilterBar
            }}
            style={{
              flex: 1,
              padding: '4px 8px',
              background: '#0d0d1a',
              border: '1px solid #2a2a4a',
              borderRadius: 4,
              color: '#fff',
              fontSize: 12,
            }}
          />
        </div>
      </div>

      <div style={{ padding: '8px 0' }}>
        {Array.from(allTypes).sort().map(type => {
          const isVisible = visibleTypes.has(type);
          const color = labelToColor(type);
          const count = visibleTypeCounts.get(type) || 0;

          // Get nodes of this type
          const nodesOfType: Array<{ label: string; id: string }> = [];
          if (graph && isVisible) {
            graph.forEachNode((nodeId, data) => {
              if (data.nodeType === type) {
                const label = data.label as string;
                // Filter by search tokens
                if (searchTokens.length > 0) {
                  const match = searchTokens.every(token => label.toLowerCase().includes(token));
                  if (!match) return;
                }
                nodesOfType.push({ label, id: nodeId });
              }
            });
            nodesOfType.sort((a, b) => a.label.localeCompare(b.label));
          }

          return (
            <div key={type} style={{
              ...styles.typeGroup,
              opacity: isVisible ? 1 : 0.4,
            }}>
              <div
                style={{
                  ...styles.typeHeader,
                  opacity: isVisible ? 1 : 0.4,
                }}
                onClick={() => onToggleType(type)}
              >
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: color,
                  display: 'inline-block',
                  marginRight: 6,
                }} />
                <span style={{ fontWeight: 500, color: '#fff' }}>{type}</span>
                <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>
                  {count || nodesOfType.length}
                </span>
              </div>

              {isVisible && nodesOfType.length > 0 && nodesOfType.length <= 50 && (
                <div style={{ paddingLeft: 20 }}>
                  {nodesOfType.slice(0, 50).map(({ label, id }) => (
                    <div
                      key={id}
                      onClick={() => {
                        setSelectedNode(id);
                      }}
                      style={{
                        ...styles.nodeItem,
                        background: selectedNode === id ? '#2a2a4a' : 'transparent',
                      }}
                    >
                      {label}
                    </div>
                  ))}
                </div>
              )}

              {isVisible && nodesOfType.length > 50 && (
                <div style={{ paddingLeft: 20, color: '#666', fontSize: 11 }}>
                  ... and {nodesOfType.length - 50} more
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  typeGroup: {
    cursor: 'pointer',
  },
  typeHeader: {
    padding: '6px 16px',
    display: 'flex',
    alignItems: 'center',
    fontSize: 12,
    userSelect: 'none' as const,
  },
  nodeItem: {
    padding: '3px 16px 3px 28px',
    fontSize: 11,
    color: '#ccc',
    cursor: 'pointer',
  },
};
