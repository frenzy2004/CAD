"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";

import { SelectionEnvelopeSchema } from "@/lib/cad/schemas";
import type { SelectionEnvelope } from "@/lib/cad/schemas";
import type { ProjectedFeatureAnchor } from "@/lib/cad/projection";
import type { CadMesh } from "@/lib/cad/worker-protocol";

import { MagicCircleOverlay } from "./MagicCircleOverlay";
import { Scene, type OrbitControlsState } from "./Scene";

const INITIAL_STATUS =
  "Draw a circle around a hole to select it. Hold Alt while dragging to orbit.";

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
  const drawingRef = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const [projectedAnchors, setProjectedAnchors] = useState<
    readonly ProjectedFeatureAnchor[]
  >([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<
    string | null
  >(null);
  const [statusText, setStatusText] = useState(INITIAL_STATUS);

  const handleProjectedAnchorsChange = useCallback(
    (anchors: readonly ProjectedFeatureAnchor[]) => {
      setProjectedAnchors(anchors);
    },
    [],
  );

  const handleDrawingChange = useCallback((isDrawing: boolean) => {
    drawingRef.current = isDrawing;
    if (controls.current !== null) {
      controls.current.enabled = !isDrawing;
    }
    setDrawing(isDrawing);
  }, []);

  const handleOrbitControlsChange = useCallback(
    (nextControls: OrbitControlsState | null) => {
      controls.current = nextControls;
      if (nextControls !== null) {
        nextControls.enabled = !drawingRef.current;
      }
    },
    [],
  );

  const handleSelection = useCallback(
    (anchor: ProjectedFeatureAnchor | null) => {
      if (anchor === null) {
        setSelectedFeatureId(null);
        setStatusText("No editable hole was found inside the circle.");
        onSelectionChange(null);
        return;
      }

      const parsedSelection = SelectionEnvelopeSchema.safeParse({
        units: "mm",
        editableFeatureIds: [anchor.featureId],
        editableFaceIds: [],
        pointMm: anchor.pointMm,
      });

      if (
        !parsedSelection.success ||
        parsedSelection.data.editableFeatureIds.length !== 1
      ) {
        setSelectedFeatureId(null);
        setStatusText(
          `Selected ${anchor.featureId}, but it is not editable by resize_hole.`,
        );
        onSelectionChange(null);
        return;
      }

      setSelectedFeatureId(anchor.featureId);
      setStatusText(
        `Selected ${anchor.featureId}, diameter ${anchor.diameterMm} mm`,
      );
      onSelectionChange(parsedSelection.data);
    },
    [onSelectionChange],
  );

  return (
    <div
      className={clsx(
        "relative min-h-[28rem] w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950",
        className,
      )}
    >
      <MagicCircleOverlay
        onDrawingChange={handleDrawingChange}
        onSelect={handleSelection}
        projectedAnchors={projectedAnchors}
        statusText={statusText}
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
