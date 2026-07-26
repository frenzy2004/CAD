import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCadWorker } from "@/hooks/useCadWorker";
import { createDemoBracket } from "@/lib/cad/demo-bracket";
import {
  CAD_WORKER_TIMEOUT_MS,
  type CadWorkerRequest,
} from "@/lib/cad/worker-protocol";

type SentMessage = {
  request: CadWorkerRequest;
  transfer: Transferable[];
};

class ControlledWorker {
  static instances: ControlledWorker[] = [];

  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: SentMessage[] = [];
  terminateCount = 0;

  constructor(
    readonly url: URL,
    readonly options?: WorkerOptions,
  ) {
    ControlledWorker.instances.push(this);
  }

  postMessage(request: CadWorkerRequest, transfer: Transferable[] = []): void {
    this.sent.push({ request, transfer });
  }

  terminate(): void {
    this.terminateCount += 1;
  }

  reply(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }

  crash(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function beginInitialization(
  initialize: () => Promise<void>,
): {
  promise: Promise<void>;
  request: CadWorkerRequest;
  worker: ControlledWorker;
} {
  let promise!: Promise<void>;
  act(() => {
    promise = initialize();
  });
  const worker = ControlledWorker.instances.at(-1);
  if (!worker) throw new Error("Expected the hook to create a worker");
  const request = worker.sent.at(-1)?.request;
  if (!request) throw new Error("Expected an initialize request");
  return { promise, request, worker };
}

async function acknowledgeReady(
  worker: ControlledWorker,
  request: CadWorkerRequest,
  promise: Promise<void>,
): Promise<void> {
  await act(async () => {
    worker.reply({ id: request.id, type: "ready" });
    await promise;
  });
}

beforeEach(() => {
  ControlledWorker.instances = [];
  vi.stubGlobal("Worker", ControlledWorker);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CAD worker fatal lifecycle", () => {
  it("terminates a worker with an invalid reply, rejects all pending work, and reinitializes cleanly", async () => {
    const { result } = renderHook(() => useCadWorker());
    const initialization = beginInitialization(result.current.initialize);
    await acknowledgeReady(
      initialization.worker,
      initialization.request,
      initialization.promise,
    );

    let firstBuild!: Promise<unknown>;
    let secondBuild!: Promise<unknown>;
    act(() => {
      firstBuild = result.current.request({
        type: "build",
        snapshot: createDemoBracket(),
      });
      secondBuild = result.current.request({
        type: "build",
        snapshot: createDemoBracket(),
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    const firstRejection = expect(firstBuild).rejects.toThrow(
      "invalid protocol message",
    );
    const secondRejection = expect(secondBuild).rejects.toThrow(
      "invalid protocol message",
    );

    await act(async () => {
      initialization.worker.reply({ type: "not-a-worker-reply" });
      await Promise.all([firstRejection, secondRejection]);
    });

    expect(initialization.worker.terminateCount).toBe(1);
    expect(result.current.status).toBe("error");

    const recovery = beginInitialization(result.current.initialize);
    expect(recovery.worker).not.toBe(initialization.worker);
    expect(ControlledWorker.instances).toHaveLength(2);
    await acknowledgeReady(
      recovery.worker,
      recovery.request,
      recovery.promise,
    );
    expect(result.current.status).toBe("ready");
  });

  it("terminates a crashed worker and creates a fresh worker for recovery", async () => {
    const { result } = renderHook(() => useCadWorker());
    const initialization = beginInitialization(result.current.initialize);
    const rejection = expect(initialization.promise).rejects.toThrow(
      "OpenCascade worker crashed",
    );

    await act(async () => {
      initialization.worker.crash("OpenCascade worker crashed");
      await rejection;
    });

    expect(initialization.worker.terminateCount).toBe(1);
    expect(result.current.status).toBe("error");

    const recovery = beginInitialization(result.current.initialize);
    expect(recovery.worker).not.toBe(initialization.worker);
    await acknowledgeReady(
      recovery.worker,
      recovery.request,
      recovery.promise,
    );
  });

  it("terminates a timed-out worker before it can finish hidden work and reinitializes cleanly", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCadWorker());
    const initialization = beginInitialization(result.current.initialize);
    await acknowledgeReady(
      initialization.worker,
      initialization.request,
      initialization.promise,
    );

    let build!: Promise<unknown>;
    act(() => {
      build = result.current.request({
        type: "build",
        snapshot: createDemoBracket(),
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    const buildRequest = initialization.worker.sent.at(-1)?.request;
    if (!buildRequest) throw new Error("Expected a build request");
    const rejection = expect(build).rejects.toThrow(
      `timed out after ${CAD_WORKER_TIMEOUT_MS} ms`,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAD_WORKER_TIMEOUT_MS);
      await rejection;
    });

    expect(initialization.worker.terminateCount).toBe(1);
    expect(result.current.status).toBe("error");

    await act(async () => {
      initialization.worker.reply({ id: buildRequest.id, type: "ready" });
    });
    expect(result.current.status).toBe("error");

    const recovery = beginInitialization(result.current.initialize);
    expect(recovery.worker).not.toBe(initialization.worker);
    await acknowledgeReady(
      recovery.worker,
      recovery.request,
      recovery.promise,
    );
  });
});
