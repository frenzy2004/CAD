import "server-only";

import { getExaConfiguration, getOpenAIConfiguration } from "@/lib/env";

export function createHealthRoute(environment: NodeJS.ProcessEnv = process.env) {
  return function GET(): Response {
    return Response.json(
      {
        status: "ok",
        cadRuntime: "browser-wasm",
        openaiConfigured: Boolean(getOpenAIConfiguration(environment)),
        exaConfigured: Boolean(getExaConfiguration(environment)),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  };
}
