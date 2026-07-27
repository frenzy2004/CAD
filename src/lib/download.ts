import {
  BracketSnapshotSchema,
  PatchPlanSchema,
  SelectionEnvelopeSchema,
  VerificationReportSchema,
} from "./cad/schemas";
import type {
  BracketSnapshot,
  PatchPlan,
  SelectionEnvelope,
  VerificationReport,
} from "./cad/schemas";

export const STEP_MIME_TYPE = "model/step";
export const JSON_MIME_TYPE = "application/json";

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const ARTIFACT_EXTENSIONS = new Set([".step", ".json"]);
const PLAN_SOURCES = new Set<PatchAuditInput["planSource"]>([
  "openai",
  "local-parser",
]);

type DownloadAnchor = {
  href: string;
  download: string;
  click(): void;
  remove(): void;
};

export type DownloadEnvironment = {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  createAnchor(): DownloadAnchor;
};

export type DownloadArtifactInput = {
  filename: string;
  mimeType: typeof STEP_MIME_TYPE | typeof JSON_MIME_TYPE;
  data: string | ArrayBuffer | Uint8Array<ArrayBuffer>;
};

export type DownloadArtifactResult = {
  filename: string;
  mimeType: DownloadArtifactInput["mimeType"];
  byteLength: number;
};

export type PatchAuditInput = {
  beforeHash: string;
  afterHash: string;
  selection: SelectionEnvelope;
  planSource: "openai" | "local-parser";
  plan: PatchPlan;
  verification: VerificationReport;
};

export type PatchAudit = PatchAuditInput & {
  schemaVersion: 1;
  timestamp: string;
};

export function safeDownloadFilename(
  requestedName: string,
  fallbackStem: string,
  extension: ".step" | ".json",
): string {
  if (!ARTIFACT_EXTENSIONS.has(extension)) {
    throw new Error("PatchCAD download extension is unsupported.");
  }

  const leaf = requestedName.trim().replaceAll("\\", "/").split("/").at(-1) ?? "";
  const withoutExtension = leaf.toLowerCase().endsWith(extension.toLowerCase())
    ? leaf.slice(0, -extension.length)
    : leaf;
  const safeStem = normalizeFilenameStem(withoutExtension);
  const safeFallback = normalizeFilenameStem(fallbackStem) || "patchcad-artifact";

  return `${(safeStem || safeFallback).slice(0, 96)}${extension.toLowerCase()}`;
}

export function downloadArtifact(
  input: DownloadArtifactInput,
  environment: DownloadEnvironment = browserDownloadEnvironment(),
): DownloadArtifactResult {
  const extension = input.mimeType === STEP_MIME_TYPE ? ".step" : ".json";
  const fallback = input.mimeType === STEP_MIME_TYPE ? "patchcad-bracket" : "patchcad-audit";
  const filename = safeDownloadFilename(input.filename, fallback, extension);
  const blob = new Blob([toBlobPart(input.data)], { type: input.mimeType });
  const objectUrl = environment.createObjectURL(blob);
  let anchor: DownloadAnchor | undefined;

  try {
    anchor = environment.createAnchor();
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
  } finally {
    try {
      anchor?.remove();
    } finally {
      environment.revokeObjectURL(objectUrl);
    }
  }

  return {
    filename,
    mimeType: input.mimeType,
    byteLength: blob.size,
  };
}

export function createPatchAuditJson(
  input: PatchAuditInput,
  now: Date = new Date(),
): string {
  if (!HASH_PATTERN.test(input.beforeHash) || !HASH_PATTERN.test(input.afterHash)) {
    throw new Error("Patch audit hashes must be lowercase SHA-256 values.");
  }
  if (!PLAN_SOURCES.has(input.planSource)) {
    throw new Error("Patch audit plan source is unsupported.");
  }
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Patch audit timestamp must be valid.");
  }

  const audit: PatchAudit = {
    schemaVersion: 1,
    beforeHash: input.beforeHash,
    afterHash: input.afterHash,
    selection: SelectionEnvelopeSchema.parse(input.selection),
    planSource: input.planSource,
    plan: PatchPlanSchema.parse(input.plan),
    verification: VerificationReportSchema.parse(input.verification),
    timestamp: now.toISOString(),
  };

  return `${JSON.stringify(audit, null, 2)}\n`;
}

export async function hashBracketSnapshot(
  snapshot: BracketSnapshot,
  subtleCrypto: Pick<SubtleCrypto, "digest"> | undefined =
    globalThis.crypto?.subtle,
): Promise<string> {
  if (!subtleCrypto) {
    throw new Error("SHA-256 is unavailable in this browser.");
  }

  const parsed = BracketSnapshotSchema.parse(snapshot);
  const semanticIds = parsed.holes.map((hole) => hole.id);
  if (new Set(semanticIds).size !== semanticIds.length) {
    throw new Error("Bracket holes must have unique semantic IDs before hashing.");
  }
  const canonical = {
    ...parsed,
    holes: [...parsed.holes].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  const digest = await subtleCrypto.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function normalizeFilenameStem(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/[-_]{2,}/g, "-");
}

function toBlobPart(data: DownloadArtifactInput["data"]): BlobPart {
  if (typeof data === "string" || data instanceof ArrayBuffer) return data;
  return data.slice().buffer;
}

function browserDownloadEnvironment(): DownloadEnvironment {
  if (typeof document === "undefined") {
    throw new Error("Downloads require a browser document.");
  }

  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement("a"),
  };
}
