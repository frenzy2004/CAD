import { describe, expect, it } from "vitest";

import {
  circleFromPointerDrag,
  clientPointToCanvasPoint,
  selectNearestProjectedAnchor,
  type ProjectedFeatureAnchor,
} from "@/lib/cad/projection";

const anchors: ProjectedFeatureAnchor[] = [
  {
    featureId: "hole:nw",
    screenPoint: { x: 30, y: 42 },
    pointMm: { x: 12, y: 52, z: 8 },
    diameterMm: 6,
  },
  {
    featureId: "hole:ne",
    screenPoint: { x: 54, y: 42 },
    pointMm: { x: 88, y: 52, z: 8 },
    diameterMm: 6,
  },
];

describe("Magic Circle projection", () => {
  it("chooses the nearest projected feature anchor inside the circle", () => {
    expect(
      selectNearestProjectedAnchor(anchors, {
        center: { x: 47, y: 42 },
        radius: 20,
      }),
    ).toEqual(anchors[1]);
  });

  it("rejects projected feature anchors outside the circle", () => {
    expect(
      selectNearestProjectedAnchor(anchors, {
        center: { x: 80, y: 80 },
        radius: 10,
      }),
    ).toBeNull();
  });

  it("resolves equidistant anchors deterministically by feature ID", () => {
    const tied = [
      {
        ...anchors[0],
        featureId: "hole:z",
        screenPoint: { x: 40, y: 50 },
      },
      {
        ...anchors[1],
        featureId: "hole:a",
        screenPoint: { x: 60, y: 50 },
      },
    ];

    expect(
      selectNearestProjectedAnchor(tied, {
        center: { x: 50, y: 50 },
        radius: 20,
      })?.featureId,
    ).toBe("hole:a");
  });

  it("converts client pointer coordinates through the canvas bounds", () => {
    expect(
      clientPointToCanvasPoint(
        { clientX: 175, clientY: 96 },
        { left: 125, top: 36 },
      ),
    ).toEqual({ x: 50, y: 60 });
  });

  it("treats pointer movement below eight pixels as a click-sized circle", () => {
    expect(
      circleFromPointerDrag(
        { x: 20, y: 20 },
        { x: 23, y: 24 },
      ),
    ).toEqual({
      center: { x: 20, y: 20 },
      radius: 8,
    });
  });

  it("keeps the measured radius for a larger drag", () => {
    expect(
      circleFromPointerDrag(
        { x: 20, y: 20 },
        { x: 32, y: 25 },
      ),
    ).toEqual({
      center: { x: 20, y: 20 },
      radius: 13,
    });
  });
});
