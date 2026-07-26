import { RotateCcw, WandSparkles, X } from "lucide-react";

import { PatchPreview } from "@/components/cad/PatchPreview";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PatchWorkspaceController } from "@/hooks/usePatchWorkspace";

import { ResearchPanel } from "./ResearchPanel";

export interface PatchComposerProps {
  workspace: PatchWorkspaceController;
}

export function PatchComposer({ workspace }: PatchComposerProps) {
  const selectedId =
    workspace.selection?.editableFeatureIds[0] ??
    workspace.selection?.editableFaceIds[0] ??
    "No feature selected";
  const sourceLabel =
    workspace.planSource === "openai"
      ? "OpenAI plan"
      : workspace.planSource === "local-parser"
        ? "Offline grammar"
        : "Not planned";

  return (
    <aside
      aria-label="Patch inspector"
      className="flex min-h-0 flex-col overflow-hidden border-stone-800 bg-stone-900/95 xl:border-l"
    >
      <div className="border-b border-stone-800 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="m-0 font-mono text-[0.6875rem] uppercase tracking-[0.15em] text-orange-400">
              Patch inspector
            </p>
            <h2 className="mt-1 mb-0 text-lg font-semibold tracking-tight text-stone-50">
              Local feature edit
            </h2>
          </div>
          <StatusBadge
            tone={
              workspace.phase === "error"
                ? "danger"
                : workspace.phase === "previewing" ||
                    workspace.phase === "verified"
                  ? "success"
                  : workspace.phase === "planning" ||
                      workspace.phase === "applying"
                    ? "working"
                    : "neutral"
            }
          >
            {workspace.phase}
          </StatusBadge>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="grid grid-cols-[1fr_auto] items-end gap-4 rounded-md border border-stone-800 bg-stone-950/70 p-3">
          <div className="min-w-0">
            <p className="m-0 text-xs text-stone-500">Selected feature</p>
            <p className="mt-1 mb-0 truncate font-mono text-sm text-stone-100">
              {selectedId}
            </p>
          </div>
          <output
            aria-label="Current diameter"
            className="font-mono text-sm font-semibold tabular-nums text-stone-100"
          >
            {workspace.selectedFeature
              ? `${workspace.selectedFeature.diameterMm} mm`
              : "—"}
          </output>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void workspace.submitPlan();
          }}
        >
          <label
            className="block text-xs font-semibold text-stone-300"
            htmlFor="patch-instruction"
          >
            Patch instruction
          </label>
          <div className="mt-2 flex gap-2">
            <input
              autoComplete="off"
              className="min-h-11 min-w-0 flex-1 rounded-md border border-stone-700 bg-stone-950 px-3 text-sm text-stone-100 outline-none placeholder:text-stone-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25"
              disabled={!workspace.selection || workspace.phase === "planning"}
              id="patch-instruction"
              maxLength={500}
              onChange={(event) =>
                workspace.setInstruction(event.currentTarget.value)
              }
              placeholder="make this hole 8 mm"
              value={workspace.instruction}
            />
            <Button
              aria-label="Preview patch"
              disabled={
                !workspace.selection ||
                !workspace.instruction.trim() ||
                workspace.phase === "planning" ||
                workspace.phase === "applying"
              }
              type="submit"
              variant="primary"
            >
              <WandSparkles aria-hidden="true" size={16} />
              <span className="hidden sm:inline">Preview</span>
            </Button>
          </div>
        </form>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="m-0 text-xs text-stone-500">Plan source</p>
            <p className="mt-1 mb-0 text-sm font-semibold text-stone-200">
              {sourceLabel}
            </p>
          </div>
          <div>
            <label
              className="block text-xs text-stone-500"
              htmlFor="proposed-diameter"
            >
              Proposed diameter
            </label>
            <div className="mt-1 flex items-center rounded-md border border-stone-700 bg-stone-950 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/25">
              <input
                className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-right font-mono text-sm tabular-nums text-stone-100 outline-none disabled:text-stone-600"
                disabled={!workspace.plan}
                id="proposed-diameter"
                inputMode="decimal"
                min="1"
                max="40"
                onChange={(event) => {
                  void workspace.adjustProposedDiameter(
                    event.currentTarget.value,
                  );
                }}
                step="0.1"
                type="number"
                value={workspace.proposedDiameter}
              />
              <span className="pr-2 font-mono text-xs text-stone-500">
                mm
              </span>
            </div>
          </div>
        </div>
      </div>

      {workspace.plan && workspace.candidateSnapshot ? (
        <PatchPreview
          after={workspace.candidateSnapshot}
          before={workspace.currentSnapshot}
          plan={workspace.plan}
        />
      ) : null}

      {workspace.error ? (
        <p
          className="mx-4 my-3 border-l-2 border-red-500 bg-red-950/30 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {workspace.error}
        </p>
      ) : null}

      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-stone-800 p-4">
        <Button
          aria-label="Reject patch"
          disabled={!workspace.previewMesh}
          onClick={() => {
            void workspace.rejectPreview();
          }}
          variant="quiet"
        >
          <X aria-hidden="true" size={16} />
          Reject
        </Button>
        <Button
          aria-label="Apply verified patch"
          disabled={!workspace.canApply}
          onClick={workspace.applyPreview}
          variant="primary"
        >
          <RotateCcw
            aria-hidden="true"
            className="rotate-90"
            size={16}
          />
          Apply
        </Button>
      </div>

      <ResearchPanel
        sources={workspace.research.sources}
        status={workspace.research.status}
      />
    </aside>
  );
}
