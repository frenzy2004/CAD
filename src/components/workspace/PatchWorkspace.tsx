"use client";

import {
  Download,
  FileJson,
  RotateCcw,
  Undo2,
} from "lucide-react";

import { CadViewport } from "@/components/cad/CadViewport";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { VerificationStrip } from "@/components/workspace/VerificationStrip";
import { usePatchWorkspace } from "@/hooks/usePatchWorkspace";
import { createDemoBracket } from "@/lib/cad/demo-bracket";
import type { BracketSnapshot } from "@/lib/cad/schemas";

import { PatchComposer } from "./PatchComposer";

const DEFAULT_BRACKET = createDemoBracket();

export interface PatchWorkspaceProps {
  initialSnapshot?: BracketSnapshot;
}

export function PatchWorkspace({
  initialSnapshot = DEFAULT_BRACKET,
}: PatchWorkspaceProps) {
  const workspace = usePatchWorkspace(initialSnapshot);
  const kernelReady = workspace.currentMesh !== null;
  const kernelLabel = kernelReady
    ? "Exact kernel ready"
    : workspace.workerProgress ?? "Starting exact kernel";

  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-stone-800 bg-stone-950/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mr-auto flex min-w-0 items-center gap-3">
          <div
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-orange-500/50 bg-orange-500/10 font-mono text-sm font-black text-orange-400"
          >
            PC
          </div>
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-bold tracking-tight">
              PatchCAD
            </p>
            <p className="m-0 truncate font-mono text-[0.6875rem] text-stone-500">
              mounting-bracket.step · mm
            </p>
          </div>
        </div>

        <StatusBadge
          tone={
            workspace.phase === "error"
              ? "danger"
              : kernelReady
                ? "success"
                : "working"
          }
        >
          {kernelLabel}
        </StatusBadge>

        <div className="flex items-center gap-1 border-l border-stone-800 pl-3">
          <Button
            aria-label="Undo patch"
            disabled={!workspace.undoSnapshot}
            onClick={() => {
              void workspace.undo();
            }}
            variant="quiet"
          >
            <Undo2 aria-hidden="true" size={15} />
            <span className="hidden lg:inline">Undo</span>
          </Button>
          <Button
            aria-label="Reset sample"
            disabled={workspace.phase === "booting"}
            onClick={() => {
              void workspace.reset();
            }}
            variant="quiet"
          >
            <RotateCcw aria-hidden="true" size={15} />
            <span className="hidden lg:inline">Reset</span>
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            aria-label="Download STEP"
            disabled={!workspace.canExport}
            variant="secondary"
          >
            <Download aria-hidden="true" size={15} />
            STEP
          </Button>
          <Button
            aria-label="Download patch audit"
            disabled={!workspace.canExport}
            variant="secondary"
          >
            <FileJson aria-hidden="true" size={15} />
            Audit
          </Button>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh_-_4rem)] grid-rows-[minmax(26rem,1fr)_auto_auto] xl:grid-cols-[minmax(0,1fr)_23rem] xl:grid-rows-[minmax(0,1fr)_auto]">
        <section
          aria-label="Exact CAD model"
          className="relative min-h-[26rem] bg-[#11100e] p-3 md:p-5"
        >
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(168,162,158,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(168,162,158,0.08)_1px,transparent_1px)] [background-size:24px_24px]" />
          {workspace.displayedMesh ? (
            <CadViewport
              className="relative h-full min-h-[24rem] rounded-lg border-stone-800 bg-[#0d0c0b]"
              mesh={workspace.displayedMesh}
              onSelectionChange={workspace.setSelection}
            />
          ) : (
            <div
              className="relative grid h-full min-h-[24rem] place-items-center rounded-lg border border-stone-800 bg-[#0d0c0b]"
              role="status"
            >
              <div className="text-center">
                <p className="m-0 font-mono text-xs uppercase tracking-[0.14em] text-orange-400">
                  OpenCascade worker
                </p>
                <p className="mt-2 mb-0 text-sm text-stone-400">
                  {workspace.workerProgress ??
                    "Building the exact sample solid…"}
                </p>
              </div>
            </div>
          )}
        </section>

        <PatchComposer workspace={workspace} />

        <div className="xl:col-span-2">
          <VerificationStrip
            auditByteSize={workspace.auditByteSize}
            report={workspace.verification}
            stepByteSize={workspace.stepByteSize}
          />
        </div>
      </div>
    </main>
  );
}
