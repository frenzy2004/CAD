import { describe, expect, it, vi } from "vitest";

import {
  JSON_MIME_TYPE,
  STEP_MIME_TYPE,
  createPatchAuditJson,
  downloadArtifact,
  hashBracketSnapshot,
  safeDownloadFilename,
} from "@/lib/download";
import { createDemoBracket } from "@/lib/cad/demo-bracket";
import type {
  PatchPlan,
  SelectionEnvelope,
  VerificationReport,
} from "@/lib/cad/schemas";

const selection: SelectionEnvelope = {
  units: "mm",
  editableFeatureIds: ["hole:nw"],
  editableFaceIds: [],
};

const plan: PatchPlan = {
  version: 1,
  operation: "resize_hole",
  targetFeatureId: "hole:nw",
  diameterMm: 8,
  rationale: "Resize selected hole to 8 mm.",
};

const verification: VerificationReport = {
  validSolid: true,
  targetChanged: true,
  protectedFeaturesUnchanged: true,
  protectedFingerprints: [],
  violations: [],
};

describe("download artifacts", () => {
  it.each([
    ["../../unsafe bracket.step", "unsafe-bracket.step"],
    ["  patchcad bracket  ", "patchcad-bracket.step"],
    [".hidden", "hidden.step"],
    ["", "patchcad-bracket.step"],
  ])("normalizes %j to a safe STEP filename", (input, expected) => {
    expect(safeDownloadFilename(input, "patchcad-bracket", ".step")).toBe(expected);
  });

  it("rejects an extension outside the two fixed artifact formats", () => {
    expect(() =>
      safeDownloadFilename(
        "bracket",
        "patchcad-bracket",
        ".step/../../unsafe" as never,
      ),
    ).toThrow("extension");
  });

  it("uses the exact STEP and JSON MIME types and always revokes the object URL", () => {
    const anchor = {
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
    };
    const environment = {
      createObjectURL: vi.fn(() => "blob:patchcad"),
      revokeObjectURL: vi.fn(),
      createAnchor: vi.fn(() => anchor),
    };

    const stepResult = downloadArtifact(
      {
        filename: "patchcad-bracket.step",
        mimeType: STEP_MIME_TYPE,
        data: new Uint8Array([1, 2, 3]),
      },
      environment,
    );

    expect(stepResult).toEqual({
      filename: "patchcad-bracket.step",
      mimeType: STEP_MIME_TYPE,
      byteLength: 3,
    });
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(environment.createObjectURL).toHaveBeenCalledOnce();
    expect(environment.createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(environment.createObjectURL.mock.calls[0][0].type).toBe(STEP_MIME_TYPE);
    expect(environment.revokeObjectURL).toHaveBeenCalledWith("blob:patchcad");

    downloadArtifact(
      {
        filename: "patchcad-audit.json",
        mimeType: JSON_MIME_TYPE,
        data: "{}",
      },
      environment,
    );
    expect(environment.createObjectURL.mock.calls[1][0].type).toBe(JSON_MIME_TYPE);
  });

  it("revokes the object URL even when the browser click fails", () => {
    const remove = vi.fn();
    const environment = {
      createObjectURL: vi.fn(() => "blob:failed"),
      revokeObjectURL: vi.fn(),
      createAnchor: vi.fn(() => ({
        href: "",
        download: "",
        click: vi.fn(() => {
          throw new Error("blocked");
        }),
        remove,
      })),
    };

    expect(() =>
      downloadArtifact(
        {
          filename: "patchcad-bracket.step",
          mimeType: STEP_MIME_TYPE,
          data: new Uint8Array([1]),
        },
        environment,
      ),
    ).toThrow("blocked");
    expect(remove).toHaveBeenCalledOnce();
    expect(environment.revokeObjectURL).toHaveBeenCalledWith("blob:failed");
  });

  it("still revokes the object URL when anchor cleanup fails", () => {
    const environment = {
      createObjectURL: vi.fn(() => "blob:cleanup-failed"),
      revokeObjectURL: vi.fn(),
      createAnchor: vi.fn(() => ({
        href: "",
        download: "",
        click: vi.fn(),
        remove: vi.fn(() => {
          throw new Error("remove failed");
        }),
      })),
    };

    expect(() =>
      downloadArtifact(
        {
          filename: "patchcad-audit.json",
          mimeType: JSON_MIME_TYPE,
          data: "{}",
        },
        environment,
      ),
    ).toThrow("remove failed");
    expect(environment.revokeObjectURL).toHaveBeenCalledWith("blob:cleanup-failed");
  });

  it("serializes only the typed audit boundary with hashes and UTC timestamp", () => {
    const json = createPatchAuditJson(
      {
        beforeHash: "a".repeat(64),
        afterHash: "b".repeat(64),
        before: createDemoBracket(),
        after: {
          ...createDemoBracket(),
          holes: createDemoBracket().holes.map((hole) =>
            hole.id === "hole:nw" ? { ...hole, diameterMm: 8 } : hole,
          ),
        },
        selection,
        planSource: "openai",
        plan,
        verification,
        providerHeaders: { authorization: "Bearer must-not-leak" },
      } as never,
      new Date("2026-07-26T12:34:56.000Z"),
    );

    const parsedAudit = JSON.parse(json);
    expect(Object.keys(parsedAudit)).toEqual([
      "schemaVersion",
      "beforeHash",
      "afterHash",
      "selection",
      "planSource",
      "plan",
      "verification",
      "timestamp",
    ]);
    expect(parsedAudit).toEqual({
      schemaVersion: 1,
      beforeHash: "a".repeat(64),
      afterHash: "b".repeat(64),
      selection,
      planSource: "openai",
      plan,
      verification,
      timestamp: "2026-07-26T12:34:56.000Z",
    });
    expect(json).not.toContain("authorization");
    expect(json).not.toContain("must-not-leak");
  });

  it("rejects an unrecognized plan source at the runtime audit boundary", () => {
    expect(() =>
      createPatchAuditJson({
        beforeHash: "a".repeat(64),
        afterHash: "b".repeat(64),
        selection,
        planSource: "provider-header" as never,
        plan,
        verification,
      }),
    ).toThrow();
  });

  it("hashes validated bracket content deterministically by semantic hole ID", async () => {
    const bracket = createDemoBracket();
    const reordered = {
      ...bracket,
      holes: [...bracket.holes].reverse(),
    };
    const changed = {
      ...bracket,
      holes: bracket.holes.map((hole) =>
        hole.id === "hole:nw" ? { ...hole, diameterMm: 8 } : hole,
      ),
    };

    const beforeHash = await hashBracketSnapshot(bracket);

    expect(beforeHash).toMatch(/^[0-9a-f]{64}$/);
    await expect(hashBracketSnapshot(reordered)).resolves.toBe(beforeHash);
    await expect(hashBracketSnapshot(changed)).resolves.not.toBe(beforeHash);
  });

  it("rejects duplicate semantic hole IDs before hashing", async () => {
    const bracket = createDemoBracket();
    const duplicateIds = {
      ...bracket,
      holes: [
        bracket.holes[0],
        { ...bracket.holes[1], id: bracket.holes[0].id },
      ],
    };

    await expect(hashBracketSnapshot(duplicateIds)).rejects.toThrow(
      "unique semantic IDs",
    );
  });
});
