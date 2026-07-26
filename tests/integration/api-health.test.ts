import { describe, expect, it } from "vitest";
import { createHealthRoute } from "@/server/health/health-route";

describe("GET /api/health", () => {
  it("reports the browser CAD runtime without exposing credential values", async () => {
    const GET = createHealthRoute({
      OPENAI_API_KEY: "openai-test-value",
      EXA_API_KEY: "exa-test-value",
    });

    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(JSON.parse(text)).toEqual({
      status: "ok",
      cadRuntime: "browser-wasm",
      openaiConfigured: true,
      exaConfigured: true,
    });
    expect(text).not.toContain("openai-test-value");
    expect(text).not.toContain("exa-test-value");
  });

  it("reports missing provider configuration honestly", async () => {
    const GET = createHealthRoute({});
    const response = GET();

    await expect(response.json()).resolves.toEqual({
      status: "ok",
      cadRuntime: "browser-wasm",
      openaiConfigured: false,
      exaConfigured: false,
    });
  });
});
