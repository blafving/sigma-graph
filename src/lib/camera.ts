import type Sigma from 'sigma';

/**
 * Camera helpers for sigma 3.
 *
 * The trap this exists to avoid: sigma 3 has no `focus()` / `locate()`, and
 * `camera.setState()` / `camera.animate()` take **normalised display coordinates** (~0..1),
 * not graph coordinates. Writing a node's `x`/`y` (here roughly -2000..2000) into the camera
 * parks it outside the stage, so the canvas renders black with no error. That is PAR-21 and
 * PAR-58, and it is what the pre-v2 explorer did at `GraphView.tsx:200`.
 *
 * The coordinates must come from `sigma.getNodeDisplayData()`, which is exactly what the
 * library's own `useCamera().gotoNode()` does. `sigma.normalizationFunction` would also work
 * but is declared `private` in sigma's types, so it is not usable from a typed app.
 */
export interface CameraFocusOptions {
  /** Camera ratio after the move (smaller = closer). Omit to keep the current zoom. */
  ratio?: number;
  duration?: number;
}

const DEFAULT_DURATION = 280;

/**
 * Ease the camera onto a node, optionally zooming. Returns false when the node is not
 * rendered, leaving the current view alone.
 */
export function focusNode(
  sigma: Sigma,
  nodeKey: string | null | undefined,
  options: CameraFocusOptions = {},
): boolean {
  if (!nodeKey) return false;
  const display = sigma.getNodeDisplayData(nodeKey);
  if (!display || !Number.isFinite(display.x) || !Number.isFinite(display.y)) return false;
  const camera = sigma.getCamera();
  const ratio = options.ratio ?? camera.getState().ratio;
  camera.animate(
    { ...camera.getState(), x: display.x, y: display.y, ratio },
    { duration: options.duration ?? DEFAULT_DURATION },
  );
  return true;
}

/** Fit the whole graph. */
export function fitView(sigma: Sigma, duration = DEFAULT_DURATION): void {
  sigma.getCamera().animatedReset({ duration });
}
