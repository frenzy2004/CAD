import { z } from "zod";

import { CONTRACT } from "./contract";
import { BracketSnapshotSchema, Point3MmSchema } from "./schemas";

export const CAD_WORKER_TIMEOUT_MS = 30_000;
export const MAX_STEP_IMPORT_BYTES = 50 * 1024 * 1024;

const RequestIdSchema = z.uuid();
const FiniteNumberSchema = z.number().finite();
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const PositiveIntegerSchema = z.number().int().positive();
const ArrayBufferSchema = z.instanceof(ArrayBuffer);
const Float32ArraySchema = z.instanceof(Float32Array);
const Uint32ArraySchema = z.instanceof(Uint32Array);

const BoundsSchema = z
  .object({
    min: Point3MmSchema,
    max: Point3MmSchema,
  })
  .strict()
  .refine(
    ({ min, max }) =>
      min.x <= max.x && min.y <= max.y && min.z <= max.z,
    "Bounds minimum must not exceed maximum",
  );

const FaceGroupSchema = z
  .object({
    start: NonNegativeIntegerSchema,
    count: PositiveIntegerSchema,
    faceId: NonNegativeIntegerSchema,
  })
  .strict();

const HoleAnchorSchema = z
  .object({
    featureId: z
      .string()
      .regex(/^(?:hole|session-hole):[A-Za-z0-9][A-Za-z0-9_-]*$/),
    pointMm: Point3MmSchema,
    diameterMm: FiniteNumberSchema
      .min(CONTRACT.minimumHoleDiameterMm)
      .max(CONTRACT.maximumHoleDiameterMm),
  })
  .strict();

export const CadMeshSchema = z
  .object({
    source: z.enum(["bracket", "imported-step"]),
    positions: Float32ArraySchema,
    indices: Uint32ArraySchema,
    normals: Float32ArraySchema,
    bounds: BoundsSchema,
    faceGroups: z.array(FaceGroupSchema),
    holeAnchors: z.array(HoleAnchorSchema),
  })
  .strict()
  .superRefine((mesh, context) => {
    if (mesh.positions.length === 0 || mesh.positions.length % 3 !== 0) {
      context.addIssue({
        code: "custom",
        path: ["positions"],
        message: "Positions must contain complete XYZ vertices",
      });
    }

    if (![...mesh.positions].every(Number.isFinite)) {
      context.addIssue({
        code: "custom",
        path: ["positions"],
        message: "Positions must be finite",
      });
    }

    if (
      mesh.normals.length !== mesh.positions.length ||
      ![...mesh.normals].every(Number.isFinite)
    ) {
      context.addIssue({
        code: "custom",
        path: ["normals"],
        message: "Normals must be finite and match the positions",
      });
    }

    if (mesh.indices.length === 0 || mesh.indices.length % 3 !== 0) {
      context.addIssue({
        code: "custom",
        path: ["indices"],
        message: "Indices must contain complete triangles",
      });
    }

    const vertexCount = mesh.positions.length / 3;
    if ([...mesh.indices].some((index) => index >= vertexCount)) {
      context.addIssue({
        code: "custom",
        path: ["indices"],
        message: "Triangle indices must reference an existing vertex",
      });
    }

    if (mesh.source === "bracket" && mesh.holeAnchors.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["holeAnchors"],
        message: "Bracket meshes require semantic hole anchors",
      });
    }
  });

export const ImportedModelSummarySchema = z
  .object({
    kind: z.literal("imported-step"),
    byteLength: PositiveIntegerSchema.max(MAX_STEP_IMPORT_BYTES),
    solidCount: z.literal(1),
    bounds: BoundsSchema,
    sessionHoleCount: NonNegativeIntegerSchema,
  })
  .strict();

const InitializeRequestSchema = z
  .object({
    id: RequestIdSchema,
    type: z.literal("initialize"),
  })
  .strict();

const BuildRequestSchema = z
  .object({
    id: RequestIdSchema,
    type: z.literal("build"),
    snapshot: BracketSnapshotSchema,
  })
  .strict();

const ImportStepRequestSchema = z
  .object({
    id: RequestIdSchema,
    type: z.literal("import-step"),
    bytes: ArrayBufferSchema,
  })
  .strict();

const CutSessionHoleRequestSchema = z
  .object({
    id: RequestIdSchema,
    type: z.literal("cut-session-hole"),
    faceId: NonNegativeIntegerSchema,
    pointMm: Point3MmSchema,
    diameterMm: FiniteNumberSchema
      .min(CONTRACT.minimumHoleDiameterMm)
      .max(CONTRACT.maximumHoleDiameterMm),
  })
  .strict();

const ExportStepRequestSchema = z
  .object({
    id: RequestIdSchema,
    type: z.literal("export-step"),
    snapshot: BracketSnapshotSchema.optional(),
  })
  .strict();

export const CadWorkerRequestSchema = z.discriminatedUnion("type", [
  InitializeRequestSchema,
  BuildRequestSchema,
  ImportStepRequestSchema,
  CutSessionHoleRequestSchema,
  ExportStepRequestSchema,
]);

export const CadWorkerReplySchema = z.discriminatedUnion("type", [
  z
    .object({
      id: RequestIdSchema,
      type: z.literal("ready"),
    })
    .strict(),
  z
    .object({
      id: RequestIdSchema,
      type: z.literal("imported"),
      model: ImportedModelSummarySchema,
      mesh: CadMeshSchema,
    })
    .strict(),
  z
    .object({
      id: RequestIdSchema,
      type: z.literal("mesh"),
      mesh: CadMeshSchema,
    })
    .strict(),
  z
    .object({
      id: RequestIdSchema,
      type: z.literal("step"),
      filename: z.string().trim().min(1),
      bytes: ArrayBufferSchema,
    })
    .strict(),
  z
    .object({
      id: RequestIdSchema,
      type: z.literal("error"),
      code: z.string().trim().min(1),
      message: z.string().trim().min(1),
    })
    .strict(),
]);

export type CadMesh = z.infer<typeof CadMeshSchema>;
export type ImportedModelSummary = z.infer<
  typeof ImportedModelSummarySchema
>;
export type CadWorkerRequest = z.infer<typeof CadWorkerRequestSchema>;
export type CadWorkerReply = z.infer<typeof CadWorkerReplySchema>;
export type CadWorkerCommand = CadWorkerRequest extends infer Request
  ? Request extends { id: string }
    ? Omit<Request, "id">
    : never
  : never;

export function createCadWorkerRequestId(): string {
  return crypto.randomUUID();
}

export function transferableReplyBuffers(reply: CadWorkerReply): ArrayBuffer[] {
  if (reply.type === "mesh" || reply.type === "imported") {
    return [
      reply.mesh.positions.buffer as ArrayBuffer,
      reply.mesh.indices.buffer as ArrayBuffer,
      reply.mesh.normals.buffer as ArrayBuffer,
    ];
  }

  return reply.type === "step" ? [reply.bytes] : [];
}
