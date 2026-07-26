"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import { useCadWorker } from "@/hooks/useCadWorker";
import { parseLocalPatch } from "@/lib/cad/local-parser";
import { applyPatch, validatePlan } from "@/lib/cad/patch-engine";
import {
  BracketSnapshotSchema,
  PatchPlanSchema,
  PlanResponseSchema,
  ResearchResponseSchema,
  SelectionEnvelopeSchema,
  type BracketSnapshot,
  type PatchPlan,
  type ResearchSource,
  type SelectionEnvelope,
  type VerificationReport,
} from "@/lib/cad/schemas";
import type { CadMesh } from "@/lib/cad/worker-protocol";

export type WorkspacePhase =
  | "booting"
  | "ready"
  | "selected"
  | "planning"
  | "previewing"
  | "applying"
  | "verified"
  | "rejected"
  | "error";

export type PlanSource = "openai" | "local-parser";

export type AppliedPatch = {
  before: BracketSnapshot;
  after: BracketSnapshot;
  selection: SelectionEnvelope;
  planSource: PlanSource;
  plan: PatchPlan;
  verification: VerificationReport;
};

type ResearchState = {
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  sources: ResearchSource[];
};

type WorkspaceState = {
  phase: WorkspacePhase;
  currentSnapshot: BracketSnapshot;
  currentMesh: CadMesh | null;
  selection: SelectionEnvelope | null;
  instruction: string;
  plan: PatchPlan | null;
  planSource: PlanSource | null;
  proposedDiameter: string;
  candidateSnapshot: BracketSnapshot | null;
  previewMesh: CadMesh | null;
  verification: VerificationReport | null;
  undoSnapshot: BracketSnapshot | null;
  appliedPatch: AppliedPatch | null;
  error: string | null;
  research: ResearchState;
  stepByteSize: number | null;
  auditByteSize: number | null;
};

type Action =
  | { type: "BOOT_SUCCEEDED"; mesh: CadMesh }
  | { type: "SELECTION_CHANGED"; selection: SelectionEnvelope | null }
  | { type: "INSTRUCTION_CHANGED"; instruction: string }
  | { type: "PLANNING_STARTED" }
  | {
      type: "PREVIEW_SUCCEEDED";
      plan: PatchPlan;
      planSource: PlanSource;
      candidateSnapshot: BracketSnapshot;
      previewMesh: CadMesh;
      verification: VerificationReport;
    }
  | { type: "PROPOSED_DIAMETER_CHANGED"; value: string }
  | { type: "APPLY_STARTED" }
  | { type: "APPLY_SUCCEEDED"; patch: AppliedPatch }
  | { type: "REJECT_STARTED" }
  | { type: "REJECT_SUCCEEDED"; mesh: CadMesh }
  | { type: "UNDO_STARTED" }
  | { type: "UNDO_SUCCEEDED"; snapshot: BracketSnapshot; mesh: CadMesh }
  | { type: "RESET_STARTED" }
  | { type: "RESET_SUCCEEDED"; snapshot: BracketSnapshot; mesh: CadMesh }
  | { type: "RESEARCH_LOADING" }
  | { type: "RESEARCH_READY"; sources: ResearchSource[] }
  | { type: "RESEARCH_UNAVAILABLE" }
  | { type: "RESEARCH_FAILED" }
  | { type: "STEP_EXPORTED"; byteSize: number }
  | { type: "AUDIT_EXPORTED"; byteSize: number }
  | { type: "FAILED"; message: string };

export type PatchWorkspaceController = WorkspaceState & {
  workerStatus: ReturnType<typeof useCadWorker>["status"];
  workerProgress: string | null;
  workerError: string | null;
  displayedMesh: CadMesh | null;
  selectedFeature:
    | BracketSnapshot["holes"][number]
    | null;
  canApply: boolean;
  canExport: boolean;
  setSelection(selection: SelectionEnvelope | null): void;
  setInstruction(instruction: string): void;
  submitPlan(): Promise<void>;
  adjustProposedDiameter(value: string): Promise<void>;
  applyPreview(): void;
  rejectPreview(): Promise<void>;
  undo(): Promise<void>;
  reset(): Promise<void>;
  markStepExported(byteSize: number): void;
  markAuditExported(byteSize: number): void;
  fail(message: string): void;
};

const EMPTY_RESEARCH: ResearchState = {
  status: "idle",
  sources: [],
};

function initialState(snapshot: BracketSnapshot): WorkspaceState {
  return {
    phase: "booting",
    currentSnapshot: snapshot,
    currentMesh: null,
    selection: null,
    instruction: "",
    plan: null,
    planSource: null,
    proposedDiameter: "",
    candidateSnapshot: null,
    previewMesh: null,
    verification: null,
    undoSnapshot: null,
    appliedPatch: null,
    error: null,
    research: EMPTY_RESEARCH,
    stepByteSize: null,
    auditByteSize: null,
  };
}

function clearPreview(state: WorkspaceState) {
  return {
    ...state,
    plan: null,
    planSource: null,
    proposedDiameter: "",
    candidateSnapshot: null,
    previewMesh: null,
    verification: null,
    error: null,
    research: EMPTY_RESEARCH,
  };
}

function workspaceReducer(
  state: WorkspaceState,
  action: Action,
): WorkspaceState {
  switch (action.type) {
    case "BOOT_SUCCEEDED":
      return {
        ...state,
        phase: "ready",
        currentMesh: action.mesh,
        error: null,
      };
    case "SELECTION_CHANGED": {
      const cleared = clearPreview(state);
      return {
        ...cleared,
        phase: action.selection ? "selected" : "ready",
        selection: action.selection,
      };
    }
    case "INSTRUCTION_CHANGED":
      return {
        ...state,
        instruction: action.instruction,
      };
    case "PLANNING_STARTED":
      return {
        ...state,
        phase: "planning",
        plan: null,
        planSource: null,
        proposedDiameter: "",
        candidateSnapshot: null,
        previewMesh: null,
        verification: null,
        error: null,
        research: EMPTY_RESEARCH,
      };
    case "PREVIEW_SUCCEEDED":
      return {
        ...state,
        phase: "previewing",
        plan: action.plan,
        planSource: action.planSource,
        proposedDiameter: String(action.plan.diameterMm),
        candidateSnapshot: action.candidateSnapshot,
        previewMesh: action.previewMesh,
        verification: action.verification,
        error: null,
      };
    case "PROPOSED_DIAMETER_CHANGED":
      return {
        ...state,
        proposedDiameter: action.value,
        candidateSnapshot: null,
        previewMesh: null,
        verification: null,
        error: null,
      };
    case "APPLY_STARTED":
      return { ...state, phase: "applying", error: null };
    case "APPLY_SUCCEEDED":
      return {
        ...state,
        phase: "verified",
        currentSnapshot: action.patch.after,
        currentMesh: state.previewMesh,
        undoSnapshot: action.patch.before,
        appliedPatch: action.patch,
        candidateSnapshot: null,
        previewMesh: null,
        error: null,
        stepByteSize: null,
        auditByteSize: null,
      };
    case "REJECT_STARTED": {
      const cleared = clearPreview(state);
      return {
        ...cleared,
        phase: "rejected",
      };
    }
    case "REJECT_SUCCEEDED":
      return {
        ...state,
        phase: "rejected",
        currentMesh: action.mesh,
        error: null,
      };
    case "UNDO_STARTED":
      return { ...state, phase: "applying", error: null };
    case "UNDO_SUCCEEDED": {
      const cleared = clearPreview(state);
      return {
        ...cleared,
        phase: state.selection ? "selected" : "ready",
        currentSnapshot: action.snapshot,
        currentMesh: action.mesh,
        undoSnapshot: null,
        appliedPatch: null,
        stepByteSize: null,
        auditByteSize: null,
      };
    }
    case "RESET_STARTED":
      return { ...state, phase: "booting", error: null };
    case "RESET_SUCCEEDED":
      return {
        ...initialState(action.snapshot),
        phase: "ready",
        currentMesh: action.mesh,
      };
    case "RESEARCH_LOADING":
      return {
        ...state,
        research: { status: "loading", sources: [] },
      };
    case "RESEARCH_READY":
      return {
        ...state,
        research: { status: "ready", sources: action.sources },
      };
    case "RESEARCH_UNAVAILABLE":
      return {
        ...state,
        research: { status: "unavailable", sources: [] },
      };
    case "RESEARCH_FAILED":
      return {
        ...state,
        research: { status: "error", sources: [] },
      };
    case "STEP_EXPORTED":
      return { ...state, stepByteSize: action.byteSize };
    case "AUDIT_EXPORTED":
      return { ...state, auditByteSize: action.byteSize };
    case "FAILED":
      return { ...state, phase: "error", error: action.message };
  }
}

export function usePatchWorkspace(
  providedInitialSnapshot: BracketSnapshot,
): PatchWorkspaceController {
  const initialSnapshot = useMemo(
    () => BracketSnapshotSchema.parse(providedInitialSnapshot),
    [providedInitialSnapshot],
  );
  const [state, dispatch] = useReducer(
    workspaceReducer,
    initialSnapshot,
    initialState,
  );
  const worker = useCadWorker();
  const {
    error: workerError,
    initialize: initializeWorker,
    progress: workerProgress,
    request: requestWorker,
    status: workerStatus,
  } = worker;
  const operationToken = useRef(0);
  const researchToken = useRef(0);

  const buildExactMesh = useCallback(
    async (snapshot: BracketSnapshot): Promise<CadMesh> => {
      const reply = await requestWorker({ type: "build", snapshot });
      if (reply.type !== "mesh") {
        throw new Error("The exact CAD kernel did not return a mesh.");
      }
      return reply.mesh;
    },
    [requestWorker],
  );

  useEffect(() => {
    const token = ++operationToken.current;
    void (async () => {
      try {
        await initializeWorker();
        const mesh = await buildExactMesh(initialSnapshot);
        if (token === operationToken.current) {
          dispatch({ type: "BOOT_SUCCEEDED", mesh });
        }
      } catch {
        if (token === operationToken.current) {
          dispatch({
            type: "FAILED",
            message: "The exact browser CAD kernel could not start.",
          });
        }
      }
    })();

    return () => {
      operationToken.current += 1;
      researchToken.current += 1;
    };
  }, [buildExactMesh, initialSnapshot, initializeWorker]);

  const setSelection = useCallback((selection: SelectionEnvelope | null) => {
    operationToken.current += 1;
    researchToken.current += 1;
    const parsed = selection
      ? SelectionEnvelopeSchema.safeParse(selection)
      : null;
    if (parsed && !parsed.success) {
      dispatch({
        type: "FAILED",
        message: "The Magic Circle returned an invalid selection.",
      });
      return;
    }
    dispatch({
      type: "SELECTION_CHANGED",
      selection: parsed ? parsed.data : null,
    });
  }, []);

  const setInstruction = useCallback((instruction: string) => {
    dispatch({ type: "INSTRUCTION_CHANGED", instruction });
  }, []);

  const loadResearch = useCallback(async (query: string) => {
    const token = ++researchToken.current;
    dispatch({ type: "RESEARCH_LOADING" });
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (token !== researchToken.current) return;
      if (!response.ok) {
        const code = await readPublicErrorCode(response);
        dispatch({
          type:
            code === "RESEARCH_NOT_CONFIGURED"
              ? "RESEARCH_UNAVAILABLE"
              : "RESEARCH_FAILED",
        });
        return;
      }

      const parsed = ResearchResponseSchema.safeParse(await response.json());
      dispatch(
        parsed.success
          ? { type: "RESEARCH_READY", sources: parsed.data.sources }
          : { type: "RESEARCH_FAILED" },
      );
    } catch {
      if (token === researchToken.current) {
        dispatch({ type: "RESEARCH_FAILED" });
      }
    }
  }, []);

  const previewPlan = useCallback(
    async (
      plan: PatchPlan,
      source: PlanSource,
      token: number,
    ): Promise<void> => {
      const selection = state.selection;
      if (!selection) {
        throw new Error("Draw a Magic Circle around one editable feature first.");
      }
      const validation = validatePlan({
        before: state.currentSnapshot,
        selection,
        plan,
      });
      if (!validation.valid) {
        throw new Error(`Patch rejected: ${validation.code}.`);
      }

      const { after, report } = applyPatch({
        before: state.currentSnapshot,
        selection,
        plan,
      });
      const mesh = await buildExactMesh(after);
      if (token !== operationToken.current) return;

      dispatch({
        type: "PREVIEW_SUCCEEDED",
        plan,
        planSource: source,
        candidateSnapshot: after,
        previewMesh: mesh,
        verification: report,
      });
    },
    [buildExactMesh, state.currentSnapshot, state.selection],
  );

  const submitPlan = useCallback(async () => {
    if (!state.selection) {
      dispatch({
        type: "FAILED",
        message: "Draw a Magic Circle around one editable feature first.",
      });
      return;
    }
    const instruction = state.instruction.trim();
    if (!instruction) {
      dispatch({
        type: "FAILED",
        message: "Enter one local CAD instruction.",
      });
      return;
    }

    const token = ++operationToken.current;
    dispatch({ type: "PLANNING_STARTED" });
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: instruction,
          snapshot: state.currentSnapshot,
          selection: state.selection,
        }),
      });

      let plan: PatchPlan;
      let source: PlanSource;
      if (response.ok) {
        const parsed = PlanResponseSchema.parse(await response.json());
        plan = parsed.plan;
        source = parsed.source;
      } else {
        const code = await readPublicErrorCode(response);
        if (code !== "AI_NOT_CONFIGURED") {
          throw new Error(`Planning unavailable: ${code ?? "UNKNOWN_ERROR"}.`);
        }
        const local = parseLocalPatch(instruction, state.selection);
        if ("error" in local) {
          throw new Error(`Offline grammar rejected: ${local.error.code}.`);
        }
        plan = local.plan;
        source = local.source;
      }

      if (token !== operationToken.current) return;
      await previewPlan(plan, source, token);
      if (token === operationToken.current) {
        void loadResearch(instruction);
      }
    } catch (error) {
      if (token === operationToken.current) {
        dispatch({
          type: "FAILED",
          message:
            error instanceof Error
              ? error.message
              : "The patch could not be planned.",
        });
      }
    }
  }, [
    loadResearch,
    previewPlan,
    state.currentSnapshot,
    state.instruction,
    state.selection,
  ]);

  const adjustProposedDiameter = useCallback(
    async (value: string) => {
      dispatch({ type: "PROPOSED_DIAMETER_CHANGED", value });
      if (!state.plan || !state.planSource) return;

      const diameterMm = Number(value);
      const parsedPlan = PatchPlanSchema.safeParse({
        ...state.plan,
        diameterMm,
      });
      if (!parsedPlan.success) {
        dispatch({
          type: "FAILED",
          message: "Enter a valid diameter between 1 and 40 mm.",
        });
        return;
      }

      const token = ++operationToken.current;
      try {
        await previewPlan(parsedPlan.data, state.planSource, token);
      } catch (error) {
        if (token === operationToken.current) {
          dispatch({
            type: "FAILED",
            message:
              error instanceof Error
                ? error.message
                : "The adjusted patch is invalid.",
          });
        }
      }
    },
    [previewPlan, state.plan, state.planSource],
  );

  const applyPreview = useCallback(() => {
    if (
      !state.selection ||
      !state.plan ||
      !state.planSource ||
      !state.candidateSnapshot ||
      !state.previewMesh ||
      !state.verification ||
      !state.verification.validSolid ||
      !state.verification.targetChanged ||
      !state.verification.protectedFeaturesUnchanged
    ) {
      dispatch({
        type: "FAILED",
        message: "Only a verified exact preview can be applied.",
      });
      return;
    }

    dispatch({ type: "APPLY_STARTED" });
    dispatch({
      type: "APPLY_SUCCEEDED",
      patch: {
        before: state.currentSnapshot,
        after: state.candidateSnapshot,
        selection: state.selection,
        planSource: state.planSource,
        plan: state.plan,
        verification: state.verification,
      },
    });
  }, [state]);

  const rejectPreview = useCallback(async () => {
    const token = ++operationToken.current;
    researchToken.current += 1;
    dispatch({ type: "REJECT_STARTED" });
    try {
      const mesh = await buildExactMesh(state.currentSnapshot);
      if (token === operationToken.current) {
        dispatch({ type: "REJECT_SUCCEEDED", mesh });
      }
    } catch {
      if (token === operationToken.current) {
        dispatch({
          type: "FAILED",
          message: "The exact CAD kernel could not restore the current part.",
        });
      }
    }
  }, [buildExactMesh, state.currentSnapshot]);

  const undo = useCallback(async () => {
    if (!state.undoSnapshot) return;
    const snapshot = state.undoSnapshot;
    const token = ++operationToken.current;
    researchToken.current += 1;
    dispatch({ type: "UNDO_STARTED" });
    try {
      const mesh = await buildExactMesh(snapshot);
      if (token === operationToken.current) {
        dispatch({ type: "UNDO_SUCCEEDED", snapshot, mesh });
      }
    } catch {
      if (token === operationToken.current) {
        dispatch({
          type: "FAILED",
          message: "The exact CAD kernel could not restore the undo snapshot.",
        });
      }
    }
  }, [buildExactMesh, state.undoSnapshot]);

  const reset = useCallback(async () => {
    const token = ++operationToken.current;
    researchToken.current += 1;
    dispatch({ type: "RESET_STARTED" });
    try {
      const mesh = await buildExactMesh(initialSnapshot);
      if (token === operationToken.current) {
        dispatch({
          type: "RESET_SUCCEEDED",
          snapshot: initialSnapshot,
          mesh,
        });
      }
    } catch {
      if (token === operationToken.current) {
        dispatch({
          type: "FAILED",
          message: "The exact CAD kernel could not reset the sample.",
        });
      }
    }
  }, [buildExactMesh, initialSnapshot]);

  const selectedFeature =
    state.selection?.editableFeatureIds.length === 1
      ? state.currentSnapshot.holes.find(
          (hole) =>
            hole.id === state.selection?.editableFeatureIds[0],
        ) ?? null
      : null;
  const verificationPassed =
    state.verification?.validSolid === true &&
    state.verification.targetChanged === true &&
    state.verification.protectedFeaturesUnchanged === true;

  return {
    ...state,
    workerStatus,
    workerProgress,
    workerError,
    displayedMesh: state.previewMesh ?? state.currentMesh,
    selectedFeature,
    canApply:
      state.phase === "previewing" &&
      state.previewMesh !== null &&
      verificationPassed,
    canExport:
      state.phase === "verified" &&
      state.currentMesh !== null &&
      state.appliedPatch !== null,
    setSelection,
    setInstruction,
    submitPlan,
    adjustProposedDiameter,
    applyPreview,
    rejectPreview,
    undo,
    reset,
    markStepExported: (byteSize) =>
      dispatch({ type: "STEP_EXPORTED", byteSize }),
    markAuditExported: (byteSize) =>
      dispatch({ type: "AUDIT_EXPORTED", byteSize }),
    fail: (message) => dispatch({ type: "FAILED", message }),
  };
}

async function readPublicErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "code" in body.error &&
      typeof body.error.code === "string"
    ) {
      return body.error.code;
    }
  } catch {
    return null;
  }
  return null;
}
