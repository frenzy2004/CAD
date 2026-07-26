import type {
  BracketSnapshot,
  PatchPlan,
} from "@/lib/cad/schemas";

export interface PatchPreviewProps {
  before: BracketSnapshot;
  after: BracketSnapshot;
  plan: PatchPlan;
}

export function PatchPreview({
  before,
  after,
  plan,
}: PatchPreviewProps) {
  const beforeCount = before.holes.length;
  const afterCount = after.holes.length;
  const changeLabel =
    plan.operation === "resize_hole"
      ? "1 changed feature"
      : `${afterCount - beforeCount} added feature`;

  return (
    <section
      aria-label="Patch preview"
      className="border-y border-stone-800 bg-stone-950/50 px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="m-0 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-stone-500">
            Exact delta
          </p>
          <p className="mt-1 mb-0 text-sm font-semibold text-stone-100">
            {changeLabel}
          </p>
        </div>
        <p className="m-0 font-mono text-sm tabular-nums text-orange-300">
          {plan.diameterMm} mm
        </p>
      </div>
    </section>
  );
}
