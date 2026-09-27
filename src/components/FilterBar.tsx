import { memo } from 'react';
interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  allTypes: Set<string>;
  visibleTypes: Set<string>;
  typeCounts: Map<string, number>;
  onToggleType: (type: string) => void;
}

function FilterBarBase({
  searchQuery,
  onSearchChange,
  allTypes,
  visibleTypes,
  typeCounts,
  onToggleType,
}: FilterBarProps) {
  const sortedTypes = Array.from(allTypes).sort();

  return (
    <div style={styles.container}>
      {/* Search input */}
      <div style={styles.searchContainer}>
        <span style={styles.searchIcon}>🔍</span>
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={styles.searchInput}
        />
        {searchQuery && (
          <button
            style={styles.clearBtn}
            onClick={() => onSearchChange('')}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Type filter pills */}
      <div style={styles.pillsContainer}>
        {sortedTypes.map(type => {
          const count = typeCounts.get(type) || 0;
          const isVisible = visibleTypes.has(type);
          return (
            <button
              key={type}
              style={{
                ...styles.pill,
                background: isVisible ? 'rgba(100, 149, 237, 0.3)' : 'rgba(50, 50, 70, 0.5)',
                border: isVisible ? '1px solid rgba(100, 149, 237, 0.6)' : '1px solid #444',
                color: isVisible ? '#87CEEB' : '#888',
              }}
              onClick={() => onToggleType(type)}
              title={`Toggle ${type} (${count} nodes)`}
            >
              <span style={styles.pillLabel}>
                {isVisible ? '✓' : '○'} {type}
              </span>
              <span style={styles.pillCount}>({count})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 16px',
    background: '#16213e',
    borderBottom: '1px solid #333',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  searchContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    minWidth: 200,
  },
  searchIcon: {
    position: 'absolute',
    left: 8,
    fontSize: 14,
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '6px 24px 6px 28px',
    background: '#0f3460',
    border: '1px solid #444',
    borderRadius: 4,
    color: '#e0e0e0',
    fontSize: 13,
    outline: 'none',
  },
  clearBtn: {
    position: 'absolute',
    right: 4,
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 12,
    padding: '2px 6px',
  },
  pillsContainer: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: 12,
    fontSize: 11,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  },
  pillLabel: {
    fontWeight: 500,
  },
  pillCount: {
    opacity: 0.7,
    fontSize: 10,
  },
};

/**
 * Memoised: a camera move updates the zoom level in context, and this panel
 * is prop-driven only. Without memo it re-walks the whole graph on every zoom tick.
 */
export const FilterBar = memo(FilterBarBase);
