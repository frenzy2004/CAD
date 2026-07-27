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
  makeVertex,
  setOC,
  Solid,
  type AnyShape,
  type Shape3D,
} from "replicad";

import {
  CadMeshSchema,
  MAX_STEP_IMPORT_BYTES,
  createCadWorkerDispatcher,
  transferableReplyBuffers,
  type CadMesh,
  type CadWorkerReply,
  type CadWorkerRequest,
  type ImportedModelSummary,
} from "@/lib/cad/worker-protocol";
import {
  commitPreparedResource,
  commitPreparedResourceAsync,
  retainValidatedResource,
} from "@/lib/cad/owned-resource";
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

function importedAnchors(
  holes: SessionHole[],
): CadMesh["holeAnchors"] {
  return holes.map((hole) => ({
    featureId: hole.id,
    pointMm: hole.pointMm,
    diameterMm: hole.diameterMm,
  }));
}

function meshShape(
  shape: Shape3D,
  source: "bracket" | "imported-step",
  holeAnchors: CadMesh["holeAnchors"],
): CadMesh {
  const mesh = shape.mesh({ tolerance: 0.05, angularTolerance: 0.1 });

  return CadMeshSchema.parse({
    source,
    positions: new Float32Array(mesh.vertices),
    indices: new Uint32Array(mesh.triangles),
    normals: new Float32Array(mesh.normals),
    bounds: shapeBounds(shape),
    faceGroups: mesh.faceGroups,
    holeAnchors,
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
  } catch (error) {
    result.delete();
    throw error;
  }

  return ownSingleSolid(result, {
    invalidCode: "INVALID_BRACKET_RESULT",
    countCode: "INVALID_BRACKET_RESULT",
    countMessage: (count) =>
      `The exact bracket result must contain one solid; found ${count}.`,
    typeMessage:
      "The exact bracket result did not resolve to one solid.",
  });
}

function importedModelSummary(
  shape: Shape3D,
  byteLength = importedByteLength,
  sessionHoleCount = sessionHoles.length,
): ImportedModelSummary {
  return {
    kind: "imported-step",
    byteLength,
    solidCount: 1,
    bounds: shapeBounds(shape),
    sessionHoleCount,
  };
}

type SingleSolidOptions = {
  invalidCode: string;
  countCode: string;
  countMessage(count: number): string;
  typeMessage: string;
};

function ownSingleSolid(
  shape: AnyShape,
  options: SingleSolidOptions,
): Solid {
  if (shape instanceof Solid) {
    return retainValidatedResource(shape, () => {
      validateSolid(shape, options.invalidCode);
    });
  }

  const rawSolids = [...iterTopo(shape.wrapped, "solid")];
  try {
    if (rawSolids.length !== 1) {
      throw new CadKernelError(
        options.countCode,
        options.countMessage(rawSolids.length),
      );
    }

    const selected = cast(rawSolids[0]);
    try {
      if (!(selected instanceof Solid)) {
        throw new CadKernelError(
          options.countCode,
          options.typeMessage,
        );
      }
      const owned = selected.clone();
      return retainValidatedResource(owned, () => {
        validateSolid(owned, options.invalidCode);
      });
    } finally {
      selected.delete();
    }
  } finally {
    rawSolids.forEach((solid) => solid.delete());
    shape.delete();
  }
}

function ownSingleImportedSolid(imported: AnyShape): Solid {
  return ownSingleSolid(imported, {
    invalidCode: "INVALID_STEP_SOLID",
    countCode: "STEP_SOLID_COUNT",
    countMessage: (count) =>
      `STEP import requires exactly one solid; found ${count}.`,
    typeMessage: "STEP import did not resolve to one solid.",
  });
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

function rebuildImportedResult(holes: SessionHole[]): Solid {
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
    for (const hole of holes) {
      const cutter = cylinderForSessionHole(hole, modelDiagonal);
      try {
        const next = result.cut(cutter);
        result.delete();
        result = next;
      } finally {
        cutter.delete();
      }
    }
  } catch (error) {
    result.delete();
    throw error;
  }

  return ownSingleSolid(result, {
    invalidCode: "INVALID_SESSION_HOLE_RESULT",
    countCode: "INVALID_SESSION_HOLE_RESULT",
    countMessage: (count) =>
      `The exact session-hole result must contain one solid; found ${count}.`,
    typeMessage:
      "The exact session-hole result did not resolve to one solid.",
  });
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

    const openCascade = getOC();
    const point = makeVertex([
      pointMm.x,
      pointMm.y,
      pointMm.z,
    ]);
    const distance = new openCascade.BRepExtrema_DistShapeShape_1();
    const progress = new openCascade.Message_ProgressRange_1();
    try {
      distance.LoadS1(point.wrapped);
      distance.LoadS2(face.wrapped);
      if (
        !distance.Perform(progress) ||
        !distance.IsDone() ||
        !Number.isFinite(distance.Value()) ||
        distance.Value() > 1e-5
      ) {
        throw new CadKernelError(
          "POINT_NOT_ON_FACE",
          "The requested point does not lie on the selected planar face.",
        );
      }
    } finally {
      progress.delete();
      distance.delete();
      point.delete();
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
    const mesh = commitPreparedResource(
      result,
      (candidate) =>
        meshShape(
          candidate,
          "bracket",
          bracketAnchors(request.snapshot),
        ),
      (candidate) => {
        clearImportedState();
        bracketSnapshot = request.snapshot;
        replaceCurrentShape(candidate, "bracket");
      },
    );
    return {
      id: request.id,
      type: "mesh",
      mesh,
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
    let result: Solid;
    try {
      result = retainValidatedResource(base.clone(), (candidate) => {
        validateSolid(candidate, "INVALID_STEP_SOLID");
      });
    } catch (error) {
      base.delete();
      throw error;
    }

    try {
      const prepared = commitPreparedResource(
        result,
        (candidate) => ({
          model: importedModelSummary(
            candidate,
            request.bytes.byteLength,
            0,
          ),
          mesh: meshShape(candidate, "imported-step", []),
        }),
        (candidate) => {
          clearImportedState();
          importedBaseShape = base;
          importedByteLength = request.bytes.byteLength;
          bracketSnapshot = null;
          replaceCurrentShape(candidate, "imported-step");
        },
      );

      return {
        id: request.id,
        type: "imported",
        ...prepared,
      };
    } catch (error) {
      base.delete();
      throw error;
    }
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

    const nextSessionHoles =
      existingIndex >= 0
        ? sessionHoles.map((hole, index) =>
            index === existingIndex ? nextHole : hole,
          )
        : [...sessionHoles, nextHole];

    const result = rebuildImportedResult(nextSessionHoles);
    const mesh = commitPreparedResource(
      result,
      (candidate) =>
        meshShape(
          candidate,
          "imported-step",
          importedAnchors(nextSessionHoles),
        ),
      (candidate) => {
        sessionHoles = nextSessionHoles;
        if (existingIndex < 0) nextSessionHoleNumber += 1;
        replaceCurrentShape(candidate, "imported-step");
      },
    );
    return {
      id: request.id,
      type: "mesh",
      mesh,
    };
  }

  if (request.snapshot) {
    const snapshot = request.snapshot;
    const result = buildBracket(snapshot);
    const prepared = await commitPreparedResourceAsync(
      result,
      async (candidate) => ({
        filename: "patchcad-bracket.step",
        bytes: await candidate.blobSTEP().arrayBuffer(),
      }),
      (candidate) => {
        clearImportedState();
        bracketSnapshot = snapshot;
        replaceCurrentShape(candidate, "bracket");
      },
    );
    return {
      id: request.id,
      type: "step",
      ...prepared,
    };
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

const dispatcher = createCadWorkerDispatcher({
  handleRequest,
  errorReply,
  postReply(reply) {
    workerScope.postMessage(reply, transferableReplyBuffers(reply));
  },
});

workerScope.onmessage = (event) => {
  void dispatcher.dispatch(event.data);
};

export {};
