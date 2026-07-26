"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";

import { SelectionEnvelopeSchema } from "@/lib/cad/schemas";
import type { SelectionEnvelope } from "@/lib/cad/schemas";
import type { ProjectedFeatureAnchor } from "@/lib/cad/projection";
import type { CadMesh } from "@/lib/cad/worker-protocol";

import { MagicCircleOverlay } from "./MagicCircleOverlay";
import { Scene, type OrbitControlsState } from "./Scene";

const INITIAL_STATUS =
  "Draw a circle around a hole to select it. Hold Alt while dragging to orbit.";
const NO_PROJECTED_ANCHORS: readonly ProjectedFeatureAnchor[] = [];

type ProjectionState = {
  meshRevision: number;
  anchors: readonly ProjectedFeatureAnchor[];
};

type SelectionState = {
  meshRevision: number;
  featureId: string;
};

type DrawingState = {
  meshRevision: number;
  drawing: boolean;
};

type MeshRevisionState = {
  mesh: CadMesh;
  revision: number;
};

function pointsMatch(
  left: ProjectedFeatureAnchor["pointMm"],
  right: ProjectedFeatureAnchor["pointMm"],
) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.z === right.z
  );
}

export interface CadViewportProps {
  mesh: CadMesh;
  className?: string;
  onSelectionChange(selection: SelectionEnvelope | null): void;
}

export function CadViewport({
  mesh,
  className,
  onSelectionChange,
}: CadViewportProps) {
  const controls = useRef<OrbitControlsState | null>(null);
  const [meshRevisionState, setMeshRevisionState] =
    useState<MeshRevisionState>({
      mesh,
      revision: 0,
    });
  if (meshRevisionState.mesh !== mesh) {
    setMeshRevisionState({
      mesh,
      revision: meshRevisionState.revision + 1,
    });
  }
  const meshRevision =
    meshRevisionState.mesh === mesh
      ? meshRevisionState.revision
      : meshRevisionState.revision + 1;
  const [drawingState, setDrawingState] = useState<DrawingState>({
    meshRevision,
    drawing: false,
  });
  const [projectionState, setProjectionState] =
    useState<ProjectionState | null>(null);
  const [selectionState, setSelectionState] =
    useState<SelectionState | null>(null);
  const [statusText, setStatusText] = useState(INITIAL_STATUS);
  const selectionIsStale =
    selectionState !== null &&
    selectionState.meshRevision !== meshRevision;
  const drawing =
    drawingState.meshRevision === meshRevision &&
    drawingState.drawing;
  const projectedAnchors =
    projectionState?.meshRevision === meshRevision
      ? projectionState.anchors
      : NO_PROJECTED_ANCHORS;
  const selectedFeatureId =
    !selectionIsStale &&
    selectionState !== null &&
    mesh.holeAnchors.some(
      (anchor) => anchor.featureId === selectionState.featureId,
    )
      ? selectionState.featureId
      : null;

  const handleProjectedAnchorsChange = useCallback(
    (anchors: readonly ProjectedFeatureAnchor[]) => {
      setProjectionState({ meshRevision, anchors });
    },
    [meshRevision],
  );

  const handleDrawingChange = useCallback(
    (isDrawing: boolean) => {
      if (controls.current !== null) {
        controls.current.enabled = !isDrawing;
      }
      setDrawingState({
        meshRevision,
        drawing: isDrawing,
      });
    },
    [meshRevision],
  );

  const handleOrbitControlsChange = useCallback(
    (nextControls: OrbitControlsState | null) => {
      controls.current = nextControls;
      if (nextControls !== null) {
        nextControls.enabled = !drawing;
      }
    },
    [drawing],
  );

  const handleSelection = useCallback(
    (anchor: ProjectedFeatureAnchor | null) => {
      if (anchor === null) {
        setSelectionState(null);
        setStatusText("No editable hole was found inside the circle.");
        onSelectionChange(null);
        return;
      }

      const currentAnchor = mesh.holeAnchors.find(
        (candidate) =>
          candidate.featureId === anchor.featureId &&
          candidate.diameterMm === anchor.diameterMm &&
          pointsMatch(candidate.pointMm, anchor.pointMm),
      );
      if (currentAnchor === undefined) {
        setSelectionState(null);
        setStatusText(
          "The model changed before selection completed. Draw a new circle.",
        );
        onSelectionChange(null);
        return;
      }

      const parsedSelection = SelectionEnvelopeSchema.safeParse({
        units: "mm",
        editableFeatureIds: [currentAnchor.featureId],
        editableFaceIds: [],
        pointMm: currentAnchor.pointMm,
      });

      if (
        !parsedSelection.success ||
        parsedSelection.data.editableFeatureIds.length !== 1
      ) {
        setSelectionState(null);
        setStatusText(
          `Selected ${currentAnchor.featureId}, but it is not editable by resize_hole.`,
        );
        onSelectionChange(null);
        return;
      }

      setSelectionState({
        meshRevision,
        featureId: currentAnchor.featureId,
      });
      setStatusText(
        `Selected ${currentAnchor.featureId}, diameter ${currentAnchor.diameterMm} mm`,
      );
      onSelectionChange(parsedSelection.data);
    },
    [mesh, meshRevision, onSelectionChange],
  );

  useEffect(() => {
    if (selectionIsStale) onSelectionChange(null);
  }, [
    meshRevision,
    onSelectionChange,
    selectionIsStale,
  ]);

  return (
    <div
      className={clsx(
        "relative h-[28rem] w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950",
        className,
      )}
    >
      <MagicCircleOverlay
        key={meshRevision}
        onDrawingChange={handleDrawingChange}
        onSelect={handleSelection}
        projectedAnchors={projectedAnchors}
        statusText={
          selectionIsStale
            ? "The model changed. Draw a new circle to select an editable hole."
            : statusText
        }
      >
        <Scene
          drawing={drawing}
          mesh={mesh}
          onOrbitControlsChange={handleOrbitControlsChange}
          onProjectedAnchorsChange={handleProjectedAnchorsChange}
          selectedFeatureId={selectedFeatureId}
        />
      </MagicCircleOverlay>
    </div>
  );
}
