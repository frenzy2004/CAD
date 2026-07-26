import "server-only";

import { validatePlan } from "@/lib/cad/patch-engine";
import { PatchPlanSchema } from "@/lib/cad/schemas";
import type { PatchPlan, PlanRequest } from "@/lib/cad/schemas";
import type { OpenAIConfiguration } from "@/lib/env";
import { buildPlanPrompt } from "./plan-prompt";

export type OpenAIModelResult = {
  parsed?: unknown;
  refusal?: boolean | string | null;
  status?: "completed" | "incomplete" | "failed" | "in_progress" | string;
};

export type OpenAIModelAdapter = {
  parse(input: { model: string; input: string }): Promise<OpenAIModelResult>;
};

export type PlanServiceResult =
  | { ok: true; plan: PatchPlan }
  | {
      ok: false;
      code:
        | "AI_NOT_CONFIGURED"
        | "AI_REFUSAL"
        | "AI_INCOMPLETE"
        | "AI_INVALID_RESPONSE"
        | "AI_UNSAFE_PLAN"
        | "AI_UNAVAILABLE";
    };

export class PlanService {
  constructor(
    private readonly dependencies: {
      configuration?: OpenAIConfiguration;
      adapter?: OpenAIModelAdapter;
    },
  ) {}

  async createPlan(request: PlanRequest): Promise<PlanServiceResult> {
    const { configuration, adapter } = this.dependencies;
    if (!configuration || !adapter) return { ok: false, code: "AI_NOT_CONFIGURED" };

    let modelResult: OpenAIModelResult;
    try {
      modelResult = await adapter.parse({
        model: configuration.model,
        input: buildPlanPrompt(request),
      });
    } catch {
      return { ok: false, code: "AI_UNAVAILABLE" };
    }

    if (modelResult.refusal) return { ok: false, code: "AI_REFUSAL" };
    if (modelResult.status === "incomplete") return { ok: false, code: "AI_INCOMPLETE" };

    const parsed = PatchPlanSchema.safeParse(modelResult.parsed);
    if (!parsed.success) return { ok: false, code: "AI_INVALID_RESPONSE" };

    const validation = validatePlan({
      before: request.snapshot,
      selection: request.selection,
      plan: parsed.data,
    });
    if (!validation.valid) return { ok: false, code: "AI_UNSAFE_PLAN" };

    return { ok: true, plan: parsed.data };
  }
}
