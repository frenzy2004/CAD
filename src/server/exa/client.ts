import "server-only";

import Exa from "exa-js";

import type { ExaConfiguration } from "@/lib/env";
import type { ExaAdapter } from "./research-service";

export function createExaAdapter(configuration: ExaConfiguration): ExaAdapter {
  const exa = new Exa(configuration.apiKey);

  return {
    async searchAndContents(input) {
      const response = await exa.searchAndContents(input.query, {
        type: input.type,
        numResults: input.numResults,
        text: input.text,
      });

      return {
        results: response.results.map((result) => ({
          title: result.title,
          url: result.url,
          text: result.text,
        })),
      };
    },
  };
}
