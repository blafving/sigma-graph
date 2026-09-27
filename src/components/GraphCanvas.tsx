/**
 * Canvas layer: the only place that may touch sigma.
 *
 * It writes refs and lets the shell's reducers repaint. It never mutates the graph for styling,
 * and it never writes graph coordinates into the camera (see `lib/camera.ts` for why that is a
 * black canvas).
 */
import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import {
  ControlsContainer,
  ZoomControl,
  useRegisterEvents,
  useSigma,
} from '@react-sigma/core';
import { API_BASE } from '../lib/api-client';
import { fitView, focusNode } from '../lib/camera';
import { useGraphUi } from '../GraphUiContext';

/** Camera ratio when flying to a node: the node plus enough context to place it. */
const FOCUS_RATIO = 0.12;

/** The emphasised node and its neighbours; `null` means nothing is emphasised. */
export interface FocusRef {
  current: { id: string; neighbours: Set<string> } | null;
}

interface CanvasLayerProps {
  revision: number;
  hoveredRef: MutableRefObject<string | null>;
  focusRef: FocusRef;
  onOpen: (uid: string) => void;
  onClose: () => void;
}

export function CanvasLayer({ revision, hoveredRef, focusRef, onOpen, onClose }: CanvasLayerProps) {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();
  const { selectedNode, setZoomLevel } = useGraphUi();

  // Handle for the Playwright acceptance gate (SPEC.md "acceptance"): it asserts graph size,
  // position coverage and camera state, none of which are observable from the DOM.
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__kg = { sigma, api: API_BASE, rebuild: 'v2' };
  }, [sigma]);

  useEffect(() => {
    registerEvents({
      enterNode: ({ node }: { node: string }) => {
        hoveredRef.current = node;
        sigma.refresh();
      },
      leaveNode: () => {
        hoveredRef.current = null;
        sigma.refresh();
      },
      clickNode: ({ node }: { node: string }) => onOpen(node),
      clickStage: onClose,
    });
  }, [registerEvents, sigma, hoveredRef, focusRef, onOpen, onClose]);

  // Selection comes from the shell, so list clicks and canvas clicks converge here.
  useEffect(() => {
    if (!selectedNode) {
      focusRef.current = null;
      sigma.refresh();
      return;
    }
    const neighbours = new Set<string>();
    for (const r of selectedNode.relationships) {
      neighbours.add(r.source === selectedNode.id ? r.target : r.source);
    }
    focusRef.current = { id: selectedNode.id, neighbours };
    focusNode(sigma, selectedNode.id, { ratio: FOCUS_RATIO });
    sigma.refresh();
  }, [sigma, selectedNode, focusRef]);

  // A new dataset needs re-indexing; the very first one also frames the whole map.
  useEffect(() => {
    if (!revision) return;
    sigma.refresh();
    if (revision === 1) fitView(sigma, 0);
  }, [sigma, revision]);

  useEffect(() => {
    const camera = sigma.getCamera();
    const onUpdated = () => {
      // Rounded, and only on change: an unthrottled setState here is the PAR-62 render storm.
      setZoomLevel(Math.round((1 / camera.getState().ratio) * 100) / 100);
    };
    camera.on('updated', onUpdated);
    return () => {
      camera.off('updated', onUpdated);
    };
  }, [sigma, setZoomLevel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === '0') fitView(sigma);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sigma, onClose]);

  return (
    <ControlsContainer position="bottom-right">
      <ZoomControl />
    </ControlsContainer>
  );
}
