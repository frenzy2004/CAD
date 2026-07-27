import type { Point3Mm } from "./schemas";

export type ScreenPoint = {
  x: number;
  y: number;
};

export type ScreenCircle = {
  center: ScreenPoint;
  radius: number;
};

export type ProjectedFeatureAnchor = {
  featureId: string;
  screenPoint: ScreenPoint;
  pointMm: Point3Mm;
  diameterMm: number;
};

type ClientPoint = {
  clientX: number;
  clientY: number;
};

type CanvasOffset = {
  left: number;
  top: number;
};

export function selectNearestProjectedAnchor(
  anchors: readonly ProjectedFeatureAnchor[],
  circle: ScreenCircle,
): ProjectedFeatureAnchor | null {
  if (!Number.isFinite(circle.radius) || circle.radius < 0) return null;

  const radiusSquared = circle.radius ** 2;
  let nearest: ProjectedFeatureAnchor | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const anchor of anchors) {
    const dx = anchor.screenPoint.x - circle.center.x;
    const dy = anchor.screenPoint.y - circle.center.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > radiusSquared) continue;

    if (
      distanceSquared < nearestDistanceSquared ||
      (distanceSquared === nearestDistanceSquared &&
        nearest !== null &&
        anchor.featureId < nearest.featureId)
    ) {
      nearest = anchor;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearest;
}

export function clientPointToCanvasPoint(
  point: ClientPoint,
  bounds: CanvasOffset,
): ScreenPoint {
  return {
    x: point.clientX - bounds.left,
    y: point.clientY - bounds.top,
  };
}

export function circleFromPointerDrag(
  start: ScreenPoint,
  current: ScreenPoint,
  minimumRadiusPx = 8,
): ScreenCircle {
  return {
    center: start,
    radius: Math.max(
      minimumRadiusPx,
      Math.hypot(current.x - start.x, current.y - start.y),
    ),
  };
}
