import "server-only";

import { ResearchRequestSchema } from "@/lib/cad/schemas";
import { EXA_PROVIDER_KEY_HEADER } from "@/lib/provider-keys";
import { readBoundedJson } from "@/server/http/read-bounded-json";
import {
  createProviderKeyRequiredResponse,
  readRequestProviderKey,
} from "@/server/http/request-provider-key";
import {
  providerRequestLimiter,
  type ProviderRequestLimiter,
} from "@/server/provider-request-limiter";
import type { ResearchService } from "./research-service";

function errorResponse(code: string, status: number): Response {
  return Response.json({ error: { code } }, { status });
}

export function createResearchRoute(
  createService: (apiKey: string) => ResearchService,
  limiter: ProviderRequestLimiter = providerRequestLimiter,
) {
  return async function POST(request: Request): Promise<Response> {
    const apiKey = readRequestProviderKey(request, EXA_PROVIDER_KEY_HEADER);
    if (!apiKey) return createProviderKeyRequiredResponse();

    let json: unknown;
    try {
      json = await readBoundedJson(request);
    } catch {
      return errorResponse("INVALID_REQUEST", 400);
    }

    const parsed = ResearchRequestSchema.safeParse(json);
    if (!parsed.success) return errorResponse("INVALID_REQUEST", 400);

    const lease = limiter.acquire(request);
    if (!lease) return errorResponse("PROVIDER_THROTTLED", 429);

    try {
      const service = createService(apiKey);
      const result = await service.research(parsed.data);
      if (result.ok) return Response.json({ sources: result.sources });
      if (result.code === "RESEARCH_NOT_CONFIGURED") return errorResponse(result.code, 503);
      return errorResponse(result.code, 502);
    } finally {
      lease.release();
    }
  };
}
