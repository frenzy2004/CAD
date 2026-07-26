import { describe, expect, it } from "vitest";
import bracketContext from "../fixtures/bracket-context.json";
import { createPlanRoute } from "@/app/api/plan/route";
import { PlanService, type OpenAIModelAdapter } from "@/server/openai/plan-service";

const requestBody = {
  prompt: "Increase the selected hole to 8 mm.",
  snapshot: bracketContext,
  selection: {
    units: "mm",
    editableFeatureIds: ["hole:nw"],
    editableFaceIds: [],
    pointMm: { x: 12, y: 52, z: 0 },
  },
};

const validPlan = {
  version: 1,
  operation: "resize_hole",
  targetFeatureId: "hole:nw",
  diameterMm: 8,
  rationale: "Provide the requested fastener clearance.",
} as const;

function createHandler(adapter?: OpenAIModelAdapter) {
  return createPlanRoute(
    new PlanService({
      configuration: adapter ? { apiKey: "provider-test-key", model: "test-model" } : undefined,
      adapter,
    }),
  );
}

function post(body: unknown) {
  return new Request("http://localhost/api/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/plan", () => {
  it("returns a provider plan only after deterministic validation accepts it", async () => {
    const handler = createHandler({ parse: async () => ({ parsed: validPlan }) });

    const response = await handler(post(requestBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: validPlan, source: "openai" });
  });

  it.each([
    {
      name: "schema-invalid model output",
      result: { parsed: { ...validPlan, diameterMm: 99 } },
      expectedCode: "AI_INVALID_RESPONSE",
    },
    {
      name: "a refusal",
      result: { refusal: "I cannot help with that." },
      expectedCode: "AI_REFUSAL",
    },
    {
      name: "an incomplete provider response",
      result: { status: "incomplete" as const },
      expectedCode: "AI_INCOMPLETE",
    },
    {
      name: "a plan that targets a protected feature",
      result: { parsed: { ...validPlan, targetFeatureId: "hole:ne" } },
      expectedCode: "AI_UNSAFE_PLAN",
    },
  ])("returns a safe failure for $name", async ({ result, expectedCode }) => {
    const handler = createHandler({ parse: async () => result });

    const response = await handler(post(requestBody));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { code: expectedCode } });
  });

  it("returns AI_NOT_CONFIGURED without serializing a provider secret", async () => {
    const handler = createHandler();

    const response = await handler(post(requestBody));
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({ error: { code: "AI_NOT_CONFIGURED" } });
    expect(body).not.toContain("provider-test-key");
  });

  it.each([
    ["malformed JSON", new Request("http://localhost/api/plan", { method: "POST", body: "{" })],
    ["an oversized prompt", post({ ...requestBody, prompt: "x".repeat(501) })],
  ])("rejects %s requests with a public bad-request envelope", async (_name, request) => {
    const response = await createHandler({ parse: async () => ({ parsed: validPlan }) })(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_REQUEST" } });
  });

  it("does not serialize provider exception details", async () => {
    const handler = createHandler({
      parse: async () => {
        throw new Error("Authorization failed for provider-test-key");
      },
    });

    const response = await handler(post(requestBody));
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(body)).toEqual({ error: { code: "AI_UNAVAILABLE" } });
    expect(body).not.toContain("provider-test-key");
  });
});
