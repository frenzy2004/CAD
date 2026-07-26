import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CadViewportProps } from "@/components/cad/CadViewport";
import type { CadWorkerStatus } from "@/hooks/useCadWorker";
import { createDemoBracket } from "@/lib/cad/demo-bracket";
import type { BracketSnapshot } from "@/lib/cad/schemas";
import type {
  CadMesh,
  CadWorkerCommand,
  CadWorkerReply,
} from "@/lib/cad/worker-protocol";

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function meshFor(snapshot: BracketSnapshot): CadMesh {
  return {
    source: "bracket",
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    bounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 64, z: 8 },
    },
    faceGroups: [{ start: 0, count: 3, faceId: 1 }],
    holeAnchors: snapshot.holes.map((hole) => ({
      featureId: hole.id,
      pointMm: hole.centerMm,
      diameterMm: hole.diameterMm,
    })),
  };
}

const workerRequest = vi.fn(
  async (command: CadWorkerCommand): Promise<CadWorkerReply> => {
    if (command.type !== "build") {
      throw new Error(`Unexpected worker command: ${command.type}`);
    }
    return {
      id: crypto.randomUUID(),
      type: "mesh",
      mesh: meshFor(command.snapshot),
    };
  },
);
const workerInitialize = vi.fn(async () => undefined);
const workerTerminate = vi.fn();
const workerRuntime: {
  status: CadWorkerStatus;
  progress: string | null;
  error: string | null;
} = {
  status: "ready",
  progress: null,
  error: null,
};

vi.mock("@/hooks/useCadWorker", () => ({
  useCadWorker: () => ({
    ...workerRuntime,
    initialize: workerInitialize,
    request: workerRequest,
    terminate: workerTerminate,
  }),
}));

vi.mock("@/components/cad/CadViewport", () => ({
  CadViewport({
    mesh,
    onSelectionChange,
  }: CadViewportProps): ReactNode {
    const northWest = mesh.holeAnchors.find(
      (anchor) => anchor.featureId === "hole:nw",
    );

    return (
      <section aria-label="CAD viewport">
        <button
          onClick={() => {
            if (!northWest) throw new Error("Missing hole:nw anchor");
            onSelectionChange({
              units: "mm",
              editableFeatureIds: ["hole:nw"],
              editableFaceIds: [],
              pointMm: northWest.pointMm,
            });
          }}
          type="button"
        >
          Select hole:nw
        </button>
      </section>
    );
  },
}));

import { PatchWorkspace } from "@/components/workspace/PatchWorkspace";

const initialSnapshot = createDemoBracket();

beforeEach(() => {
  workerRuntime.status = "ready";
  workerRuntime.progress = null;
  workerRuntime.error = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  workerRequest.mockClear();
  workerInitialize.mockClear();
  workerTerminate.mockClear();
});

async function selectNorthWest(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Exact kernel ready", { exact: false });
  await user.click(screen.getByRole("button", { name: "Select hole:nw" }));
}

describe("PatchCAD review regressions", () => {
  it("ignores research whose JSON body finishes after selection invalidates its token", async () => {
    const researchBodyStarted = deferred<void>();
    const researchBody = deferred<unknown>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/plan") {
          return Response.json(
            { error: { code: "AI_NOT_CONFIGURED" } },
            { status: 503 },
          );
        }
        if (String(input) === "/api/research") {
          return {
            ok: true,
            json: async () => {
              researchBodyStarted.resolve();
              return researchBody.promise;
            },
          } as Response;
        }
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );
    const user = userEvent.setup();

    render(<PatchWorkspace initialSnapshot={initialSnapshot} />);
    await selectNorthWest(user);
    await user.type(
      screen.getByRole("textbox", { name: "Patch instruction" }),
      "make this hole 8 mm",
    );
    await user.click(screen.getByRole("button", { name: "Preview patch" }));
    await researchBodyStarted.promise;
    expect(screen.getByText("loading")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select hole:nw" }));
    expect(screen.getByText("idle")).toBeInTheDocument();

    await act(async () => {
      researchBody.resolve({
        sources: [
          {
            title: "Stale manufacturer drawing",
            url: "https://example.com/stale-drawing",
            excerpt: "This result belongs to the superseded selection.",
            domain: "example.com",
          },
        ],
      });
      await researchBody.promise;
    });

    await waitFor(() => {
      expect(
        screen.queryByText("Stale manufacturer drawing"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("idle")).toBeInTheDocument();
    });
  });

  it("does not report the exact kernel ready after the worker enters an error state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "AI_NOT_CONFIGURED" } },
          { status: 503 },
        ),
      ),
    );
    const { rerender } = render(
      <PatchWorkspace initialSnapshot={initialSnapshot} />,
    );
    expect(
      await screen.findByText("Exact kernel ready", { exact: false }),
    ).toBeInTheDocument();

    workerRuntime.status = "error";
    workerRuntime.error = "CAD worker crashed after producing the mesh.";
    rerender(<PatchWorkspace initialSnapshot={initialSnapshot} />);

    expect(
      screen.queryByText("Exact kernel ready", { exact: false }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("CAD worker crashed after producing the mesh."),
    ).toBeInTheDocument();
  });

  it("surfaces provider errors without falling back to the offline grammar", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/plan") {
        return Response.json(
          { error: { code: "OPENAI_UNAVAILABLE" } },
          { status: 503 },
        );
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<PatchWorkspace initialSnapshot={initialSnapshot} />);
    await selectNorthWest(user);
    await user.type(
      screen.getByRole("textbox", { name: "Patch instruction" }),
      "make this hole 8 mm",
    );
    await user.click(screen.getByRole("button", { name: "Preview patch" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Planning unavailable: OPENAI_UNAVAILABLE.",
    );
    expect(screen.getByText("Not planned")).toBeInTheDocument();
    expect(screen.queryByText("Offline grammar")).not.toBeInTheDocument();
    expect(workerRequest).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
