import "server-only";

import { getOpenAIConfiguration } from "@/lib/env";
import { PlanRequestSchema } from "@/lib/cad/schemas";
import { readBoundedJson } from "@/server/http/read-bounded-json";
import { createOpenAIModelAdapter } from "@/server/openai/client";
import { PlanService } from "@/server/openai/plan-service";

function errorResponse(code: string, status: number): Response {
  return Response.json({ error: { code } }, { status });
}

export function createPlanRoute(service: PlanService) {
  return async function POST(request: Request): Promise<Response> {
    let json: unknown;
    try {
      json = await readBoundedJson(request);
    } catch {
      return errorResponse("INVALID_REQUEST", 400);
    }

    const parsed = PlanRequestSchema.safeParse(json);
    if (!parsed.success) return errorResponse("INVALID_REQUEST", 400);

    const result = await service.createPlan(parsed.data);
    if (result.ok) return Response.json({ plan: result.plan, source: "openai" });

    if (result.code === "AI_NOT_CONFIGURED") return errorResponse(result.code, 503);
    if (result.code === "AI_UNAVAILABLE") return errorResponse(result.code, 502);
    return errorResponse(result.code, 422);
  };
}

const configuration = getOpenAIConfiguration();
const defaultService = new PlanService({
  configuration,
  adapter: configuration ? createOpenAIModelAdapter(configuration) : undefined,
});

export const POST = createPlanRoute(defaultService);
