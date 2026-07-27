import { describe, expect, it, vi } from "vitest";
import bracketContext from "../fixtures/bracket-context.json";
import { OPENAI_PROVIDER_KEY_HEADER } from "@/lib/provider-keys";
import { createPlanRoute } from "@/server/openai/plan-route";
import { PlanService, type OpenAIModelAdapter } from "@/server/openai/plan-service";

const providerKey = "synthetic-openai-provider-key";

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
  version: 2,
  operation: "resize_hole",
  targetFeatureId: "hole:nw",
  diameterMm: 8,
  rationale: "Provide the requested fastener clearance.",
} as const;

const expectedValidPlan = {
  ...validPlan,
  rationale: "Resize hole:nw to 8 mm.",
} as const;

function createHandler(adapter?: OpenAIModelAdapter) {
  return createPlanRoute(
    (apiKey) =>
      new PlanService({
        configuration: adapter ? { apiKey, model: "test-model" } : undefined,
        adapter,
      }),
  );
}

function post(body: unknown) {
  return new Request("http://localhost/api/plan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [OPENAI_PROVIDER_KEY_HEADER]: providerKey,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/plan", () => {
  it("returns the exact throttle envelope without constructing a provider service", async () => {
    let factoryCalls = 0;
    let adapterCalls = 0;
    const handler = createPlanRoute(
      () => {
        factoryCalls += 1;
        return new PlanService({
          configuration: { apiKey: providerKey, model: "test-model" },
          adapter: {
            parse: async () => {
              adapterCalls += 1;
              return { parsed: validPlan };
            },
          },
        });
      },
      { acquire: () => null },
    );

    const response = await handler(post(requestBody));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: { code: "PROVIDER_THROTTLED" },
    });
    expect(factoryCalls).toBe(0);
    expect(adapterCalls).toBe(0);
  });

  it("releases an acquired provider lease after completion", async () => {
    let inFlight = false;
    let releaseCalls = 0;
    let finishFirst!: () => void;
    const firstProviderCall = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    let providerCalls = 0;
    const handler = createPlanRoute(
      () =>
        new PlanService({
          configuration: { apiKey: providerKey, model: "test-model" },
          adapter: {
            parse: async () => {
              providerCalls += 1;
              if (providerCalls === 1) await firstProviderCall;
              return { parsed: validPlan };
            },
          },
        }),
      {
        acquire: () => {
          if (inFlight) return null;
          inFlight = true;
          return {
            release: () => {
              inFlight = false;
              releaseCalls += 1;
            },
          };
        },
      },
    );

    const firstResponsePromise = handler(post(requestBody));
    await vi.waitFor(() => expect(providerCalls).toBe(1));

    const throttledResponse = await handler(post(requestBody));
    expect(throttledResponse.status).toBe(429);

    finishFirst();
    const firstResponse = await firstResponsePromise;
    expect(firstResponse.status).toBe(200);
    expect(releaseCalls).toBe(1);

    const subsequentResponse = await handler(post(requestBody));
    expect(subsequentResponse.status).toBe(200);
    expect(providerCalls).toBe(2);
    expect(releaseCalls).toBe(2);
  });

  it("rejects a missing provider key before reading the stream, invoking the factory, or adapter", async () => {
    let bodyRead = false;
    let factoryCalls = 0;
    let adapterCalls = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          bodyRead = true;
          controller.enqueue(new TextEncoder().encode(JSON.stringify(requestBody)));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request("http://localhost/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const handler = createPlanRoute(() => {
      factoryCalls += 1;
      return new PlanService({
        configuration: { apiKey: "synthetic-openai-provider-key", model: "test-model" },
        adapter: {
          parse: async () => {
            adapterCalls += 1;
            return { parsed: validPlan };
          },
        },
      });
    });

    const response = await handler(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "PROVIDER_KEY_REQUIRED" },
    });
    expect(bodyRead).toBe(false);
    expect(factoryCalls).toBe(0);
    expect(adapterCalls).toBe(0);
  });

  it("passes the trimmed synthetic provider key to the service factory", async () => {
    let receivedKey: string | undefined;
    const handler = createPlanRoute((apiKey) => {
      receivedKey = apiKey;
      return new PlanService({
        configuration: { apiKey, model: "test-model" },
        adapter: { parse: async () => ({ parsed: validPlan }) },
      });
    });
    const request = post(requestBody);
    request.headers.set(OPENAI_PROVIDER_KEY_HEADER, "  synthetic-openai-provider-key  ");

    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(receivedKey).toBe("synthetic-openai-provider-key");
  });

  it("returns a provider plan only after deterministic validation accepts it", async () => {
    const handler = createHandler({ parse: async () => ({ parsed: validPlan }) });

    const response = await handler(post(requestBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: expectedValidPlan, source: "openai" });
  });

  it.each([
    {
      name: "resize plan",
      request: requestBody,
      providerPlan: {
        ...validPlan,
        rationale: "import FreeCAD; Part.makeCylinder(4, 8)",
      },
      expectedRationale: "Resize hole:nw to 8 mm.",
    },
    {
      name: "add-hole plan",
      request: {
        ...requestBody,
        prompt: "Add a 5 mm hole at the selected point.",
        selection: {
          units: "mm",
          editableFeatureIds: [],
          editableFaceIds: ["face:top"],
          pointMm: { x: 50, y: 32, z: 0 },
        },
      },
      providerPlan: {
        version: 2,
        operation: "add_hole",
        targetFaceId: "face:top",
        location: "selection",
        diameterMm: 5,
        rationale: "import cadquery as cq; cq.Workplane().hole(5)",
      },
      expectedRationale: "Add a 5 mm hole at the selected point on face:top.",
    },
  ])("replaces executable model prose in a $name with a controlled summary", async ({
    request,
    providerPlan,
    expectedRationale,
  }) => {
    const handler = createHandler({ parse: async () => ({ parsed: providerPlan }) });

    const response = await handler(post(request));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plan.rationale).toBe(expectedRationale);
    expect(JSON.stringify(body)).not.toContain("import");
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

  it("rejects an add-hole provider plan when the face selection has no picked point", async () => {
    const request = {
      ...requestBody,
      prompt: "Add a 5 mm hole at the selected point.",
      selection: {
        units: "mm",
        editableFeatureIds: [],
        editableFaceIds: ["face:top"],
      },
    };
    const providerPlan = {
      version: 2,
      operation: "add_hole",
      targetFaceId: "face:top",
      location: "selection",
      diameterMm: 5,
      rationale: "Add a centered mount.",
    };
    const handler = createHandler({ parse: async () => ({ parsed: providerPlan }) });

    const response = await handler(post(request));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { code: "AI_UNSAFE_PLAN" } });
  });

  it("rejects provider coordinates before add-hole geometry validation", async () => {
    const request = {
      ...requestBody,
      prompt: "Add a 5 mm hole at the selected point.",
      selection: {
        units: "mm",
        editableFeatureIds: [],
        editableFaceIds: ["face:top"],
        pointMm: { x: 50, y: 32, z: 0 },
      },
    };
    const providerPlan = {
      version: 2,
      operation: "add_hole",
      targetFaceId: "face:top",
      location: "selection",
      centerMm: { x: 2 ** 39, y: 2 ** 39 },
      diameterMm: 5,
      rationale: "Shift the mount.",
    };
    const handler = createHandler({ parse: async () => ({ parsed: providerPlan }) });

    const response = await handler(post(request));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { code: "AI_INVALID_RESPONSE" } });
  });

  it("returns a coordinate-free add-hole plan for the exact picked point", async () => {
    const request = {
      ...requestBody,
      prompt: "Add a 5 mm hole at the selected point.",
      selection: {
        units: "mm",
        editableFeatureIds: [],
        editableFaceIds: ["face:top"],
        pointMm: { x: 50.123456, y: 32.654321, z: 0 },
      },
    };
    const providerPlan = {
      version: 2,
      operation: "add_hole",
      targetFaceId: "face:top",
      location: "selection",
      diameterMm: 5,
      rationale: "Add the requested mount.",
    };
    const handler = createHandler({ parse: async () => ({ parsed: providerPlan }) });

    const response = await handler(post(request));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      source: "openai",
      plan: {
        ...providerPlan,
        rationale: "Add a 5 mm hole at the selected point on face:top.",
      },
    });
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
    [
      "malformed JSON",
      new Request("http://localhost/api/plan", {
        method: "POST",
        headers: { [OPENAI_PROVIDER_KEY_HEADER]: providerKey },
        body: "{",
      }),
    ],
    ["an oversized prompt", post({ ...requestBody, prompt: "x".repeat(501) })],
  ])("rejects %s requests with a public bad-request envelope", async (_name, request) => {
    const response = await createHandler({ parse: async () => ({ parsed: validPlan }) })(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_REQUEST" } });
  });

  it("rejects a body whose declared size exceeds the route limit before provider use", async () => {
    const request = post(requestBody);
    request.headers.set("content-length", "70000");
    const handler = createHandler({
      parse: async () => {
        throw new Error("provider must not be called for an oversized request");
      },
    });

    const response = await handler(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_REQUEST" } });
  });

  it.each([
    ["a missing Content-Length", undefined],
    ["a falsified Content-Length", "10"],
  ])("rejects an oversized selection body with %s before provider use", async (_name, length) => {
    const oversizedSelectionRequest = post({
      ...requestBody,
      selection: {
        ...requestBody.selection,
        editableFeatureIds: [
          "hole:nw",
          ...Array.from({ length: 6_000 }, (_, index) => `hole:extra-${index}`),
        ],
      },
    });
    if (length) oversizedSelectionRequest.headers.set("content-length", length);
    const handler = createHandler({
      parse: async () => {
        throw new Error("provider must not be called for an oversized request");
      },
    });

    const response = await handler(oversizedSelectionRequest);

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
