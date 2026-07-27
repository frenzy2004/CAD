import "server-only";

import { getExaConfiguration } from "@/lib/env";
import { createExaAdapter } from "@/server/exa/client";
import { createResearchRoute } from "@/server/exa/research-route";
import { ResearchService } from "@/server/exa/research-service";

const configuration = getExaConfiguration();
const defaultService = new ResearchService({
  configuration,
  adapter: configuration ? createExaAdapter(configuration) : undefined,
});

export const POST = createResearchRoute(defaultService);
