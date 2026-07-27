import "server-only";

import { PROVIDER_KEY_REQUIRED_CODE } from "@/lib/provider-keys";

export function readRequestProviderKey(request: Request, header: string): string | undefined {
  const key = request.headers.get(header)?.trim();
  return key && key.length <= 1024 ? key : undefined;
}

export function createProviderKeyRequiredResponse(): Response {
  return Response.json(
    { error: { code: PROVIDER_KEY_REQUIRED_CODE } },
    { status: 401 },
  );
}
