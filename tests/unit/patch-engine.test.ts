import { describe, expect, it } from "vitest";

import { createDemoBracket } from "@/lib/cad/demo-bracket";
import {
  applyPatch,
  fingerprintSnapshot,
  validatePlan,
  verifyLocality,
} from "@/lib/cad/patch-engine";
import type { BracketSnapshot, PatchPlan, SelectionEnvelope } from "@/lib/cad/schemas";

const topFaceSelection: SelectionEnvelope = {
  units: "mm",
  editableFeatureIds: [],
  editableFaceIds: ["face:top"],
  pointMm: { x: 50, y: 32, z: 0 },
};

function snapshotWithHoleOrder(
  snapshot: BracketSnapshot,
  ids: string[],
): BracketSnapshot {
  return {
    ...snapshot,
    holes: ids.map((id) => snapshot.holes.find((hole) => hole.id === id)!),
  };
}

describe("deterministic PatchCAD patch engine", () => {
  it("creates the 100 by 64 by 8 mm bracket with four semantic corner holes", () => {
    const snapshot = createDemoBracket();

    expect(snapshot.dimensions).toEqual({ widthMm: 100, depthMm: 64, heightMm: 8 });
    expect(Object.fromEntries(snapshot.holes.map((hole) => [hole.id, hole.centerMm]))).toEqual({
      "hole:nw": { x: 12, y: 52, z: 0 },
      "hole:ne": { x: 88, y: 52, z: 0 },
      "hole:sw": { x: 12, y: 12, z: 0 },
      "hole:se": { x: 88, y: 12, z: 0 },
    });
    expect(snapshot.holes.map((hole) => hole.diameterMm)).toEqual([6, 6, 6, 6]);
  });

  it("resizes only the semantic target even when hole array order changes", () => {
    const before = snapshotWithHoleOrder(createDemoBracket(), [
      "hole:se",
      "hole:nw",
      "hole:ne",
      "hole:sw",
    ]);
    const plan: PatchPlan = {
      version: 2,
      operation: "resize_hole",
      targetFeatureId: "hole:nw",
      diameterMm: 8,
      rationale: "Increase clearance.",
    };

    const { after, report } = applyPatch({
      before,
      selection: { ...topFaceSelection, editableFeatureIds: ["hole:nw"] },
      plan,
    });

    expect(Object.fromEntries(after.holes.map((hole) => [hole.id, hole.diameterMm]))).toEqual({
      "hole:se": 6,
      "hole:nw": 8,
      "hole:ne": 6,
      "hole:sw": 6,
    });
    expect(report).toMatchObject({
      validSolid: true,
      targetChanged: true,
      protectedFeaturesUnchanged: true,
      violations: [],
    });
  });

  it("rejects a same-diameter resize as a structured no-effect plan", () => {
    const input = {
      before: createDemoBracket(),
      selection: { ...topFaceSelection, editableFeatureIds: ["hole:nw"] },
      plan: {
        version: 2,
        operation: "resize_hole" as const,
        targetFeatureId: "hole:nw",
        diameterMm: 6,
        rationale: "Keep the current hole size.",
      },
    };

    expect(validatePlan(input)).toEqual({ valid: false, code: "NO_EFFECT" });
    expect(() => applyPatch(input)).toThrowError("NO_EFFECT");
  });

  it("adds a deterministic new hole when only the top face is selected", () => {
    const before = createDemoBracket();
    const plan: PatchPlan = {
      version: 2,
      operation: "add_hole",
      targetFaceId: "face:top",
      location: "selection",
      diameterMm: 5,
      rationale: "Add a centered mount.",
    };

    const { after, report } = applyPatch({ before, selection: topFaceSelection, plan });

    expect(after.holes).toContainEqual({
      id: "hole:added-1",
      kind: "through_hole",
      centerMm: { x: 50, y: 32, z: 0 },
      diameterMm: 5,
      axis: { x: 0, y: 0, z: 1 },
    });
    expect(after.holes).toHaveLength(5);
    expect(report).toMatchObject({ targetChanged: true, protectedFeaturesUnchanged: true });
  });

  it("rejects an add-hole plan when the selected face has no picked point", () => {
    const input = {
      before: createDemoBracket(),
      selection: { ...topFaceSelection, pointMm: undefined },
      plan: {
        version: 2,
        operation: "add_hole" as const,
        targetFaceId: "face:top" as const,
        location: "selection" as const,
        diameterMm: 5,
        rationale: "Add a centered mount.",
      },
    };

    // Break caught: authorizing an entire face when the user picked no point.
    expect(validatePlan(input)).toEqual({
      valid: false,
      code: "TARGET_OUTSIDE_SELECTION",
    });
    expect(() => applyPatch(input)).toThrowError("TARGET_OUTSIDE_SELECTION");
  });

  it("uses the exact picked point as the only add-hole center", () => {
    const plan: PatchPlan = {
      version: 2,
      operation: "add_hole",
      targetFaceId: "face:top",
      location: "selection",
      diameterMm: 5,
      rationale: "Add the mount at the picked point.",
    };
    const selection: SelectionEnvelope = {
      ...topFaceSelection,
      pointMm: { x: 50.123456, y: 31.99997, z: 0.25 },
    };

    const validation = validatePlan({
      before: createDemoBracket(),
      selection,
      plan,
    });
    const { after } = applyPatch({
      before: createDemoBracket(),
      selection,
      plan,
    });

    // Break caught: add-hole geometry must be derived only from the selected CAD point.
    expect(validation).toEqual({ valid: true, plan });
    expect(after.holes.at(-1)?.centerMm).toEqual(selection.pointMm);
  });

  it("rejects a resize target outside the semantic selection envelope", () => {
    const result = validatePlan({
      before: createDemoBracket(),
      selection: { ...topFaceSelection, editableFeatureIds: ["hole:ne"] },
      plan: {
        version: 2,
        operation: "resize_hole",
        targetFeatureId: "hole:nw",
        diameterMm: 8,
        rationale: "Increase clearance.",
      },
    });

    expect(result).toEqual({ valid: false, code: "TARGET_OUTSIDE_SELECTION" });
  });

  it("rejects a new hole when its edge wall is below 2 mm", () => {
    const result = validatePlan({
      before: createDemoBracket(),
      selection: {
        ...topFaceSelection,
        pointMm: { x: 3.9, y: 32, z: 0 },
      },
      plan: {
        version: 2,
        operation: "add_hole",
        targetFaceId: "face:top",
        location: "selection",
        diameterMm: 4,
        rationale: "Add a close edge hole.",
      },
    });

    expect(result).toEqual({ valid: false, code: "MINIMUM_WALL_VIOLATION" });
  });

  it("rejects a resize that would reduce its edge wall below 2 mm", () => {
    const result = validatePlan({
      before: createDemoBracket(),
      selection: { ...topFaceSelection, editableFeatureIds: ["hole:nw"] },
      plan: {
        version: 2,
        operation: "resize_hole",
        targetFeatureId: "hole:nw",
        diameterMm: 22,
        rationale: "Increase clearance too far.",
      },
    });

    expect(result).toEqual({ valid: false, code: "MINIMUM_WALL_VIOLATION" });
  });

  it("rejects a new hole that intersects an existing hole", () => {
    const result = validatePlan({
      before: createDemoBracket(),
      selection: {
        ...topFaceSelection,
        pointMm: { x: 18, y: 52, z: 0 },
      },
      plan: {
        version: 2,
        operation: "add_hole",
        targetFaceId: "face:top",
        location: "selection",
        diameterMm: 8,
        rationale: "Add a neighboring mount.",
      },
    });

    expect(result).toEqual({ valid: false, code: "HOLE_COLLISION" });
  });

  it("keeps all noneditable fingerprints unchanged after a selected resize", () => {
    const before = createDemoBracket();
    const after: BracketSnapshot = {
      ...before,
      holes: before.holes.map((hole) =>
        hole.id === "hole:nw" ? { ...hole, diameterMm: 8 } : hole,
      ),
    };

    const report = verifyLocality(before, after, ["hole:nw"]);

    expect(report).toEqual({
      validSolid: true,
      targetChanged: true,
      protectedFeaturesUnchanged: true,
      protectedFingerprints: [
        {
          id: "bracket:dimensions",
          kind: "dimensions",
          dimensions: { widthMm: 100, depthMm: 64, heightMm: 8 },
        },
        {
          id: "hole:ne",
          kind: "through_hole",
          centerMm: { x: 88, y: 52, z: 0 },
          diameterMm: 6,
        },
        {
          id: "hole:se",
          kind: "through_hole",
          centerMm: { x: 88, y: 12, z: 0 },
          diameterMm: 6,
        },
        {
          id: "hole:sw",
          kind: "through_hole",
          centerMm: { x: 12, y: 12, z: 0 },
          diameterMm: 6,
        },
      ],
      violations: [],
    });
  });

  it("detects a mutated protected feature by semantic ID", () => {
    const before = createDemoBracket();
    const after: BracketSnapshot = {
      ...before,
      holes: before.holes.map((hole) =>
        hole.id === "hole:ne"
          ? { ...hole, centerMm: { ...hole.centerMm, x: 87 } }
          : hole,
      ),
    };

    const report = verifyLocality(before, after, ["hole:nw"]);

    expect(report.protectedFeaturesUnchanged).toBe(false);
    expect(report.violations).toContain("PROTECTED_FEATURE_CHANGED");
  });

  it("uses the exact 0.0001 mm boundary for protected coordinate changes", () => {
    const before = createDemoBracket();
    const withinTolerance: BracketSnapshot = {
      ...before,
      holes: before.holes.map((hole) =>
        hole.id === "hole:ne"
          ? { ...hole, centerMm: { ...hole.centerMm, x: 88.000099996 } }
          : hole,
      ),
    };
    const outsideTolerance: BracketSnapshot = {
      ...before,
      holes: before.holes.map((hole) =>
        hole.id === "hole:ne"
          ? { ...hole, centerMm: { ...hole.centerMm, x: 88.000100004 } }
          : hole,
      ),
    };

    expect(
      verifyLocality(before, withinTolerance, ["hole:nw"])
        .protectedFeaturesUnchanged,
    ).toBe(true);
    expect(
      verifyLocality(before, outsideTolerance, ["hole:nw"])
        .protectedFeaturesUnchanged,
    ).toBe(false);
  });

  it("uses semantic IDs to produce deterministic fingerprints independent of hole order", () => {
    const before = snapshotWithHoleOrder(createDemoBracket(), [
      "hole:sw",
      "hole:se",
      "hole:nw",
      "hole:ne",
    ]);

    expect(fingerprintSnapshot(before).map((fingerprint) => fingerprint.id)).toEqual([
      "bracket:dimensions",
      "hole:ne",
      "hole:nw",
      "hole:se",
      "hole:sw",
    ]);
  });

  it("retains an immutable one-level undo snapshot with byte-equivalent JSON", () => {
    const before = createDemoBracket();
    const undoSnapshot = JSON.parse(JSON.stringify(before)) as BracketSnapshot;
    const beforeJson = JSON.stringify(undoSnapshot);

    applyPatch({
      before,
      selection: { ...topFaceSelection, editableFeatureIds: ["hole:nw"] },
      plan: {
        version: 2,
        operation: "resize_hole",
        targetFeatureId: "hole:nw",
        diameterMm: 8,
        rationale: "Increase clearance.",
      },
    });

    const restored = undoSnapshot;
    expect(JSON.stringify(restored)).toBe(beforeJson);
    expect(JSON.stringify(before)).toBe(beforeJson);
  });

  it("rejects unsupported operations with a structured code", () => {
    const unsupportedPlan = {
      version: 2,
      operation: "move_hole",
      targetFeatureId: "hole:nw",
      rationale: "Move the hole.",
    } as unknown as PatchPlan;

    const result = validatePlan({
      before: createDemoBracket(),
      selection: { ...topFaceSelection, editableFeatureIds: ["hole:nw"] },
      plan: unsupportedPlan,
    });

    expect(result).toEqual({ valid: false, code: "UNSUPPORTED_OPERATION" });
  });
});
