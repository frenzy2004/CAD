import { describe, expect, it } from "vitest";

import { validateNativeSmokeOutput } from "../../scripts/run-freecad-native-smoke.mjs";

describe("native FreeCAD smoke runner", () => {
  it("rejects a case-insensitive post-marker FreeCAD exception", () => {
    expect(
      validateNativeSmokeOutput(
        "NATIVE_SMOKE_OK\nUnknown exception while processing file\n",
      ),
    ).toMatch(/exception/i);
  });

  it("accepts one clean native success marker", () => {
    expect(validateNativeSmokeOutput("FreeCAD 1.1.3\nNATIVE_SMOKE_OK\n")).toBeNull();
  });
});
