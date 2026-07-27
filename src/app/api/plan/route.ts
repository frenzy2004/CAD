import "server-only";

import { getOpenAIModel } from "@/lib/env";
import { createOpenAIModelAdapter } from "@/server/openai/client";
import { createPlanRoute } from "@/server/openai/plan-route";
import { PlanService } from "@/server/openai/plan-service";

const model = getOpenAIModel();

export const maxDuration = 15;

export const POST = createPlanRoute((apiKey) => {
  const configuration = { apiKey, model };
  return new PlanService({
    configuration,
    adapter: createOpenAIModelAdapter(configuration),
  });
});
