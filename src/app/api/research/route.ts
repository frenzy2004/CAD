import "server-only";

import { ResearchRequestSchema } from "@/lib/cad/schemas";
import { getExaConfiguration } from "@/lib/env";
import { createExaAdapter } from "@/server/exa/client";
import { ResearchService } from "@/server/exa/research-service";

function errorResponse(code: string, status: number): Response {
  return Response.json({ error: { code } }, { status });
}

export function createResearchRoute(service: ResearchService) {
  return async function POST(request: Request): Promise<Response> {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return errorResponse("INVALID_REQUEST", 400);
    }

    const parsed = ResearchRequestSchema.safeParse(json);
    if (!parsed.success) return errorResponse("INVALID_REQUEST", 400);

    const result = await service.research(parsed.data);
    if (result.ok) return Response.json({ sources: result.sources });
    if (result.code === "RESEARCH_NOT_CONFIGURED") return errorResponse(result.code, 503);
    return errorResponse(result.code, 502);
  };
}

const configuration = getExaConfiguration();
const defaultService = new ResearchService({
  configuration,
  adapter: configuration ? createExaAdapter(configuration) : undefined,
});

export const POST = createResearchRoute(defaultService);
