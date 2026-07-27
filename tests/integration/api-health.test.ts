import { describe, expect, it } from "vitest";
import { createHealthRoute } from "@/server/health/health-route";

describe("GET /api/health", () => {
  it("reports static BYOK provider status regardless of legacy provider variables", async () => {
    const response = await createHealthRoute({
      OPENAI_API_KEY: "synthetic",
    })();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      status: "ok",
      cadRuntime: "browser-wasm",
      providers: { openai: "byok", exa: "byok" },
    });
  });
});
