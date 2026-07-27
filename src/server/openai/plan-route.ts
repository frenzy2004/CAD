import "server-only";

import { PlanRequestSchema } from "@/lib/cad/schemas";
import { OPENAI_PROVIDER_KEY_HEADER } from "@/lib/provider-keys";
import { readBoundedJson } from "@/server/http/read-bounded-json";
import {
  createProviderKeyRequiredResponse,
  readRequestProviderKey,
} from "@/server/http/request-provider-key";
import {
  providerRequestLimiter,
  type ProviderRequestLimiter,
} from "@/server/provider-request-limiter";
import type { PlanService } from "./plan-service";

function errorResponse(code: string, status: number): Response {
  return Response.json({ error: { code } }, { status });
}

export function createPlanRoute(
  createService: (apiKey: string) => PlanService,
  limiter: ProviderRequestLimiter = providerRequestLimiter,
) {
  return async function POST(request: Request): Promise<Response> {
    const apiKey = readRequestProviderKey(request, OPENAI_PROVIDER_KEY_HEADER);
    if (!apiKey) return createProviderKeyRequiredResponse();

    let json: unknown;
    try {
      json = await readBoundedJson(request);
    } catch {
      return errorResponse("INVALID_REQUEST", 400);
    }

    const parsed = PlanRequestSchema.safeParse(json);
    if (!parsed.success) return errorResponse("INVALID_REQUEST", 400);

    const lease = limiter.acquire(request);
    if (!lease) return errorResponse("PROVIDER_THROTTLED", 429);

    try {
      const service = createService(apiKey);
      const result = await service.createPlan(parsed.data);
      if (result.ok) return Response.json({ plan: result.plan, source: "openai" });

      if (result.code === "AI_NOT_CONFIGURED") return errorResponse(result.code, 503);
      if (result.code === "AI_UNAVAILABLE") return errorResponse(result.code, 502);
      return errorResponse(result.code, 422);
    } finally {
      lease.release();
    }
  };
}
