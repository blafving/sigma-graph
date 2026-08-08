import { useEffect, useRef, useState } from 'react';
import { useSigma } from '@react-sigma/core';

interface Props {
  width?: number;
  height?: number;
}

interface Bounds {
  minX: number; maxX: number; minY: number; maxY: number;
  cx: number; cy: number; w: number; h: number;
}

/**
 * Custom minimap with a FIXED world window (the full occupied-space bounding box),
 * so the occupied/unoccupied boundary is always visible at every zoom level.
 *
 * - Draws the occupied region (graph bbox) with a distinct fill + border.
 * - Overlays a viewport rectangle = the main camera's current view.
 * - Click/drag pans the main camera to the corresponding world point
 *   (keeps current zoom, so min/maxCameraRatio clamps still apply).
 */
export function CustomMiniMap({ width = 180, height = 130 }: Props) {
  const sigma = useSigma();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const draggingRef = useRef(false);

  // Compute the occupied-space bounds once the graph is laid out
  useEffect(() => {
    const g = sigma.getGraph();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, cnt = 0;
    g.forEachNode((_, a) => {
      if (typeof a.x === 'number' && typeof a.y === 'number') {
        minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
        minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y);
        cnt++;
      }
    });
    if (cnt > 0) {
      // add a small margin so boundary is clearly distinguishable
      const pad = Math.max((maxX - minX), (maxY - minY)) * 0.08 || 1;
      setBounds({
        minX: minX - pad, maxX: maxX + pad,
        minY: minY - pad, maxY: maxY + pad,
        cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
        w: maxX - minX + pad * 2, h: maxY - minY + pad * 2,
      });
    }
  }, [sigma, sigma.getGraph()]);

  // Map world <-> minimap pixels (fit bounds inside canvas with margin)
  const scaleOf = (c: HTMLCanvasElement, b: Bounds) => {
    const pad = 6;
    const cw = c.width, ch = c.height;
    const s = Math.min((cw - pad * 2) / b.w, (ch - pad * 2) / b.h);
    const ox = (cw - b.w * s) / 2;
    const oy = (ch - b.h * s) / 2;
    return { s, ox, oy };
  };
  const worldToMin = (c: HTMLCanvasElement, b: Bounds, x: number, y: number) => {
    const { s, ox, oy } = scaleOf(c, b);
    return { x: ox + (x - b.minX) * s, y: oy + (y - b.minY) * s };
  };

  // Redraw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bounds) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const cw = canvas.width, ch = canvas.height;
      const { s, ox, oy } = scaleOf(canvas, bounds);

      // background
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, cw, ch);

      // occupied region fill (boundary between occupied / unoccupied)
      const bx = ox, by = oy, bw = bounds.w * s, bh = bounds.h * s;
      ctx.fillStyle = '#16213e';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#3d5a8f';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);

      // node cloud (orientation)
      const g = sigma.getGraph();
      ctx.fillStyle = '#5a7bb5';
      g.forEachNode((_, a) => {
        if (typeof a.x !== 'number' || typeof a.y !== 'number') return;
        const p = worldToMin(canvas, bounds, a.x, a.y);
        ctx.fillRect(p.x, p.y, 1.5, 1.5);
      });

      // viewport rectangle (current camera view)
      try {
        const cam = sigma.getCamera();
        const cworld = sigma.getContainer();
        const cw_px = cworld.clientWidth, ch_px = cworld.clientHeight;
        const vw = cw_px * cam.ratio, vh = ch_px * cam.ratio;
        const tl = worldToMin(canvas, bounds, cam.x - vw / 2, cam.y - vh / 2);
        const vpx = tl.x, vpy = tl.y, vpw = vw * s, vph = vh * s;
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(vpx, vpy, vpw, vph);
        ctx.fillStyle = 'rgba(79, 195, 247, 0.12)';
        ctx.fillRect(vpx, vpy, vpw, vph);
      } catch { /* ignore */ }
    };

    draw();
    const cam = sigma.getCamera();
    const onCam = () => draw(); // runs on every camera 'updated' incl. animations
    const onRender = () => draw(); // after graph changes (emphasis/filter/layout)
    cam.on('updated', onCam);
    sigma.on('afterRender', onRender);
    return () => {
      cam.off('updated', onCam);
      sigma.off('afterRender', onRender);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigma, bounds, sigma.getGraph()]);

  // Click / drag -> center the camera on the minimap point (keep current zoom)
  const moveCameraTo = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !bounds) return;
    const rect = canvas.getBoundingClientRect();
    // scale CSS pixels to canvas backing pixels (handles DPR / any CSS-size mismatch)
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const { s, ox, oy } = scaleOf(canvas, bounds);
    const wx = bounds.minX + (mx - ox) / s;
    const wy = bounds.minY + (my - oy) / s;
    const cam = sigma.getCamera();
    if (typeof (cam as any).animatedSetState === 'function') {
      (cam as any).animatedSetState({ x: wx, y: wy }, { duration: 700 });
    } else {
      cam.setState({ x: wx, y: wy });
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        background: '#0a0a14',
        border: '1px solid #2a3f6b',
        borderRadius: 4,
        cursor: 'crosshair',
        display: 'block',
      }}
      onMouseDown={(e) => { draggingRef.current = true; moveCameraTo(e); }}
      onMouseMove={(e) => { if (draggingRef.current) moveCameraTo(e); }}
      onMouseUp={() => { draggingRef.current = false; }}
      onMouseLeave={() => { draggingRef.current = false; }}
    />
  );
}
