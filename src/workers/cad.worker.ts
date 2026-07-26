import initOpenCascade, {
  type OpenCascadeInstance,
} from "replicad-opencascadejs";
import {
  cast,
  getOC,
  importSTEP,
  iterTopo,
  makeBox,
  makeCylinder,
  setOC,
  Solid,
  type AnyShape,
  type Shape3D,
} from "replicad";

import {
  CadMeshSchema,
  CadWorkerRequestSchema,
  MAX_STEP_IMPORT_BYTES,
  createCadWorkerRequestId,
  transferableReplyBuffers,
  type CadMesh,
  type CadWorkerReply,
  type CadWorkerRequest,
  type ImportedModelSummary,
} from "@/lib/cad/worker-protocol";
import type { BracketSnapshot, Point3Mm } from "@/lib/cad/schemas";

type WorkerScope = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

type SessionHole = {
  id: string;
  pointMm: Point3Mm;
  normal: [number, number, number];
  diameterMm: number;
};

class CadKernelError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CadKernelError";
  }
}

const workerScope = self as unknown as WorkerScope;
const seenRequestIds = new Set<string>();

let initializePromise: Promise<void> | null = null;
let currentShape: Shape3D | null = null;
let currentSource: "bracket" | "imported-step" | null = null;
let importedBaseShape: Solid | null = null;
let importedByteLength = 0;
let bracketSnapshot: BracketSnapshot | null = null;
let sessionHoles: SessionHole[] = [];
let nextSessionHoleNumber = 1;

function initializeKernel(): Promise<void> {
  if (!initializePromise) {
    initializePromise = (
      initOpenCascade as unknown as (options: {
        locateFile(path: string): string;
      }) => Promise<OpenCascadeInstance>
    )({
      locateFile: () => "/cad-runtime/replicad_single-0.23.0.wasm",
    }).then((openCascade) => {
      setOC(openCascade);
    });
  }

  return initializePromise;
}

function replaceCurrentShape(
  shape: Shape3D,
  source: "bracket" | "imported-step",
): void {
  currentShape?.delete();
  currentShape = shape;
  currentSource = source;
}

function clearImportedState(): void {
  importedBaseShape?.delete();
  importedBaseShape = null;
  importedByteLength = 0;
  sessionHoles = [];
  nextSessionHoleNumber = 1;
}

function pointFromTuple([x, y, z]: [number, number, number]): Point3Mm {
  return { x, y, z };
}

function shapeBounds(shape: Shape3D): CadMesh["bounds"] {
  const boundingBox = shape.boundingBox;
  try {
    const [min, max] = boundingBox.bounds;
    return {
      min: pointFromTuple(min),
      max: pointFromTuple(max),
    };
  } finally {
    boundingBox.delete();
  }
}

function validateSolid(shape: Shape3D, code: string): asserts shape is Solid {
  if (!(shape instanceof Solid)) {
    throw new CadKernelError(code, "The exact result is not one solid.");
  }

  const openCascade = getOC();
  const analyzer = new openCascade.BRepCheck_Analyzer(
    shape.wrapped,
    true,
    false,
  );
  try {
    if (!analyzer.IsValid_2()) {
      throw new CadKernelError(code, "OpenCascade rejected the result solid.");
    }
  } finally {
    analyzer.delete();
  }
}

function bracketAnchors(snapshot: BracketSnapshot): CadMesh["holeAnchors"] {
  return snapshot.holes.map((hole) => ({
    featureId: hole.id,
    pointMm: {
      x: hole.centerMm.x,
      y: hole.centerMm.y,
      z: snapshot.dimensions.heightMm,
    },
    diameterMm: hole.diameterMm,
  }));
}

function importedAnchors(): CadMesh["holeAnchors"] {
  return sessionHoles.map((hole) => ({
    featureId: hole.id,
    pointMm: hole.pointMm,
    diameterMm: hole.diameterMm,
  }));
}

function meshShape(
  shape: Shape3D,
  source: "bracket" | "imported-step",
): CadMesh {
  const mesh = shape.mesh({ tolerance: 0.05, angularTolerance: 0.1 });

  return CadMeshSchema.parse({
    source,
    positions: new Float32Array(mesh.vertices),
    indices: new Uint32Array(mesh.triangles),
    normals: new Float32Array(mesh.normals),
    bounds: shapeBounds(shape),
    faceGroups: mesh.faceGroups,
    holeAnchors:
      source === "bracket" && bracketSnapshot
        ? bracketAnchors(bracketSnapshot)
        : importedAnchors(),
  });
}

function buildBracket(snapshot: BracketSnapshot): Solid {
  const { widthMm, depthMm, heightMm } = snapshot.dimensions;
  let result: Shape3D = makeBox(
    [0, 0, 0],
    [widthMm, depthMm, heightMm],
  );

  try {
    for (const hole of snapshot.holes) {
      const cutter = makeCylinder(
        hole.diameterMm / 2,
        heightMm * 3,
        [hole.centerMm.x, hole.centerMm.y, -heightMm],
        [0, 0, 1],
      );
      try {
        const next = result.cut(cutter);
        result.delete();
        result = next;
      } finally {
        cutter.delete();
      }
    }

    validateSolid(result, "INVALID_BRACKET_RESULT");
    return result;
  } catch (error) {
    result.delete();
    throw error;
  }
}

function importedModelSummary(shape: Shape3D): ImportedModelSummary {
  return {
    kind: "imported-step",
    byteLength: importedByteLength,
    solidCount: 1,
    bounds: shapeBounds(shape),
    sessionHoleCount: sessionHoles.length,
  };
}

function ownSingleImportedSolid(imported: AnyShape): Solid {
  if (imported instanceof Solid) {
    try {
      validateSolid(imported, "INVALID_STEP_SOLID");
      return imported;
    } catch (error) {
      imported.delete();
      throw error;
    }
  }

  const rawSolids = [...iterTopo(imported.wrapped, "solid")];
  try {
    if (rawSolids.length !== 1) {
      throw new CadKernelError(
        "STEP_SOLID_COUNT",
        `STEP import requires exactly one solid; found ${rawSolids.length}.`,
      );
    }

    const selected = cast(rawSolids[0]);
    try {
      if (!(selected instanceof Solid)) {
        throw new CadKernelError(
          "STEP_SOLID_COUNT",
          "STEP import did not resolve to one solid.",
        );
      }
      const owned = selected.clone();
      validateSolid(owned, "INVALID_STEP_SOLID");
      return owned;
    } finally {
      selected.delete();
    }
  } finally {
    rawSolids.forEach((solid) => solid.delete());
    imported.delete();
  }
}

function diagonalLength(shape: Shape3D): number {
  const bounds = shapeBounds(shape);
  return Math.hypot(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
}

function cylinderForSessionHole(
  hole: SessionHole,
  modelDiagonal: number,
): Solid {
  const length = modelDiagonal * 2.1 + 2;
  const [nx, ny, nz] = hole.normal;
  return makeCylinder(
    hole.diameterMm / 2,
    length,
    [
      hole.pointMm.x - (nx * length) / 2,
      hole.pointMm.y - (ny * length) / 2,
      hole.pointMm.z - (nz * length) / 2,
    ],
    hole.normal,
  );
}

function rebuildImportedResult(): Solid {
  if (!importedBaseShape) {
    throw new CadKernelError(
      "NO_IMPORTED_MODEL",
      "Import one STEP solid before adding a session hole.",
    );
  }

  const modelDiagonal = diagonalLength(importedBaseShape);
  if (!Number.isFinite(modelDiagonal) || modelDiagonal <= 0) {
    throw new CadKernelError(
      "INVALID_STEP_BOUNDS",
      "The imported solid has invalid or empty bounds.",
    );
  }

  let result: Shape3D = importedBaseShape.clone();
  try {
    for (const hole of sessionHoles) {
      const cutter = cylinderForSessionHole(hole, modelDiagonal);
      try {
        const next = result.cut(cutter);
        result.delete();
        result = next;
      } finally {
        cutter.delete();
      }
    }

    validateSolid(result, "INVALID_SESSION_HOLE_RESULT");
    return result;
  } catch (error) {
    result.delete();
    throw error;
  }
}

function normalForPlanarFace(
  shape: Shape3D,
  faceId: number,
  pointMm: Point3Mm,
): [number, number, number] {
  const faces = shape.faces;
  try {
    const face = faces.find((candidate) => candidate.hashCode === faceId);
    if (!face) {
      throw new CadKernelError(
        "FACE_NOT_FOUND",
        "The selected face no longer belongs to the current exact result.",
      );
    }
    if (face.geomType !== "PLANE") {
      throw new CadKernelError(
        "NON_PLANAR_FACE",
        "Session holes can only be added to planar faces; existing imported holes cannot be resized.",
      );
    }

    const normal = face.normalAt([pointMm.x, pointMm.y, pointMm.z]);
    const normalized = normal.normalized();
    try {
      return normalized.toTuple();
    } finally {
      normalized.delete();
      normal.delete();
    }
  } finally {
    faces.forEach((face) => face.delete());
  }
}

function sameSessionLocation(
  hole: SessionHole,
  pointMm: Point3Mm,
): boolean {
  return (
    Math.hypot(
      hole.pointMm.x - pointMm.x,
      hole.pointMm.y - pointMm.y,
      hole.pointMm.z - pointMm.z,
    ) <= 1e-4
  );
}

async function handleRequest(
  request: CadWorkerRequest,
): Promise<CadWorkerReply> {
  await initializeKernel();

  if (request.type === "initialize") {
    return { id: request.id, type: "ready" };
  }

  if (request.type === "build") {
    const result = buildBracket(request.snapshot);
    clearImportedState();
    bracketSnapshot = request.snapshot;
    replaceCurrentShape(result, "bracket");
    return {
      id: request.id,
      type: "mesh",
      mesh: meshShape(result, "bracket"),
    };
  }

  if (request.type === "import-step") {
    if (
      request.bytes.byteLength === 0 ||
      request.bytes.byteLength > MAX_STEP_IMPORT_BYTES
    ) {
      throw new CadKernelError(
        "STEP_SIZE_LIMIT",
        `STEP files must be between 1 byte and ${MAX_STEP_IMPORT_BYTES} bytes for this desktop-oriented browser kernel.`,
      );
    }

    const imported = await importSTEP(new Blob([request.bytes]));
    const base = ownSingleImportedSolid(imported);
    const result = base.clone();
    validateSolid(result, "INVALID_STEP_SOLID");

    clearImportedState();
    importedBaseShape = base;
    importedByteLength = request.bytes.byteLength;
    bracketSnapshot = null;
    replaceCurrentShape(result, "imported-step");

    return {
      id: request.id,
      type: "imported",
      model: importedModelSummary(result),
      mesh: meshShape(result, "imported-step"),
    };
  }

  if (request.type === "cut-session-hole") {
    if (currentSource !== "imported-step" || !currentShape) {
      throw new CadKernelError(
        "NO_IMPORTED_MODEL",
        "Session-owned planar holes require an imported STEP solid.",
      );
    }

    const existingIndex = sessionHoles.findIndex((hole) =>
      sameSessionLocation(hole, request.pointMm),
    );
    // A record match is a resize of a hole created in this worker session.
    // Every other request must prove it hit a current planar face, which
    // deliberately rejects attempts to resize pre-existing imported holes.
    const normal =
      existingIndex >= 0
        ? sessionHoles[existingIndex].normal
        : normalForPlanarFace(
            currentShape,
            request.faceId,
            request.pointMm,
          );
    const nextHole: SessionHole = {
      id:
        existingIndex >= 0
          ? sessionHoles[existingIndex].id
          : `session-hole:${nextSessionHoleNumber}`,
      pointMm: request.pointMm,
      normal,
      diameterMm: request.diameterMm,
    };

    const previousHoles = sessionHoles;
    sessionHoles =
      existingIndex >= 0
        ? sessionHoles.map((hole, index) =>
            index === existingIndex ? nextHole : hole,
          )
        : [...sessionHoles, nextHole];

    try {
      const result = rebuildImportedResult();
      if (existingIndex < 0) nextSessionHoleNumber += 1;
      replaceCurrentShape(result, "imported-step");
      return {
        id: request.id,
        type: "mesh",
        mesh: meshShape(result, "imported-step"),
      };
    } catch (error) {
      sessionHoles = previousHoles;
      throw error;
    }
  }

  if (request.snapshot) {
    const result = buildBracket(request.snapshot);
    clearImportedState();
    bracketSnapshot = request.snapshot;
    replaceCurrentShape(result, "bracket");
  }

  if (!currentShape || !currentSource) {
    throw new CadKernelError(
      "NO_EXACT_RESULT",
      "Build or import an exact model before exporting STEP.",
    );
  }

  const blob = currentShape.blobSTEP();
  return {
    id: request.id,
    type: "step",
    filename:
      currentSource === "bracket"
        ? "patchcad-bracket.step"
        : "patchcad-imported.step",
    bytes: await blob.arrayBuffer(),
  };
}

function errorReply(id: string, error: unknown): CadWorkerReply {
  return {
    id,
    type: "error",
    code: error instanceof CadKernelError ? error.code : "CAD_KERNEL_ERROR",
    message:
      error instanceof Error
        ? error.message
        : "The browser CAD kernel failed unexpectedly.",
  };
}

workerScope.onmessage = (event) => {
  const parsed = CadWorkerRequestSchema.safeParse(event.data);
  const fallbackId = createCadWorkerRequestId();
  const requestId =
    typeof event.data === "object" &&
    event.data !== null &&
    "id" in event.data &&
    typeof event.data.id === "string"
      ? event.data.id
      : fallbackId;

  if (!parsed.success) {
    const reply = errorReply(
      fallbackId,
      new CadKernelError(
        "INVALID_REQUEST",
        "The CAD worker rejected an invalid protocol message.",
      ),
    );
    workerScope.postMessage(reply, []);
    return;
  }

  if (seenRequestIds.has(requestId)) {
    const reply = errorReply(
      requestId,
      new CadKernelError(
        "DUPLICATE_REQUEST_ID",
        "Each CAD worker request ID must be unique.",
      ),
    );
    workerScope.postMessage(reply, []);
    return;
  }
  seenRequestIds.add(requestId);

  void handleRequest(parsed.data)
    .then((reply) => {
      workerScope.postMessage(reply, transferableReplyBuffers(reply));
    })
    .catch((error: unknown) => {
      workerScope.postMessage(errorReply(requestId, error), []);
    });
};

export {};
