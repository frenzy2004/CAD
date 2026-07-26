import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ProjectedFeatureAnchor } from "@/lib/cad/projection";
import type { CadMesh } from "@/lib/cad/worker-protocol";

interface MockSceneProps {
  drawing: boolean;
  mesh: CadMesh;
  selectedFeatureId: string | null;
  onProjectedAnchorsChange(
    anchors: readonly ProjectedFeatureAnchor[],
  ): void;
}

interface MockOverlayProps {
  children: ReactNode;
  projectedAnchors: readonly ProjectedFeatureAnchor[];
  statusText: string;
  onDrawingChange(drawing: boolean): void;
  onSelect(anchor: ProjectedFeatureAnchor | null): void;
}

vi.mock("@/components/cad/Scene", () => ({
  Scene({
    drawing,
    mesh,
    selectedFeatureId,
    onProjectedAnchorsChange,
  }: MockSceneProps) {
    const projected = mesh.holeAnchors.map((anchor) => ({
      ...anchor,
      screenPoint: { x: 50, y: 50 },
    }));

    return (
      <div>
        <button
          onClick={() => {
            onProjectedAnchorsChange(projected);
          }}
          type="button"
        >
          Publish projected anchors
        </button>
        <output data-testid="selected-feature">
          {selectedFeatureId ?? ""}
        </output>
        <output data-testid="drawing-state">{String(drawing)}</output>
      </div>
    );
  },
}));

vi.mock("@/components/cad/MagicCircleOverlay", () => ({
  MagicCircleOverlay({
    children,
    projectedAnchors,
    statusText,
    onDrawingChange,
    onSelect,
  }: MockOverlayProps) {
    const [circleVisible, setCircleVisible] = useState(false);

    return (
      <div>
        {children}
        <button
          onClick={() => {
            setCircleVisible(true);
            onDrawingChange(true);
          }}
          type="button"
        >
          Begin circle
        </button>
        <button
          disabled={projectedAnchors.length === 0}
          onClick={() => {
            onSelect(projectedAnchors[0] ?? null);
          }}
          type="button"
        >
          Select first projected anchor
        </button>
        <output data-testid="circle-state">
          {circleVisible ? "visible" : ""}
        </output>
        <output data-testid="selection-status">{statusText}</output>
      </div>
    );
  },
}));

import { CadViewport } from "@/components/cad/CadViewport";

function createMesh(
  source: CadMesh["source"],
  holeAnchors: CadMesh["holeAnchors"],
): CadMesh {
  return {
    source,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    bounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 1 },
    },
    faceGroups: [{ start: 0, count: 3, faceId: 1 }],
    holeAnchors,
  };
}

const bracketMesh = createMesh("bracket", [
  {
    featureId: "hole:nw",
    pointMm: { x: 0.25, y: 0.75, z: 1 },
    diameterMm: 6,
  },
]);
const replacementMesh = createMesh("imported-step", []);

describe("CadViewport mesh lifecycle", () => {
  it("invalidates projected anchors and selection when the mesh changes", async () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <CadViewport
        mesh={bracketMesh}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Publish projected anchors" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Select first projected anchor",
      }),
    );

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      units: "mm",
      editableFeatureIds: ["hole:nw"],
      editableFaceIds: [],
      pointMm: { x: 0.25, y: 0.75, z: 1 },
    });
    expect(screen.getByTestId("selected-feature")).toHaveTextContent(
      "hole:nw",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Begin circle" }),
    );
    expect(screen.getByTestId("drawing-state")).toHaveTextContent(
      "true",
    );
    expect(screen.getByTestId("circle-state")).toHaveTextContent(
      "visible",
    );

    rerender(
      <CadViewport
        mesh={replacementMesh}
        onSelectionChange={onSelectionChange}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Select first projected anchor",
      }),
    ).toBeDisabled();
    expect(screen.getByTestId("selected-feature")).toBeEmptyDOMElement();
    expect(screen.getByTestId("drawing-state")).toHaveTextContent(
      "false",
    );
    expect(screen.getByTestId("circle-state")).toBeEmptyDOMElement();
    await waitFor(() => {
      expect(onSelectionChange).toHaveBeenLastCalledWith(null);
    });
  });
});
