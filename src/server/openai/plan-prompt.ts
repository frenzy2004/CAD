import "server-only";

import type { PlanRequest } from "@/lib/cad/schemas";

export function buildPlanPrompt(request: PlanRequest): string {
  return [
    "Produce one safe local CAD patch plan.",
    "Success means the operation is in the supplied schema, targets only the selected feature or selected top-face point, preserves millimetres, and does not infer missing geometry. Refuse unsupported edits. Never output executable CAD code.",
    'For add_hole, output targetFaceId "face:top" and location "selection". Never output centerMm or any coordinates; the selected point is supplied separately.',
    "\nRequest:",
    JSON.stringify(request),
  ].join("\n");
}
