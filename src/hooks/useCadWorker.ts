"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  CAD_WORKER_TIMEOUT_MS,
  CadWorkerReplySchema,
  createCadWorkerRequestId,
  type CadWorkerCommand,
  type CadWorkerReply,
  type CadWorkerRequest,
} from "@/lib/cad/worker-protocol";

export type CadWorkerStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "working"
  | "error";

export type CadWorkerState = {
  status: CadWorkerStatus;
  progress: string | null;
  error: string | null;
};

type PendingRequest = {
  resolve(reply: CadWorkerReply): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
};

export type CadWorkerClient = CadWorkerState & {
  initialize(): Promise<void>;
  request(command: CadWorkerCommand): Promise<CadWorkerReply>;
  terminate(): void;
};

const INITIAL_STATE: CadWorkerState = {
  status: "idle",
  progress: null,
  error: null,
};

export function useCadWorker(): CadWorkerClient {
  const [state, setState] = useState<CadWorkerState>(INITIAL_STATE);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const initializePromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  const updateState = useCallback((next: CadWorkerState) => {
    if (mountedRef.current) setState(next);
  }, []);

  const rejectPending = useCallback((error: Error) => {
    for (const pending of pendingRef.current.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    pendingRef.current.clear();
  }, []);

  const terminate = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    initializePromiseRef.current = null;
    rejectPending(new Error("The CAD worker was terminated."));
    updateState(INITIAL_STATE);
  }, [rejectPending, updateState]);

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(
      new URL("../workers/cad.worker.ts", import.meta.url),
      {
        type: "module",
        name: "patchcad-cad-kernel",
      },
    );

    worker.onmessage = (event: MessageEvent<unknown>) => {
      const parsed = CadWorkerReplySchema.safeParse(event.data);
      if (!parsed.success) {
        const error = new Error(
          "The CAD worker returned an invalid protocol message.",
        );
        rejectPending(error);
        updateState({ status: "error", progress: null, error: error.message });
        return;
      }

      const reply = parsed.data;
      const pending = pendingRef.current.get(reply.id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      pendingRef.current.delete(reply.id);

      if (reply.type === "error") {
        const error = new Error(`${reply.code}: ${reply.message}`);
        pending.reject(error);
        updateState({ status: "error", progress: null, error: error.message });
        return;
      }

      pending.resolve(reply);
      updateState({ status: "ready", progress: null, error: null });
    };

    worker.onerror = (event) => {
      const error = new Error(event.message || "The CAD worker crashed.");
      rejectPending(error);
      updateState({ status: "error", progress: null, error: error.message });
    };

    workerRef.current = worker;
    return worker;
  }, [rejectPending, updateState]);

  const dispatch = useCallback(
    (request: CadWorkerRequest): Promise<CadWorkerReply> => {
      const worker = ensureWorker();
      if (pendingRef.current.has(request.id)) {
        return Promise.reject(
          new Error(`Duplicate CAD worker request ID: ${request.id}`),
        );
      }

      return new Promise<CadWorkerReply>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingRef.current.delete(request.id);
          const error = new Error(
            `CAD worker request timed out after ${CAD_WORKER_TIMEOUT_MS} ms.`,
          );
          reject(error);
          updateState({
            status: "error",
            progress: null,
            error: error.message,
          });
        }, CAD_WORKER_TIMEOUT_MS);

        pendingRef.current.set(request.id, { resolve, reject, timeout });
        const transfers =
          request.type === "import-step" ? [request.bytes] : undefined;
        worker.postMessage(request, transfers ?? []);
      });
    },
    [ensureWorker, updateState],
  );

  const initialize = useCallback((): Promise<void> => {
    if (initializePromiseRef.current) return initializePromiseRef.current;

    updateState({
      status: "initializing",
      progress: "Loading the exact OpenCascade kernel",
      error: null,
    });
    const promise = dispatch({
      id: createCadWorkerRequestId(),
      type: "initialize",
    })
      .then((reply) => {
        if (reply.type !== "ready") {
          throw new Error("The CAD worker did not acknowledge initialization.");
        }
      })
      .catch((error: unknown) => {
        initializePromiseRef.current = null;
        throw error;
      });

    initializePromiseRef.current = promise;
    return promise;
  }, [dispatch, updateState]);

  const request = useCallback(
    async (command: CadWorkerCommand): Promise<CadWorkerReply> => {
      await initialize();
      updateState({
        status: "working",
        progress:
          command.type === "import-step"
            ? "Importing exact STEP geometry"
            : command.type === "export-step"
              ? "Exporting exact STEP geometry"
              : "Rebuilding exact CAD geometry",
        error: null,
      });

      return dispatch({
        ...command,
        id: createCadWorkerRequestId(),
      } as CadWorkerRequest);
    },
    [dispatch, initialize, updateState],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
      initializePromiseRef.current = null;
      rejectPending(new Error("The CAD worker component was unmounted."));
    };
  }, [rejectPending]);

  return {
    ...state,
    initialize,
    request,
    terminate,
  };
}
