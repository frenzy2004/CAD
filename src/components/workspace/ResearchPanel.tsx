import { ExternalLink } from "lucide-react";

import type { ResearchSource } from "@/lib/cad/schemas";

export interface ResearchPanelProps {
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  sources: ResearchSource[];
}

export function ResearchPanel({
  status,
  sources,
}: ResearchPanelProps) {
  return (
    <details className="group border-t border-stone-800">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-stone-200 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400">
        Component evidence
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-stone-500">
          {status === "ready" ? `${sources.length} sources` : status}
        </span>
      </summary>
      <div className="space-y-3 px-4 pb-4">
        {status === "loading" ? (
          <p className="m-0 text-sm text-stone-400">
            Searching manufacturer drawings and datasheets…
          </p>
        ) : null}
        {status === "unavailable" ? (
          <p className="m-0 text-sm text-stone-400">
            Exa is not configured. Geometry remains independent of research.
          </p>
        ) : null}
        {status === "error" ? (
          <p className="m-0 text-sm text-stone-400">
            Evidence is temporarily unavailable. It never changes geometry.
          </p>
        ) : null}
        {status === "idle" ? (
          <p className="m-0 text-sm text-stone-400">
            Evidence appears after a patch is planned.
          </p>
        ) : null}
        {sources.map((source) => (
          <article
            className="rounded-md border border-stone-800 bg-stone-950 p-3"
            key={source.url}
          >
            <a
              className="inline-flex items-start gap-2 text-sm font-semibold text-stone-100 underline decoration-stone-600 underline-offset-4 hover:text-orange-300"
              href={source.url}
              rel="noreferrer"
              target="_blank"
            >
              {source.title}
              <ExternalLink
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                size={13}
              />
            </a>
            <p className="mt-2 mb-0 text-xs leading-5 text-stone-400">
              {source.excerpt}
            </p>
            <p className="mt-2 mb-0 font-mono text-[0.6875rem] text-stone-600">
              {source.domain}
            </p>
          </article>
        ))}
      </div>
    </details>
  );
}
