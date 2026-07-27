import "server-only";

import { createExaAdapter } from "@/server/exa/client";
import { createResearchRoute } from "@/server/exa/research-route";
import { ResearchService } from "@/server/exa/research-service";

export const maxDuration = 15;

export const POST = createResearchRoute((apiKey) => {
  const configuration = { apiKey };
  return new ResearchService({
    configuration,
    adapter: createExaAdapter(configuration),
  });
});
