/**
 * Label and hover painters.
 *
 * sigma 3 ships no usable label contrast controls. Its defaults paint the label in
 * `settings.labelColor` straight over whatever is behind it, and its hover painter
 * (`drawDiscNodeHover`) fills a WHITE plate and then writes `labelColor` on top of it, so any
 * light label colour is unreadable on hover. Every sigma 2 setting that addressed this is gone
 * (`labelBgColor`, `labelBgOpacity`, `labelRenderedColorEncoding`, `alignLabel`, `textColor`,
 * `bold`, `force`, `badge`), leaving only these two pluggable functions.
 *
 * Contract (sigma/dist/declarations/src/rendering/node-labels.d.ts):
 *   (context, data: NodeDisplayData with x/y/size/label/color required, settings) => void
 * with `x`/`y` already in stage pixels and `size` already camera-scaled.
 *
 * sigma also never flips a label to the other side of a node, so labels on nodes near the
 * right edge are clipped mid-word by the canvas. Both painters below anchor left when the text
 * would overflow, which needs a stage width the settings object does not carry - hence the
 * factory taking a `stageWidth` accessor wired to the container's resize observer.
 */
const LABEL_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const TEXT_COLOR = '#eef3fa';
const OUTLINE = 'rgba(5, 9, 16, 0.85)';
const OUTLINE_WIDTH = 3;
const PLATE = 'rgba(7, 12, 22, 0.94)';
const PLATE_BORDER = 'rgba(120, 170, 230, 0.55)';
const PAD_X = 6;
const PAD_Y = 4;
const EDGE_MARGIN = 8;

/** The subset of sigma's NodeDisplayData these painters care about. */
export interface LabelDisplayData {
  x: number;
  y: number;
  size: number;
  label?: unknown;
  color?: string;
  /** Custom field set by the node reducer for the focused node. */
  forceLabel?: boolean;
  /** Custom field set by the node reducer for de-emphasised nodes. */
  dimmed?: boolean;
}

interface MinimalSettings {
  labelSize?: number;
  labelWeight?: string | number;
  labelFont?: string;
}

type Painter = (
  context: CanvasRenderingContext2D,
  data: LabelDisplayData,
  settings: MinimalSettings,
) => void;

export interface LabelPainters {
  defaultDrawNodeLabel: Painter;
  defaultDrawNodeHover: Painter;
}

function fontFor(settings: MinimalSettings, bold: boolean): string {
  const size = settings.labelSize ?? 13;
  const weight = bold ? '700' : String(settings.labelWeight ?? '600');
  const family = settings.labelFont ?? LABEL_FONT_FAMILY;
  return `${weight} ${size}px ${family}`;
}

/** Anchor a label beside a node, flipping to the left when it would clip the stage edge. */
function anchor(
  textWidth: number,
  data: LabelDisplayData,
  stageWidth: () => number,
): { textX: number; align: CanvasTextAlign } {
  const gap = data.size + 4;
  const width = stageWidth() || Number.POSITIVE_INFINITY;
  const fitsRight = data.x + gap + textWidth <= width - EDGE_MARGIN;
  return fitsRight
    ? { textX: data.x + gap, align: 'left' }
    : { textX: data.x - gap, align: 'right' };
}

export function createLabelPainters(stageWidth: () => number): LabelPainters {
  const drawNodeLabel: Painter = (context, data, settings) => {
    const text = typeof data.label === 'string' ? data.label : '';
    if (!text) return;
    context.save();
    context.font = fontFor(settings, false);
    context.textBaseline = 'middle';
    const { textX, align } = anchor(context.measureText(text).width, data, stageWidth);
    context.textAlign = align;
    context.globalAlpha = data.dimmed ? 0.25 : 1;
    // Dark stroke behind the glyphs: readable over pale nodes and over other labels.
    context.lineWidth = OUTLINE_WIDTH;
    context.strokeStyle = OUTLINE;
    context.lineJoin = 'round';
    context.strokeText(text, textX, data.y);
    context.fillStyle = TEXT_COLOR;
    context.fillText(text, textX, data.y);
    context.restore();
  };

  const drawNodeHover: Painter = (context, data, settings) => {
    const text = typeof data.label === 'string' ? data.label : '';
    context.save();
    // Halo on the node itself, so the focused node reads even when its label is long.
    context.beginPath();
    context.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
    context.strokeStyle = PLATE_BORDER;
    context.lineWidth = 2;
    context.stroke();
    if (!text) {
      context.restore();
      return;
    }
    context.font = fontFor(settings, true);
    const textWidth = context.measureText(text).width;
    const height = (settings.labelSize ?? 13) + PAD_Y * 2;
    const { textX, align } = anchor(textWidth, data, stageWidth);
    const boxX = align === 'left' ? textX - PAD_X : textX - textWidth - PAD_X;
    roundRect(context, boxX, data.y - height / 2, textWidth + PAD_X * 2, height, 4);
    context.fillStyle = PLATE;
    context.fill();
    context.strokeStyle = PLATE_BORDER;
    context.lineWidth = 1;
    context.stroke();
    context.textBaseline = 'middle';
    context.textAlign = align;
    context.fillStyle = '#ffffff';
    context.fillText(text, textX, data.y);
    context.restore();
  };

  return { defaultDrawNodeLabel: drawNodeLabel, defaultDrawNodeHover: drawNodeHover };
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}
