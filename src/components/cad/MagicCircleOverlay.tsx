"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

import {
  circleFromPointerDrag,
  clientPointToCanvasPoint,
  selectNearestProjectedAnchor,
  type ProjectedFeatureAnchor,
  type ScreenCircle,
} from "@/lib/cad/projection";

const MINIMUM_CIRCLE_RADIUS_PX = 8;

type ActiveDrawing = {
  pointerId: number;
  center: {
    x: number;
    y: number;
  };
};

export interface MagicCircleOverlayProps {
  children: ReactNode;
  projectedAnchors: readonly ProjectedFeatureAnchor[];
  statusText: string;
  onDrawingChange(drawing: boolean): void;
  onSelect(anchor: ProjectedFeatureAnchor | null): void;
}

export function MagicCircleOverlay({
  children,
  projectedAnchors,
  statusText,
  onDrawingChange,
  onSelect,
}: MagicCircleOverlayProps) {
  const interactionSurface = useRef<HTMLDivElement>(null);
  const activePointerId = useRef<number | null>(null);
  const [activeDrawing, setActiveDrawing] =
    useState<ActiveDrawing | null>(null);
  const [circle, setCircle] = useState<ScreenCircle | null>(null);

  const releasePointer = useCallback((pointerId: number) => {
    const surface = interactionSurface.current;
    if (surface?.hasPointerCapture(pointerId)) {
      surface.releasePointerCapture(pointerId);
    }
  }, []);

  const cancel = useCallback((releaseCapture = true) => {
    const pointerId = activePointerId.current;
    activePointerId.current = null;
    if (releaseCapture && pointerId !== null) {
      releasePointer(pointerId);
    }
    setActiveDrawing(null);
    setCircle(null);
    onDrawingChange(false);
    onSelect(null);
  }, [onDrawingChange, onSelect, releasePointer]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (
      activePointerId.current !== null ||
      !event.isPrimary ||
      event.button !== 0 ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const center = clientPointToCanvasPoint(
      event,
      event.currentTarget.getBoundingClientRect(),
    );

    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerId.current = event.pointerId;
    setActiveDrawing({ pointerId: event.pointerId, center });
    setCircle(
      circleFromPointerDrag(
        center,
        center,
        MINIMUM_CIRCLE_RADIUS_PX,
      ),
    );
    onDrawingChange(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (
      activePointerId.current !== event.pointerId ||
      activeDrawing?.pointerId !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();
    const current = clientPointToCanvasPoint(
      event,
      event.currentTarget.getBoundingClientRect(),
    );
    setCircle(
      circleFromPointerDrag(
        activeDrawing.center,
        current,
        MINIMUM_CIRCLE_RADIUS_PX,
      ),
    );
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (
      activePointerId.current !== event.pointerId ||
      activeDrawing?.pointerId !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();
    const current = clientPointToCanvasPoint(
      event,
      event.currentTarget.getBoundingClientRect(),
    );
    const completedCircle = circleFromPointerDrag(
      activeDrawing.center,
      current,
      MINIMUM_CIRCLE_RADIUS_PX,
    );

    activePointerId.current = null;
    releasePointer(event.pointerId);
    setCircle(completedCircle);
    setActiveDrawing(null);
    onDrawingChange(false);
    onSelect(
      selectNearestProjectedAnchor(projectedAnchors, completedCircle),
    );
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (activePointerId.current !== event.pointerId) return;
    cancel();
  }

  function handleLostPointerCapture(event: PointerEvent<HTMLDivElement>) {
    if (activePointerId.current !== event.pointerId) return;
    cancel(false);
  }

  return (
    <div
      aria-label="Magic Circle CAD selection. Drag to select a hole; hold Alt while dragging to orbit."
      className="relative h-full w-full touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
      onLostPointerCapture={handleLostPointerCapture}
      onPointerCancel={handlePointerCancel}
      onPointerDownCapture={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={interactionSurface}
      role="region"
      tabIndex={0}
    >
      {children}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {circle !== null ? (
          <circle
            cx={circle.center.x}
            cy={circle.center.y}
            fill="rgba(251, 191, 36, 0.10)"
            r={circle.radius}
            stroke="#fbbf24"
            strokeDasharray="7 5"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      <p
        aria-live="polite"
        className="pointer-events-none absolute bottom-3 left-3 m-0 max-w-[calc(100%_-_1.5rem)] rounded-md border border-white/10 bg-slate-950/85 px-3 py-2 text-sm text-slate-100 shadow-lg backdrop-blur"
        role="status"
      >
        {statusText}
      </p>
    </div>
  );
}
