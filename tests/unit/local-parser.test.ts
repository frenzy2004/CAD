import { describe, expect, it } from "vitest";

import { parseLocalPatch } from "@/lib/cad/local-parser";
import type { SelectionEnvelope } from "@/lib/cad/schemas";

const selectedHole: SelectionEnvelope = {
  units: "mm",
  editableFeatureIds: ["hole:nw"],
  editableFaceIds: ["face:top"],
  pointMm: { x: 12, y: 52, z: 0 },
};

const selectedTopFace: SelectionEnvelope = {
  units: "mm",
  editableFeatureIds: [],
  editableFaceIds: ["face:top"],
  pointMm: { x: 50, y: 32, z: 0 },
};

describe("honest offline PatchCAD command parser", () => {
  it.each([
    {
      name: "resizes the one selected hole from a make-this command",
      prompt: "make this hole 8 mm",
      selection: selectedHole,
      expectedPlan: {
        version: 1,
        operation: "resize_hole",
        targetFeatureId: "hole:nw",
        diameterMm: 8,
      },
    },
    {
      name: "converts an inch fraction before resizing the selected hole",
      prompt: "resize selected hole to 1/4 inch",
      selection: selectedHole,
      expectedPlan: {
        version: 1,
        operation: "resize_hole",
        targetFeatureId: "hole:nw",
        diameterMm: 6.35,
      },
    },
    {
      name: "adds a hole at the selected top-face point",
      prompt: "add a 5 mm hole here",
      selection: selectedTopFace,
      expectedPlan: {
        version: 1,
        operation: "add_hole",
        targetFaceId: "face:top",
        centerMm: { x: 50, y: 32 },
        diameterMm: 5,
      },
    },
    {
      name: "normalizes harmless capitalization and whitespace",
      prompt: "  MAKE   THIS HOLE   8 MM  ",
      selection: selectedHole,
      expectedPlan: {
        version: 1,
        operation: "resize_hole",
        targetFeatureId: "hole:nw",
        diameterMm: 8,
      },
    },
  ])("$name", ({ prompt, selection, expectedPlan }) => {
    // Break caught: removing the corresponding offline grammar branch must fail this test.
    expect(parseLocalPatch(prompt, selection)).toMatchObject({
      source: "local-parser",
      plan: expectedPlan,
    });
  });

  it.each([
    {
      name: "a recognized resize without a dimension",
      prompt: "make this hole larger",
      selection: selectedHole,
      code: "MISSING_DIMENSION",
    },
    {
      name: "a resize command ending before its dimension",
      prompt: "resize selected hole",
      selection: selectedHole,
      code: "MISSING_DIMENSION",
    },
    {
      name: "an add command ending before its dimension",
      prompt: "add a hole here",
      selection: selectedTopFace,
      code: "MISSING_DIMENSION",
    },
    {
      name: "a non-positive resize dimension",
      prompt: "resize selected hole to 0 mm",
      selection: selectedHole,
      code: "INVALID_DIMENSION",
    },
    {
      name: "multiple operations in one instruction",
      prompt: "resize selected hole to 8 mm and add a 5 mm hole here",
      selection: selectedHole,
      code: "AMBIGUOUS_OPERATION",
    },
    {
      name: "an unsupported operation",
      prompt: "move this hole 8 mm",
      selection: selectedHole,
      code: "UNSUPPORTED_OPERATION",
    },
    {
      name: "a resize with multiple selected holes",
      prompt: "make this hole 8 mm",
      selection: {
        ...selectedHole,
        editableFeatureIds: ["hole:nw", "hole:ne"],
      } satisfies SelectionEnvelope,
      code: "AMBIGUOUS_SELECTION",
    },
    {
      name: "an add command without a selected point",
      prompt: "add a 5 mm hole here",
      selection: { ...selectedTopFace, pointMm: undefined },
      code: "MISSING_TARGET",
    },
  ])("rejects $name", ({ prompt, selection, code }) => {
    // Break caught: accepting an incomplete or ambiguous command would create an unsafe patch.
    expect(parseLocalPatch(prompt, selection)).toEqual({
      source: "local-parser",
      error: { code },
    });
  });

  it("does not misreport an overlong rationale as an invalid dimension", () => {
    // Break caught: mapping every schema issue to INVALID_DIMENSION hides non-dimension failures.
    const prompt = `make${" ".repeat(501)}this hole 8 mm`;

    expect(parseLocalPatch(prompt, selectedHole)).toEqual({
      source: "local-parser",
      error: { code: "UNSUPPORTED_OPERATION" },
    });
  });
});
