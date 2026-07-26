import { describe, expect, it } from "vitest";

import {
  CadWorkerReplySchema,
  CadWorkerRequestSchema,
  createCadWorkerRequestId,
} from "@/lib/cad/worker-protocol";
import { createDemoBracket } from "@/lib/cad/demo-bracket";

describe("CAD worker protocol", () => {
  it("requires a unique UUID request ID", () => {
    const firstId = createCadWorkerRequestId();
    const secondId = createCadWorkerRequestId();

    expect(firstId).not.toBe(secondId);
    expect(
      CadWorkerRequestSchema.safeParse({
        id: "",
        type: "initialize",
      }).success,
    ).toBe(false);
    expect(
      CadWorkerRequestSchema.parse({
        id: firstId,
        type: "build",
        snapshot: createDemoBracket(),
      }),
    ).toEqual({
      id: firstId,
      type: "build",
      snapshot: createDemoBracket(),
    });
  });

  it("rejects unknown message types and extra fields", () => {
    const id = createCadWorkerRequestId();

    expect(
      CadWorkerRequestSchema.safeParse({
        id,
        type: "run-arbitrary-cad-code",
      }).success,
    ).toBe(false);
    expect(
      CadWorkerRequestSchema.safeParse({
        id,
        type: "initialize",
        source: "server",
      }).success,
    ).toBe(false);
  });

  it("accepts a transferable built mesh with finite geometry and semantic anchors", () => {
    const id = createCadWorkerRequestId();
    const reply = CadWorkerReplySchema.parse({
      id,
      type: "mesh",
      mesh: {
        source: "bracket",
        positions: new Float32Array([
          0, 0, 0,
          10, 0, 0,
          0, 10, 0,
        ]),
        indices: new Uint32Array([0, 1, 2]),
        normals: new Float32Array([
          0, 0, 1,
          0, 0, 1,
          0, 0, 1,
        ]),
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 10, y: 10, z: 0 },
        },
        faceGroups: [{ start: 0, count: 3, faceId: 101 }],
        holeAnchors: [
          {
            featureId: "hole:nw",
            pointMm: { x: 2, y: 8, z: 0 },
            diameterMm: 4,
          },
        ],
      },
    });

    expect(reply.type).toBe("mesh");
    if (reply.type !== "mesh") throw new Error("Expected a mesh reply");

    expect([...reply.mesh.positions].every(Number.isFinite)).toBe(true);
    expect([...reply.mesh.normals].every(Number.isFinite)).toBe(true);
    expect([...reply.mesh.indices]).toEqual([0, 1, 2]);
    expect(reply.mesh.indices.length % 3).toBe(0);
    expect(reply.mesh.bounds).toEqual({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 10, z: 0 },
    });
    expect(reply.mesh.holeAnchors).toEqual([
      {
        featureId: "hole:nw",
        pointMm: { x: 2, y: 8, z: 0 },
        diameterMm: 4,
      },
    ]);
  });

  it.each([
    {
      name: "non-finite positions",
      change: { positions: new Float32Array([0, 0, Number.NaN]) },
    },
    {
      name: "non-triangle indices",
      change: { indices: new Uint32Array([0, 1]) },
    },
    {
      name: "an out-of-range triangle index",
      change: { indices: new Uint32Array([0, 1, 4]) },
    },
    {
      name: "a missing semantic anchor",
      change: { holeAnchors: [] },
    },
  ])("rejects a built mesh with $name", ({ change }) => {
    const mesh = {
      source: "bracket" as const,
      positions: new Float32Array([
        0, 0, 0,
        10, 0, 0,
        0, 10, 0,
      ]),
      indices: new Uint32Array([0, 1, 2]),
      normals: new Float32Array([
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
      ]),
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 10, y: 10, z: 0 },
      },
      faceGroups: [{ start: 0, count: 3, faceId: 101 }],
      holeAnchors: [
        {
          featureId: "hole:nw",
          pointMm: { x: 2, y: 8, z: 0 },
          diameterMm: 4,
        },
      ],
      ...change,
    };

    expect(
      CadWorkerReplySchema.safeParse({
        id: createCadWorkerRequestId(),
        type: "mesh",
        mesh,
      }).success,
    ).toBe(false);
  });
});
