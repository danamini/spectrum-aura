import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";

export type PanelRect = { x: number; y: number; width: number; height: number };
export const STATS_LAYOUT_KEY = "analyser-stats-layout-v1";
const GAP = 12;
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
const defaultRect = (): PanelRect => ({
  x: window.innerWidth - 532,
  y: 64,
  width: 520,
  height: 600,
});

export function fitPanel(rect: PanelRect, width: number, height: number): PanelRect {
  const maxWidth = Math.max(1, width - GAP * 2);
  const maxHeight = Math.max(1, height - GAP * 2);
  const w = Math.min(maxWidth, Math.max(Math.min(300, maxWidth), rect.width));
  const h = Math.min(maxHeight, Math.max(Math.min(240, maxHeight), rect.height));
  return {
    x: Math.max(GAP, Math.min(width - GAP - w, rect.x)),
    y: Math.max(GAP, Math.min(height - GAP - h, rect.y)),
    width: w,
    height: h,
  };
}

function loadRect(): PanelRect {
  try {
    const stored = JSON.parse(localStorage.getItem(STATS_LAYOUT_KEY) ?? "null") as PanelRect | null;
    if (stored && [stored.x, stored.y, stored.width, stored.height].every(Number.isFinite)) {
      return fitPanel(stored, window.innerWidth, window.innerHeight);
    }
  } catch {
    /* Fall back when storage is unavailable or malformed. */
  }
  return fitPanel(defaultRect(), window.innerWidth, window.innerHeight);
}

type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export function resizePanel(
  rect: PanelRect,
  edge: Edge,
  dx: number,
  dy: number,
  width: number,
  height: number,
): PanelRect {
  let { x, y, width: w, height: h } = rect;
  const minWidth = Math.min(300, width - GAP * 2);
  const minHeight = Math.min(240, height - GAP * 2);
  if (edge.includes("e")) w = Math.max(minWidth, Math.min(width - GAP - x, w + dx));
  if (edge.includes("s")) h = Math.max(minHeight, Math.min(height - GAP - y, h + dy));
  if (edge.includes("w")) {
    const right = x + w;
    x = Math.max(GAP, Math.min(right - minWidth, x + dx));
    w = right - x;
  }
  if (edge.includes("n")) {
    const bottom = y + h;
    y = Math.max(GAP, Math.min(bottom - minHeight, y + dy));
    h = bottom - y;
  }
  return fitPanel({ x, y, width: w, height: h }, width, height);
}

export function useStatsPanelLayout(fullscreen: boolean) {
  const [rect, setRect] = useState(loadRect);
  const [interaction, setInteraction] = useState<"move" | Edge | null>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    rect: PanelRect;
    edge: "move" | Edge;
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STATS_LAYOUT_KEY, JSON.stringify(rect));
    } catch {
      /* Session-only layout. */
    }
  }, [rect]);
  useEffect(() => {
    const onResize = () => {
      gesture.current = null;
      setInteraction(null);
      setRect((r) => fitPanel(r, window.innerWidth, window.innerHeight));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    gesture.current = null;
    setInteraction(null);
  }, [fullscreen]);

  const start = (edge: "move" | Edge) => (event: PointerEvent<HTMLElement>) => {
    if (fullscreen || event.button !== 0) return;
    if (edge === "move" && (event.target as Element).closest("button")) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, rect, edge };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setInteraction(edge);
    event.preventDefault();
    event.stopPropagation();
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || event.pointerId !== g.id || fullscreen) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    const v = viewport();
    setRect(
      g.edge === "move"
        ? fitPanel({ ...g.rect, x: g.rect.x + dx, y: g.rect.y + dy }, v.width, v.height)
        : resizePanel(g.rect, g.edge, dx, dy, v.width, v.height),
    );
    event.stopPropagation();
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    if (gesture.current?.id !== event.pointerId) return;
    gesture.current = null;
    setInteraction(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    event.stopPropagation();
  };
  const handle = (edge: "move" | Edge) => ({
    onPointerDown: start(edge),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  });
  const reset = () => setRect(fitPanel(defaultRect(), window.innerWidth, window.innerHeight));
  const onResizeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const delta = event.shiftKey ? 40 : 10;
    const dx = event.key === "ArrowRight" ? delta : event.key === "ArrowLeft" ? -delta : 0;
    const dy = event.key === "ArrowDown" ? delta : event.key === "ArrowUp" ? -delta : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    event.stopPropagation();
    setRect((r) => resizePanel(r, "se", dx, dy, window.innerWidth, window.innerHeight));
  };
  return { rect, interaction, handle, reset, onResizeKeyDown };
}
