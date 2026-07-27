import { beforeEach, describe, expect, it, vi } from "vitest";

const openAIMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  parse: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { parse: openAIMocks.parse };

    constructor(options: unknown) {
      openAIMocks.constructor(options);
    }
  },
}));

vi.mock("openai/helpers/zod", () => ({
  zodTextFormat: () => ({ type: "json_schema", name: "patch_plan" }),
}));

import { createOpenAIModelAdapter } from "@/server/openai/client";

describe("OpenAI provider client bounds", () => {
  beforeEach(() => {
    openAIMocks.constructor.mockReset();
    openAIMocks.parse.mockReset();
    openAIMocks.parse.mockResolvedValue({
      output_parsed: undefined,
      output: [],
      status: "completed",
    });
  });

  it("uses a finite timeout, disables SDK retries, and caps response tokens", async () => {
    const adapter = createOpenAIModelAdapter({
      apiKey: "synthetic-openai-provider-key",
      model: "test-model",
    });

    await adapter.parse({ model: "test-model", input: "bounded prompt" });

    expect(openAIMocks.constructor).toHaveBeenCalledWith({
      apiKey: "synthetic-openai-provider-key",
      timeout: 12_000,
      maxRetries: 0,
    });
    expect(openAIMocks.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        input: "bounded prompt",
        max_output_tokens: 1_200,
      }),
    );
  });
});
