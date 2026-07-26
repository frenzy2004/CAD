import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CadViewportProps } from "@/components/cad/CadViewport";
import { createDemoBracket } from "@/lib/cad/demo-bracket";
import type { BracketSnapshot } from "@/lib/cad/schemas";
import type {
  CadMesh,
  CadWorkerCommand,
  CadWorkerReply,
} from "@/lib/cad/worker-protocol";

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

vi.mock("@/hooks/useCadWorker", () => ({
  useCadWorker: () => ({
    status: "ready",
    progress: null,
    error: null,
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

afterEach(() => {
  vi.unstubAllGlobals();
  workerRequest.mockClear();
  workerInitialize.mockClear();
  workerTerminate.mockClear();
});

describe("PatchCAD workspace", () => {
  it("previews, verifies, applies, and undoes one selected-hole resize", async () => {
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
          return Response.json(
            { error: { code: "RESEARCH_NOT_CONFIGURED" } },
            { status: 503 },
          );
        }
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );
    const user = userEvent.setup();

    render(<PatchWorkspace initialSnapshot={createDemoBracket()} />);

    expect(
      await screen.findByText("Exact kernel ready", { exact: false }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select hole:nw" }));
    expect(screen.getByText("hole:nw")).toBeInTheDocument();
    expect(screen.getByText("6 mm")).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "Patch instruction" }),
      "make this hole 8 mm",
    );
    await user.click(
      screen.getByRole("button", { name: "Preview patch" }),
    );

    expect(await screen.findByText("Offline grammar")).toBeInTheDocument();
    expect(await screen.findByText("1 changed feature")).toBeInTheDocument();
    expect(
      screen.getByText("3 protected holes unchanged"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apply verified patch" }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: "Apply verified patch" }),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Current diameter")).toHaveTextContent(
        "8 mm",
      );
    });

    await user.click(screen.getByRole("button", { name: "Undo patch" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Current diameter")).toHaveTextContent(
        "6 mm",
      );
    });
  });
});
