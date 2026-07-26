import { describe, expect, it } from "vitest";
import bracketContext from "../fixtures/bracket-context.json";
import {
  BracketSnapshotSchema,
  PatchPlanSchema,
  PlanRequestSchema,
  ResearchResponseSchema,
} from "@/lib/cad/schemas";

describe("PatchCAD contracts", () => {
  it("accepts the version-1 mounting bracket fixture", () => {
    expect(BracketSnapshotSchema.parse(bracketContext)).toEqual(bracketContext);
  });

  it.each([
    {
      name: "resizes a selected hole",
      plan: {
        version: 1,
        operation: "resize_hole",
        targetFeatureId: "hole:nw",
        diameterMm: 8,
        rationale: "Increase clearance for the fastener.",
      },
    },
    {
      name: "adds a hole on the top face",
      plan: {
        version: 1,
        operation: "add_hole",
        targetFaceId: "face:top",
        centerMm: { x: 50, y: 32 },
        diameterMm: 5,
        rationale: "Add a centered mounting point.",
      },
    },
  ])("accepts a valid plan that $name", ({ plan }) => {
    expect(PatchPlanSchema.parse(plan)).toEqual(plan);
  });

  it.each([
    {
      name: "negative hole diameters",
      schema: PatchPlanSchema,
      input: {
        version: 1,
        operation: "resize_hole",
        targetFeatureId: "hole:nw",
        diameterMm: -1,
        rationale: "This must be rejected.",
      },
    },
    {
      name: "unknown operations",
      schema: PatchPlanSchema,
      input: {
        version: 1,
        operation: "move_hole",
        targetFeatureId: "hole:nw",
        diameterMm: 8,
        rationale: "This operation is unsupported.",
      },
    },
    {
      name: "extra object keys",
      schema: BracketSnapshotSchema,
      input: { ...bracketContext, unexpected: true },
    },
    {
      name: "non-millimetre snapshot units",
      schema: BracketSnapshotSchema,
      input: { ...bracketContext, units: "in" },
    },
    {
      name: "malformed semantic feature IDs",
      schema: PatchPlanSchema,
      input: {
        version: 1,
        operation: "resize_hole",
        targetFeatureId: "hole:",
        diameterMm: 8,
        rationale: "The target ID is incomplete.",
      },
    },
  ])("rejects $name", ({ schema, input }) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  it("round-trips a snapshot through JSON without data loss", () => {
    const parsed = BracketSnapshotSchema.parse(bracketContext);
    const roundTripped = BracketSnapshotSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(roundTripped).toEqual(bracketContext);
  });

  it("accepts a bounded millimetre plan request", () => {
    expect(
      PlanRequestSchema.safeParse({
        prompt: "Make this hole 8 mm.",
        snapshot: bracketContext,
        selection: {
          units: "mm",
          editableFeatureIds: ["hole:nw"],
          editableFaceIds: ["face:top"],
          pointMm: { x: 12, y: 52, z: 0 },
        },
      }).success,
    ).toBe(true);
  });

  it("accepts a public research source response", () => {
    expect(
      ResearchResponseSchema.safeParse({
        sources: [
          {
            title: "Bracket mounting guide",
            url: "https://example.com/bracket-guide",
            excerpt: "Use the manufacturer datasheet for final sizing.",
            domain: "example.com",
          },
        ],
      }).success,
    ).toBe(true);
  });
});
