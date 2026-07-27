import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { PatchPlanSchema } from "@/lib/cad/schemas";
import type { OpenAIConfiguration } from "@/lib/env";
import type { OpenAIModelAdapter } from "./plan-service";

export function createOpenAIModelAdapter(configuration: OpenAIConfiguration): OpenAIModelAdapter {
  const openai = new OpenAI({ apiKey: configuration.apiKey });

  return {
    async parse({ input }) {
      const response = await openai.responses.parse({
        model: configuration.model,
        input,
        text: { format: zodTextFormat(PatchPlanSchema, "patch_plan") },
      });

      return {
        parsed: response.output_parsed,
        refusal: response.output.some(
          (item) =>
            item.type === "message" &&
            item.content.some((content) => content.type === "refusal"),
        ),
        status: response.status,
      };
    },
  };
}
