import "server-only";

export function createHealthRoute(_environment: NodeJS.ProcessEnv = process.env) {
  return function GET(): Response {
    return Response.json(
      {
        status: "ok",
        cadRuntime: "browser-wasm",
        providers: { openai: "byok", exa: "byok" },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  };
}
