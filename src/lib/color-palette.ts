export const PALETTE = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b',
  '#2980b9', '#27ae60', '#d35400', '#8e44ad', '#f1c40f',
  '#7f8c8d', '#2c3e50', '#e84393', '#00b894', '#6c5ce7',
];

/**
 * Fixed colors for the v2 coarse `typeGroup`. Deliberately stable: the canvas, the filter
 * chips and the node list must agree, so groups never fall through to the hash.
 */
export const GROUP_COLORS: Record<string, string> = {
  Concept: '#64b5f6',
  Source: '#ba68c8',
  Actor: '#ffb74d',
  Technology: '#4db6ac',
  Market: '#f06292',
  Analysis: '#fff176',
  Other: '#90a4ae',
};

/** Group color when the value is a v2 typeGroup, otherwise a stable hash color. */
export function labelToColor(label: string): string {
  const fixed = GROUP_COLORS[label];
  if (fixed) return fixed;
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function groupColor(group: string | undefined | null): string {
  return labelToColor(group || 'Other');
}
