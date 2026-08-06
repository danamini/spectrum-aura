import { useRef, useState } from "react";
import type * as React from "react";

const POSITIONS_KEY = "analyser-panel-positions-v1";

type Offset = { x: number; y: number };

function loadOffset(id: string): Offset {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, Offset>) : {};
    const stored = map[id];
    if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) return stored;
  } catch {
    return { x: 0, y: 0 };
  }
  return { x: 0, y: 0 };
}

function saveOffset(id: string, offset: Offset) {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, Offset>) : {};
    map[id] = offset;
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(map));
  } catch {
    /* private mode — position just won't persist */
  }
}

/**
 * Makes an overlay panel grab-draggable. Spread `handleProps` onto the
 * panel's outer element and merge `style` into its style. Drags that start
 * on interactive children (buttons, sliders, inputs) are ignored so the
 * panel's controls keep working; double-click resets to the home position.
 * The offset is clamped so a grabbable sliver always stays on screen, and
 * positions persist per panel id.
 */
export function useDraggablePanel(id: string) {
  const [offset, setOffset] = useState<Offset>(() => loadOffset(id));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    base: Offset;
    home: { left: number; top: number; width: number; height: number };
  } | null>(null);

  const reset = () => {
    setOffset({ x: 0, y: 0 });
    saveOffset(id, { x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const target = e.target as Element | null;
    if (
      target?.closest("button, a, input, textarea, select, kbd, [role='slider'], [role='switch']")
    ) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      base: offset,
      home: {
        left: rect.left - offset.x,
        top: rect.top - offset.y,
        width: rect.width,
        height: rect.height,
      },
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // Keep the drag from also grabbing the camera-orbit handler behind us.
    e.stopPropagation();
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const margin = 48;
    const x = Math.max(
      -(drag.home.left + drag.home.width - margin),
      Math.min(window.innerWidth - margin - drag.home.left, drag.base.x + e.clientX - drag.startX),
    );
    const y = Math.max(
      -(drag.home.top + drag.home.height - margin),
      Math.min(window.innerHeight - margin - drag.home.top, drag.base.y + e.clientY - drag.startY),
    );
    setOffset({ x, y });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setOffset((final) => {
      saveOffset(id, final);
      return final;
    });
  };

  return {
    offset,
    dragging,
    reset,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick: reset,
      title: "Drag to move · double-click to reset",
    },
    style: {
      transform: `translate(${offset.x}px, ${offset.y}px)`,
      cursor: dragging ? "grabbing" : "grab",
      touchAction: "none",
    } as React.CSSProperties,
  };
}
