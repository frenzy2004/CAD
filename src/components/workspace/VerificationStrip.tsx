import { Check, CircleDashed, ShieldCheck } from "lucide-react";

import type { VerificationReport } from "@/lib/cad/schemas";

export interface VerificationStripProps {
  report: VerificationReport | null;
  stepByteSize?: number | null;
  auditByteSize?: number | null;
}

export function VerificationStrip({
  report,
  stepByteSize = null,
  auditByteSize = null,
}: VerificationStripProps) {
  const protectedHoleCount =
    report?.protectedFingerprints.filter(
      (fingerprint) => fingerprint.kind === "through_hole",
    ).length ?? 0;

  return (
    <section
      aria-label="Patch verification"
      className="grid border-t border-stone-800 bg-stone-950/95 md:grid-cols-3"
    >
      <VerificationCell
        active={report?.targetChanged === true}
        icon={<CircleDashed aria-hidden="true" size={16} />}
        label={
          report?.targetChanged
            ? "Local target changed"
            : "Awaiting local change"
        }
      />
      <VerificationCell
        active={report?.validSolid === true}
        icon={<Check aria-hidden="true" size={16} />}
        label={
          report?.validSolid ? "Valid exact solid" : "Solid not verified"
        }
      />
      <VerificationCell
        active={report?.protectedFeaturesUnchanged === true}
        icon={<ShieldCheck aria-hidden="true" size={16} />}
        label={
          report?.protectedFeaturesUnchanged
            ? `${protectedHoleCount} protected holes unchanged`
            : "Protected geometry pending"
        }
      />
      {stepByteSize !== null || auditByteSize !== null ? (
        <p className="col-span-full m-0 border-t border-stone-800 px-4 py-2 font-mono text-[0.6875rem] text-stone-500">
          Browser-local artifacts
          {stepByteSize !== null
            ? ` · STEP ${formatBytes(stepByteSize)}`
            : ""}
          {auditByteSize !== null
            ? ` · audit ${formatBytes(auditByteSize)}`
            : ""}
        </p>
      ) : null}
    </section>
  );
}

interface VerificationCellProps {
  active: boolean;
  icon: React.ReactNode;
  label: string;
}

function VerificationCell({
  active,
  icon,
  label,
}: VerificationCellProps) {
  return (
    <div className="flex items-center gap-2 border-b border-stone-800 px-4 py-3 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0">
      <span
        className={
          active ? "text-emerald-400" : "text-stone-600"
        }
      >
        {icon}
      </span>
      <span
        className={
          active
            ? "text-xs font-semibold text-stone-200"
            : "text-xs text-stone-500"
        }
      >
        {label}
      </span>
    </div>
  );
}

function formatBytes(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} B`;
  return `${(byteSize / 1024).toFixed(1)} KiB`;
}
