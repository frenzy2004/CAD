import "server-only";

import { ResearchSourceSchema } from "@/lib/cad/schemas";
import type { ResearchRequest, ResearchSource } from "@/lib/cad/schemas";
import type { ExaConfiguration } from "@/lib/env";

const MAX_SOURCES = 5;
const MAX_TEXT_CHARACTERS = 1200;

export type ExaSearchResult = {
  title?: string | null;
  url?: string | null;
  text?: string | null;
};

export type ExaAdapter = {
  searchAndContents(input: {
    query: string;
    type: "auto";
    numResults: 5;
    text: { maxCharacters: number };
  }): Promise<{ results: ExaSearchResult[] }>;
};

export type ResearchServiceResult =
  | { ok: true; sources: ResearchSource[] }
  | { ok: false; code: "RESEARCH_NOT_CONFIGURED" | "RESEARCH_UNAVAILABLE" };

export class ResearchService {
  constructor(
    private readonly dependencies: {
      configuration?: ExaConfiguration;
      adapter?: ExaAdapter;
    },
  ) {}

  async research(request: ResearchRequest): Promise<ResearchServiceResult> {
    const { configuration, adapter } = this.dependencies;
    if (!configuration || !adapter) {
      return { ok: false, code: "RESEARCH_NOT_CONFIGURED" };
    }

    try {
      const response = await adapter.searchAndContents({
        query: request.query,
        type: "auto",
        numResults: MAX_SOURCES,
        text: { maxCharacters: MAX_TEXT_CHARACTERS },
      });
      return { ok: true, sources: normalizeSources(response.results) };
    } catch {
      return { ok: false, code: "RESEARCH_UNAVAILABLE" };
    }
  }
}

function normalizeSources(results: ExaSearchResult[]): ResearchSource[] {
  const seen = new Set<string>();
  const sources: ResearchSource[] = [];

  for (const result of results) {
    const source = normalizeSource(result);
    if (!source || seen.has(source.url)) continue;

    seen.add(source.url);
    sources.push(source);
    if (sources.length === MAX_SOURCES) break;
  }

  return sources;
}

function normalizeSource(result: ExaSearchResult): ResearchSource | undefined {
  const title = result.title?.trim();
  const excerpt = result.text?.trim();
  if (!title || !excerpt || !result.url) return undefined;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(result.url);
  } catch {
    return undefined;
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") return undefined;

  parsedUrl.hash = "";
  for (const parameter of [...parsedUrl.searchParams.keys()]) {
    if (parameter.toLowerCase().startsWith("utm_")) parsedUrl.searchParams.delete(parameter);
  }
  parsedUrl.searchParams.sort();
  if (parsedUrl.pathname.length > 1) parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, "");

  const source = {
    title,
    url: parsedUrl.toString(),
    excerpt: excerpt.slice(0, MAX_TEXT_CHARACTERS),
    domain: parsedUrl.hostname,
  };
  const validated = ResearchSourceSchema.safeParse(source);
  return validated.success ? validated.data : undefined;
}
