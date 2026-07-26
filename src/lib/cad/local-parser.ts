import { PatchPlanSchema } from "./schemas";
import type { PatchPlan, SelectionEnvelope } from "./schemas";

const MILLIMETRES_PER_INCH = 25.4;

export type PatchPlanParseRejectionCode =
  | "MISSING_DIMENSION"
  | "INVALID_DIMENSION"
  | "AMBIGUOUS_OPERATION"
  | "AMBIGUOUS_SELECTION"
  | "MISSING_TARGET"
  | "TARGET_OUTSIDE_SELECTION"
  | "UNSUPPORTED_OPERATION";

export type PatchPlanParseResult =
  | { source: "local-parser"; plan: PatchPlan }
  | { source: "local-parser"; error: { code: PatchPlanParseRejectionCode } };

export function parseLocalPatch(
  prompt: string,
  selection: SelectionEnvelope,
): PatchPlanParseResult {
  const normalizedPrompt = prompt.trim().toLowerCase().replace(/\s+/g, " ");
  const operationCount = countOperationWords(normalizedPrompt);

  if (operationCount > 1) {
    return reject("AMBIGUOUS_OPERATION");
  }

  const resizeSuffix = matchResizeCommand(normalizedPrompt);
  if (resizeSuffix !== null) {
    const diameterMm = parseDiameterMm(resizeSuffix);
    if (diameterMm === undefined) {
      return reject("MISSING_DIMENSION");
    }
    if (diameterMm === null) {
      return reject("INVALID_DIMENSION");
    }
    if (selection.editableFeatureIds.length === 0) {
      return reject("TARGET_OUTSIDE_SELECTION");
    }
    if (selection.editableFeatureIds.length > 1) {
      return reject("AMBIGUOUS_SELECTION");
    }

    return parsedPlan({
      version: 1,
      operation: "resize_hole",
      targetFeatureId: selection.editableFeatureIds[0],
      diameterMm,
      rationale: prompt.trim(),
    });
  }

  const addSuffix = matchAddCommand(normalizedPrompt);
  if (addSuffix !== null) {
    const diameterMm = parseDiameterMm(addSuffix);
    if (diameterMm === undefined) {
      return reject("MISSING_DIMENSION");
    }
    if (diameterMm === null) {
      return reject("INVALID_DIMENSION");
    }
    if (!selection.editableFaceIds.includes("face:top")) {
      return reject("TARGET_OUTSIDE_SELECTION");
    }
    if (!selection.pointMm) {
      return reject("MISSING_TARGET");
    }

    return parsedPlan({
      version: 1,
      operation: "add_hole",
      targetFaceId: "face:top",
      centerMm: { x: selection.pointMm.x, y: selection.pointMm.y },
      diameterMm,
      rationale: prompt.trim(),
    });
  }

  return reject("UNSUPPORTED_OPERATION");
}

function matchResizeCommand(prompt: string): string | null {
  const match = /^(?:make this hole|resize selected hole(?: to)?)(?:\s+(.*))?$/.exec(prompt);
  return match ? (match[1] ?? "") : null;
}

function matchAddCommand(prompt: string): string | null {
  const match = /^add(?: a)?(?:\s+(.*?))?\s+hole here$/.exec(prompt);
  return match ? (match[1] ?? "") : null;
}

function parseDiameterMm(value: string): number | null | undefined {
  if (!value) {
    return undefined;
  }

  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*\d+(?:\.\d+)?)?)\s*(mm|millimet(?:er|re)s?|in|inch(?:es)?)$/.exec(value);
  if (!match) {
    return undefined;
  }

  const quantity = parseQuantity(match[1]);
  const diameterMm = isInchUnit(match[2]) ? quantity * MILLIMETRES_PER_INCH : quantity;
  if (!Number.isFinite(diameterMm) || diameterMm <= 0) {
    return null;
  }

  return diameterMm;
}

function parseQuantity(value: string): number {
  const [numerator, denominator] = value.replace(/\s/g, "").split("/");
  return denominator === undefined ? Number(numerator) : Number(numerator) / Number(denominator);
}

function isInchUnit(unit: string): boolean {
  return unit === "in" || unit.startsWith("inch");
}

function countOperationWords(prompt: string): number {
  return [...prompt.matchAll(/\b(?:make|resize|add)\b/g)].length;
}

function parsedPlan(plan: PatchPlan): PatchPlanParseResult {
  const parsed = PatchPlanSchema.safeParse(plan);
  if (parsed.success) {
    return { source: "local-parser", plan: parsed.data };
  }

  const hasDimensionIssue = parsed.error.issues.some((issue) =>
    issue.path.includes("diameterMm"),
  );
  return reject(hasDimensionIssue ? "INVALID_DIMENSION" : "UNSUPPORTED_OPERATION");
}

function reject(code: PatchPlanParseRejectionCode): PatchPlanParseResult {
  return { source: "local-parser", error: { code } };
}
