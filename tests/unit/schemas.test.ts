import { describe, expect, it } from "vitest";
import * as schemas from "@/lib/cad/schemas";

describe("CAD schema module", () => {
  it("is available for CAD contract consumers", () => {
    expect(schemas).toBeDefined();
  });
});
