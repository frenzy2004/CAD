import { z } from "zod";

import { CONTRACT } from "./contract";

const FiniteNumberSchema = z.number().finite();
const PositiveMillimetresSchema = FiniteNumberSchema.positive();
const HoleDiameterSchema = FiniteNumberSchema
  .min(CONTRACT.minimumHoleDiameterMm)
  .max(CONTRACT.maximumHoleDiameterMm);
const HoleIdSchema = z.templateLiteral([
  "hole:",
  z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
]);

export const Point2MmSchema = z
  .object({
    x: FiniteNumberSchema,
    y: FiniteNumberSchema,
  })
  .strict();

export const Point3MmSchema = z
  .object({
    x: FiniteNumberSchema,
    y: FiniteNumberSchema,
    z: FiniteNumberSchema,
  })
  .strict();

export const DimensionsSchema = z
  .object({
    widthMm: PositiveMillimetresSchema,
    depthMm: PositiveMillimetresSchema,
    heightMm: PositiveMillimetresSchema,
  })
  .strict();

export const HoleFeatureSchema = z
  .object({
    id: HoleIdSchema,
    kind: z.literal("through_hole"),
    centerMm: Point3MmSchema,
    diameterMm: HoleDiameterSchema,
    axis: z
      .object({
        x: z.literal(0),
        y: z.literal(0),
        z: z.literal(1),
      })
      .strict(),
  })
  .strict();

export const BracketSnapshotSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("mounting_bracket"),
    units: z.literal(CONTRACT.units),
    dimensions: DimensionsSchema,
    holes: z.array(HoleFeatureSchema),
  })
  .strict();

export const PatchPlanSchema = z.discriminatedUnion("operation", [
  z
    .object({
      version: z.literal(1),
      operation: z.literal("resize_hole"),
      targetFeatureId: HoleIdSchema,
      diameterMm: HoleDiameterSchema,
      rationale: z.string().trim().min(1).max(CONTRACT.maximumPromptCharacters),
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      operation: z.literal("add_hole"),
      targetFaceId: z.literal("face:top"),
      centerMm: Point2MmSchema,
      diameterMm: HoleDiameterSchema,
      rationale: z.string().trim().min(1).max(CONTRACT.maximumPromptCharacters),
    })
    .strict(),
]);

export const SelectionEnvelopeSchema = z
  .object({
    units: z.literal(CONTRACT.units),
    editableFeatureIds: z.array(HoleIdSchema),
    editableFaceIds: z.array(z.literal("face:top")),
    pointMm: Point3MmSchema.optional(),
  })
  .strict();

export const FeatureFingerprintSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: HoleIdSchema,
      kind: z.literal("through_hole"),
      centerMm: Point3MmSchema,
      diameterMm: HoleDiameterSchema,
    })
    .strict(),
  z
    .object({
      id: z.literal("bracket:dimensions"),
      kind: z.literal("dimensions"),
      dimensions: DimensionsSchema,
    })
    .strict(),
]);

export const VerificationReportSchema = z
  .object({
    validSolid: z.boolean(),
    targetChanged: z.boolean(),
    protectedFeaturesUnchanged: z.boolean(),
    protectedFingerprints: z.array(FeatureFingerprintSchema),
    violations: z.array(z.string().min(1)),
  })
  .strict();

export const PlanRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(CONTRACT.maximumPromptCharacters),
    snapshot: BracketSnapshotSchema,
    selection: SelectionEnvelopeSchema,
  })
  .strict();

export const PlanResponseSchema = z
  .object({
    plan: PatchPlanSchema,
    source: z.enum(["openai", "local-parser"]),
  })
  .strict();

export const ResearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(CONTRACT.maximumPromptCharacters),
  })
  .strict();

export const ResearchSourceSchema = z
  .object({
    title: z.string().trim().min(1),
    url: z.url(),
    excerpt: z.string().trim().min(1),
    domain: z.string().trim().min(1),
  })
  .strict();

export const ResearchResponseSchema = z
  .object({
    sources: z.array(ResearchSourceSchema).max(5),
  })
  .strict();

export type Point2Mm = z.infer<typeof Point2MmSchema>;
export type Point3Mm = z.infer<typeof Point3MmSchema>;
export type Dimensions = z.infer<typeof DimensionsSchema>;
export type HoleFeature = z.infer<typeof HoleFeatureSchema>;
export type BracketSnapshot = z.infer<typeof BracketSnapshotSchema>;
export type PatchPlan = z.infer<typeof PatchPlanSchema>;
export type SelectionEnvelope = z.infer<typeof SelectionEnvelopeSchema>;
export type FeatureFingerprint = z.infer<typeof FeatureFingerprintSchema>;
export type VerificationReport = z.infer<typeof VerificationReportSchema>;
export type PlanRequest = z.infer<typeof PlanRequestSchema>;
export type PlanResponse = z.infer<typeof PlanResponseSchema>;
export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;
export type ResearchResponse = z.infer<typeof ResearchResponseSchema>;
