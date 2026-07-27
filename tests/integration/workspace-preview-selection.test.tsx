import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SceneProps } from "@/components/cad/Scene";
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

vi.mock("@/components/cad/Scene", () => ({
  Scene({ selectedFeatureId }: SceneProps) {
    return (
      <output aria-label="Highlighted CAD feature">
        {selectedFeatureId ?? ""}
      </output>
    );
  },
}));

import { PatchWorkspace } from "@/components/workspace/PatchWorkspace";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  workerRequest.mockClear();
  workerInitialize.mockClear();
  workerTerminate.mockClear();
});

describe("PatchCAD preview selection lifecycle", () => {
  function stubOfflineProviders() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/plan") {
          return Response.json(
            { error: { code: "AI_NOT_CONFIGURED" } },
            { status: 503 },
          );
        }
        return Response.json(
          { error: { code: "RESEARCH_NOT_CONFIGURED" } },
          { status: 503 },
        );
      }),
    );
  }

  async function selectNorthWestWithKeyboard() {
    await screen.findByText("Exact kernel ready", { exact: false });
    const selectionSurface = screen.getByRole("region", {
      name: /Magic Circle CAD selection/,
    });
    selectionSurface.focus();

    fireEvent.keyDown(selectionSurface, { key: "ArrowRight" });
    expect(
      screen.getByText(
        "Keyboard target hole:nw, diameter 6 mm. Press Enter to select.",
      ),
    ).toBeInTheDocument();
    fireEvent.keyDown(selectionSurface, { key: "Enter" });

    expect(screen.getByLabelText("Current diameter")).toHaveTextContent(
      "6 mm",
    );
    expect(
      screen.getByLabelText("Highlighted CAD feature"),
    ).toHaveTextContent("hole:nw");
  }

  it("selects a semantic CAD hole using only the focused viewport keyboard controls", async () => {
    stubOfflineProviders();

    render(<PatchWorkspace initialSnapshot={createDemoBracket()} />);
    await selectNorthWestWithKeyboard();
  });

  it("keeps the selected semantic feature and verified Apply action across the preview mesh revision", async () => {
    stubOfflineProviders();
    const user = userEvent.setup();

    render(<PatchWorkspace initialSnapshot={createDemoBracket()} />);
    await selectNorthWestWithKeyboard();

    await user.type(
      screen.getByRole("textbox", { name: "Patch instruction" }),
      "make this hole 8 mm",
    );
    await user.click(
      screen.getByRole("button", { name: "Preview patch" }),
    );

    await screen.findByText("1 changed feature");
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("Offline grammar")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Highlighted CAD feature"),
      ).toHaveTextContent("hole:nw");
      expect(
        screen.getByRole("button", { name: "Apply verified patch" }),
      ).toBeEnabled();
    });
  });
});
