import "server-only";

import { getOpenAIConfiguration } from "@/lib/env";
import { createOpenAIModelAdapter } from "@/server/openai/client";
import { createPlanRoute } from "@/server/openai/plan-route";
import { PlanService } from "@/server/openai/plan-service";

const configuration = getOpenAIConfiguration();
const defaultService = new PlanService({
  configuration,
  adapter: configuration ? createOpenAIModelAdapter(configuration) : undefined,
});

export const POST = createPlanRoute(defaultService);
