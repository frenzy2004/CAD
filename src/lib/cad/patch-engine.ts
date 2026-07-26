import { CONTRACT } from "./contract";
import type {
  BracketSnapshot,
  FeatureFingerprint,
  HoleFeature,
  PatchPlan,
  SelectionEnvelope,
  VerificationReport,
} from "./schemas";

export type PatchRejectionCode =
  | "TARGET_OUTSIDE_SELECTION"
  | "MINIMUM_WALL_VIOLATION"
  | "HOLE_COLLISION"
  | "PROTECTED_FEATURE_CHANGED"
  | "NO_EFFECT"
  | "UNSUPPORTED_OPERATION";

export type VerificationViolationCode =
  | "PROTECTED_FEATURE_CHANGED"
  | "INVALID_SOLID";

export type ValidationResult =
  | { valid: true }
  | { valid: false; code: PatchRejectionCode };

export class PatchValidationError extends Error {
  readonly code: PatchRejectionCode;

  constructor(code: PatchRejectionCode) {
    super(code);
    this.name = "PatchValidationError";
    this.code = code;
  }
}

export function fingerprintSnapshot(snapshot: BracketSnapshot): FeatureFingerprint[] {
  return [
    {
      id: "bracket:dimensions",
      kind: "dimensions",
      dimensions: { ...snapshot.dimensions },
    },
    ...snapshot.holes
      .map((hole) => ({
        id: hole.id,
        kind: "through_hole" as const,
        centerMm: { ...hole.centerMm },
        diameterMm: hole.diameterMm,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  ];
}

export function validatePlan(input: {
  before: BracketSnapshot;
  selection: SelectionEnvelope;
  plan: PatchPlan;
}): ValidationResult {
  const { before, selection, plan } = input;

  if (plan.operation === "resize_hole") {
    if (!selection.editableFeatureIds.includes(plan.targetFeatureId)) {
      return { valid: false, code: "TARGET_OUTSIDE_SELECTION" };
    }

    const target = before.holes.find((hole) => hole.id === plan.targetFeatureId);
    if (!target) {
      return { valid: false, code: "TARGET_OUTSIDE_SELECTION" };
    }

    if (plan.diameterMm === target.diameterMm) {
      return { valid: false, code: "NO_EFFECT" };
    }

    return validateCandidate(
      before,
      { ...target, diameterMm: plan.diameterMm },
      target.id,
    );
  }

  if (plan.operation === "add_hole") {
    if (!selection.editableFaceIds.includes(plan.targetFaceId)) {
      return { valid: false, code: "TARGET_OUTSIDE_SELECTION" };
    }

    return validateCandidate(before, {
      id: nextAddedHoleId(before),
      kind: "through_hole",
      centerMm: { ...plan.centerMm, z: 0 },
      diameterMm: plan.diameterMm,
      axis: { x: 0, y: 0, z: 1 },
    });
  }

  return { valid: false, code: "UNSUPPORTED_OPERATION" };
}

export function applyPatch(input: {
  before: BracketSnapshot;
  selection: SelectionEnvelope;
  plan: PatchPlan;
}): { after: BracketSnapshot; report: VerificationReport } {
  const validation = validatePlan(input);
  if (!validation.valid) {
    throw new PatchValidationError(validation.code);
  }

  const { before, selection, plan } = input;
  const after =
    plan.operation === "resize_hole"
      ? {
          ...cloneSnapshot(before),
          holes: before.holes.map((hole) =>
            hole.id === plan.targetFeatureId
              ? cloneHole({ ...hole, diameterMm: plan.diameterMm })
              : cloneHole(hole),
          ),
        }
      : {
          ...cloneSnapshot(before),
          holes: [
            ...before.holes.map(cloneHole),
            {
              id: nextAddedHoleId(before),
              kind: "through_hole" as const,
              centerMm: { ...plan.centerMm, z: 0 },
              diameterMm: plan.diameterMm,
              axis: { x: 0 as const, y: 0 as const, z: 1 as const },
            },
          ],
        };
  const editableFeatureIds =
    plan.operation === "resize_hole"
      ? selection.editableFeatureIds
      : [...selection.editableFeatureIds, nextAddedHoleId(before)];
  const localityReport = verifyLocality(before, after, editableFeatureIds);

  return {
    after,
    report: localityReport,
  };
}

export function verifyLocality(
  before: BracketSnapshot,
  after: BracketSnapshot,
  editableFeatureIds: string[],
): VerificationReport {
  const protectedFingerprints = fingerprintSnapshot(before).filter(
    (fingerprint) => !editableFeatureIds.includes(fingerprint.id),
  );
  const afterFingerprints = fingerprintSnapshot(after);
  const afterById = new Map<string, FeatureFingerprint>(
    afterFingerprints.map((fingerprint) => [fingerprint.id, fingerprint]),
  );
  const violations: VerificationViolationCode[] = [];

  for (const protectedFingerprint of protectedFingerprints) {
    const actual = afterById.get(protectedFingerprint.id);
    if (!actual || !fingerprintsMatch(protectedFingerprint, actual)) {
      violations.push("PROTECTED_FEATURE_CHANGED");
      break;
    }
  }

  const protectedHoleIds = new Set(
    protectedFingerprints
      .filter((fingerprint) => fingerprint.kind === "through_hole")
      .map((fingerprint) => fingerprint.id),
  );
  if (
    after.holes.some(
      (hole) =>
        !protectedHoleIds.has(hole.id) && !editableFeatureIds.includes(hole.id),
    )
  ) {
    violations.push("PROTECTED_FEATURE_CHANGED");
  }

  if (!isValidSolid(after)) {
    violations.push("INVALID_SOLID");
  }

  const beforeById = new Map<string, FeatureFingerprint>(
    fingerprintSnapshot(before).map((fingerprint) => [fingerprint.id, fingerprint]),
  );
  const targetChanged = editableFeatureIds.some((id) => {
    const beforeFingerprint = beforeById.get(id);
    const afterFingerprint = afterById.get(id);
    return !beforeFingerprint || !afterFingerprint || !fingerprintsMatch(beforeFingerprint, afterFingerprint);
  });

  return {
    validSolid: isValidSolid(after),
    targetChanged,
    protectedFeaturesUnchanged: !violations.includes("PROTECTED_FEATURE_CHANGED"),
    protectedFingerprints,
    violations,
  };
}

function validateCandidate(
  snapshot: BracketSnapshot,
  candidate: HoleFeature,
  excludedHoleId?: string,
): ValidationResult {
  if (minimumEdgeWall(snapshot, candidate) < CONTRACT.minimumWallMm) {
    return { valid: false, code: "MINIMUM_WALL_VIOLATION" };
  }

  if (
    snapshot.holes.some(
      (hole) => hole.id !== excludedHoleId && holesIntersect(candidate, hole),
    )
  ) {
    return { valid: false, code: "HOLE_COLLISION" };
  }

  return { valid: true };
}

function nextAddedHoleId(snapshot: BracketSnapshot): `hole:added-${number}` {
  const largestExistingIndex = snapshot.holes.reduce((largestIndex, hole) => {
    const match = /^hole:added-(\d+)$/.exec(hole.id);
    return match ? Math.max(largestIndex, Number(match[1])) : largestIndex;
  }, 0);

  return `hole:added-${largestExistingIndex + 1}`;
}

function cloneSnapshot(snapshot: BracketSnapshot): Omit<BracketSnapshot, "holes"> {
  return {
    ...snapshot,
    dimensions: { ...snapshot.dimensions },
  };
}

function cloneHole(hole: HoleFeature): HoleFeature {
  return {
    ...hole,
    centerMm: { ...hole.centerMm },
    axis: { ...hole.axis },
  };
}

function isValidSolid(snapshot: BracketSnapshot): boolean {
  const { dimensions, holes } = snapshot;
  if (
    dimensions.widthMm <= 0 ||
    dimensions.depthMm <= 0 ||
    dimensions.heightMm <= 0 ||
    new Set(holes.map((hole) => hole.id)).size !== holes.length
  ) {
    return false;
  }

  return holes.every(
    (hole, index) =>
      minimumEdgeWall(snapshot, hole) >= CONTRACT.minimumWallMm &&
      holes.slice(index + 1).every((otherHole) => !holesIntersect(hole, otherHole)),
  );
}

function minimumEdgeWall(snapshot: BracketSnapshot, hole: HoleFeature): number {
  const radius = hole.diameterMm / 2;
  return Math.min(
    hole.centerMm.x - radius,
    snapshot.dimensions.widthMm - hole.centerMm.x - radius,
    hole.centerMm.y - radius,
    snapshot.dimensions.depthMm - hole.centerMm.y - radius,
  );
}

function holesIntersect(left: HoleFeature, right: HoleFeature): boolean {
  const distance = Math.hypot(
    left.centerMm.x - right.centerMm.x,
    left.centerMm.y - right.centerMm.y,
  );
  return distance < left.diameterMm / 2 + right.diameterMm / 2;
}

function fingerprintsMatch(
  expected: FeatureFingerprint,
  actual: FeatureFingerprint,
): boolean {
  if (expected.id !== actual.id || expected.kind !== actual.kind) {
    return false;
  }

  if (expected.kind === "dimensions" && actual.kind === "dimensions") {
    return (
      equalWithinTolerance(expected.dimensions.widthMm, actual.dimensions.widthMm) &&
      equalWithinTolerance(expected.dimensions.depthMm, actual.dimensions.depthMm) &&
      equalWithinTolerance(expected.dimensions.heightMm, actual.dimensions.heightMm)
    );
  }

  if (expected.kind === "through_hole" && actual.kind === "through_hole") {
    return (
      equalWithinTolerance(expected.centerMm.x, actual.centerMm.x) &&
      equalWithinTolerance(expected.centerMm.y, actual.centerMm.y) &&
      equalWithinTolerance(expected.centerMm.z, actual.centerMm.z) &&
      equalWithinTolerance(expected.diameterMm, actual.diameterMm)
    );
  }

  return false;
}

function equalWithinTolerance(left: number, right: number): boolean {
  return Math.abs(left - right) <= CONTRACT.fingerprintToleranceMm;
}
