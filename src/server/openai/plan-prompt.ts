import "server-only";

import type { PlanRequest } from "@/lib/cad/schemas";

export function buildPlanPrompt(request: PlanRequest): string {
  return [
    "Produce one safe local CAD patch plan.",
    "Success means the operation is in the supplied schema, targets only the selected feature or selected top-face point, preserves millimetres, and does not infer missing geometry. Refuse unsupported edits. Never output executable CAD code.",
    "\nRequest:",
    JSON.stringify(request),
  ].join("\n");
}
