import { describe, expect, it } from "vitest";

import {
  CadWorkerReplySchema,
  CadWorkerRequestSchema,
  createCadWorkerDispatcher,
  createCadWorkerRequestId,
  type CadWorkerReply,
} from "@/lib/cad/worker-protocol";
import { createDemoBracket } from "@/lib/cad/demo-bracket";

function validBuiltMesh() {
  return {
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
  };
}

function dispatcherErrorReply(id: string, error: unknown): CadWorkerReply {
  return {
    id,
    type: "error",
    code: "TEST_HANDLER_ERROR",
    message: error instanceof Error ? error.message : "Unknown handler error",
  };
}

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
      mesh: validBuiltMesh(),
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
      name: "non-finite normals",
      change: {
        normals: new Float32Array([
          0, 0, 1,
          0, Number.NaN, 1,
          0, 0, 1,
        ]),
      },
    },
    {
      name: "inverted bounds",
      change: {
        bounds: {
          min: { x: 11, y: 0, z: 0 },
          max: { x: 10, y: 10, z: 0 },
        },
      },
    },
    {
      name: "a missing semantic anchor",
      change: { holeAnchors: [] },
    },
  ])("rejects a built mesh with $name", ({ change }) => {
    const mesh = {
      ...validBuiltMesh(),
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

  it.each([
    {
      name: "a non-triangle-aligned start",
      faceGroups: [
        { start: 1, count: 3, faceId: 101 },
        { start: 4, count: 3, faceId: 102 },
      ],
    },
    {
      name: "a non-triangle-aligned count",
      faceGroups: [
        { start: 0, count: 4, faceId: 101 },
        { start: 4, count: 2, faceId: 102 },
      ],
    },
    {
      name: "overlapping ranges",
      faceGroups: [
        { start: 0, count: 3, faceId: 101 },
        { start: 0, count: 3, faceId: 102 },
      ],
    },
    {
      name: "a gap in the triangle stream",
      faceGroups: [{ start: 0, count: 3, faceId: 101 }],
    },
    {
      name: "an out-of-range count",
      faceGroups: [{ start: 0, count: 9, faceId: 101 }],
    },
  ])("rejects face groups with $name", ({ faceGroups }) => {
    const mesh = {
      ...validBuiltMesh(),
      positions: new Float32Array([
        0, 0, 0,
        10, 0, 0,
        0, 10, 0,
        10, 10, 0,
      ]),
      indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
      normals: new Float32Array([
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
      ]),
      faceGroups,
    };

    expect(
      CadWorkerReplySchema.safeParse({
        id: createCadWorkerRequestId(),
        type: "mesh",
        mesh,
      }).success,
    ).toBe(false);
  });

  it("correlates an invalid request error to a supplied valid UUID", async () => {
    const id = createCadWorkerRequestId();
    const replies: CadWorkerReply[] = [];
    const dispatcher = createCadWorkerDispatcher({
      handleRequest: async () => {
        throw new Error("Invalid requests must not reach the kernel");
      },
      postReply: (reply) => replies.push(reply),
      errorReply: dispatcherErrorReply,
    });

    await dispatcher.dispatch({
      id,
      type: "run-arbitrary-cad-code",
    });

    expect(replies).toEqual([
      {
        id,
        type: "error",
        code: "INVALID_REQUEST",
        message: "The CAD worker rejected an invalid protocol message.",
      },
    ]);
  });

  it("uses a fresh valid correlation ID when an invalid request has none", async () => {
    const replies: CadWorkerReply[] = [];
    const dispatcher = createCadWorkerDispatcher({
      handleRequest: async () => {
        throw new Error("Invalid requests must not reach the kernel");
      },
      postReply: (reply) => replies.push(reply),
      errorReply: dispatcherErrorReply,
    });

    await dispatcher.dispatch({
      id: "not-a-uuid",
      type: "run-arbitrary-cad-code",
    });

    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      type: "error",
      code: "INVALID_REQUEST",
    });
    expect(
      CadWorkerReplySchema.safeParse(replies[0]).success,
    ).toBe(true);
    expect(replies[0].id).not.toBe("not-a-uuid");
  });

  it("serializes overlapping exact-kernel operations in arrival order", async () => {
    const firstId = createCadWorkerRequestId();
    const secondId = createCadWorkerRequestId();
    const started: string[] = [];
    const replies: CadWorkerReply[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const dispatcher = createCadWorkerDispatcher({
      handleRequest: async (request) => {
        started.push(request.id);
        if (request.id === firstId) await firstGate;
        return { id: request.id, type: "ready" };
      },
      postReply: (reply) => replies.push(reply),
      errorReply: dispatcherErrorReply,
    });

    const firstRun = dispatcher.dispatch({
      id: firstId,
      type: "build",
      snapshot: createDemoBracket(),
    });
    const secondRun = dispatcher.dispatch({
      id: secondId,
      type: "build",
      snapshot: createDemoBracket(),
    });
    await Promise.resolve();

    expect(started).toEqual([firstId]);

    releaseFirst?.();
    await Promise.all([firstRun, secondRun]);

    expect(started).toEqual([firstId, secondId]);
    expect(replies.map((reply) => reply.id)).toEqual([firstId, secondId]);
  });
});
