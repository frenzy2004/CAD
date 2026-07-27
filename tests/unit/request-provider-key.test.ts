import { describe, expect, it } from "vitest";
import { OPENAI_PROVIDER_KEY_HEADER } from "@/lib/provider-keys";
import { readRequestProviderKey } from "@/server/http/request-provider-key";

function request(key?: string): Request {
  const headers = new Headers();
  if (key !== undefined) headers.set(OPENAI_PROVIDER_KEY_HEADER, key);
  return new Request("http://localhost/api/plan", { headers });
}

describe("readRequestProviderKey", () => {
  it("returns a trimmed provider key within the allowed boundary", () => {
    expect(readRequestProviderKey(request("  synthetic-openai-key  "), OPENAI_PROVIDER_KEY_HEADER)).toBe(
      "synthetic-openai-key",
    );
  });

  it.each([
    ["a missing key", undefined],
    ["a blank key", "   "],
    ["a 1025-character key", "x".repeat(1025)],
  ])("rejects %s", (_name, key) => {
    expect(readRequestProviderKey(request(key), OPENAI_PROVIDER_KEY_HEADER)).toBeUndefined();
  });
});
