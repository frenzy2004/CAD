import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";

const MAGIC_CIRCLE_NAME = /Magic Circle CAD selection/i;

type BrowserErrors = {
  console: string[];
  page: string[];
  resources: string[];
  warnings: string[];
};

async function collectBrowserErrors(page: Page): Promise<BrowserErrors> {
  const errors: BrowserErrors = {
    console: [],
    page: [],
    resources: [],
    warnings: [],
  };
  await page.addInitScript(() => {
    const events: unknown[] = [];
    const workers: Worker[] = [];
    Object.defineProperty(window, "__patchcadWorkerEvents", {
      configurable: false,
      value: events,
    });
    Object.defineProperty(window, "__patchcadWorkers", {
      configurable: false,
      value: workers,
    });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        workers.push(this);
        events.push({ type: "created", url: String(args[0]) });
        this.addEventListener("message", (event) => {
          events.push({ type: "message", data: event.data });
        });
        this.addEventListener("error", (event) => {
          events.push({ type: "error", message: event.message });
        });
      }
    };
  });
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") errors.console.push(message.text());
    if (message.type() === "warning") errors.warnings.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("response", (response) => {
    if (/cad-runtime|worker/i.test(response.url())) {
      errors.resources.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    errors.resources.push(
      `FAILED ${request.url()} ${request.failure()?.errorText ?? ""}`.trim(),
    );
  });
  return errors;
}

function unexpectedConsoleErrors(errors: BrowserErrors): string[] {
  return errors.console.filter(
    (message) =>
      !message.includes(
        "Failed to load resource: the server responded with a status of 503",
      ),
  );
}

async function waitForExactKernel(
  page: Page,
  errors: BrowserErrors,
) {
  const result = await Promise.race([
    page
      .getByText("Exact kernel ready", { exact: false })
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => "ready" as const),
    page
      .getByRole("alert")
      .filter({ hasText: "exact browser CAD kernel could not start" })
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => "failed" as const),
  ]);

  if (result === "failed") {
    const workerEvents = await page.evaluate(
      () =>
        (
          window as unknown as {
            __patchcadWorkerEvents?: unknown[];
          }
        ).__patchcadWorkerEvents ?? [],
    );
    throw new Error(
      `The exact browser kernel failed to start: ${JSON.stringify({
        ...errors,
        workerEvents,
      })}`,
    );
  }
}

async function useOfflineRoutes(page: Page) {
  await page.route("**/api/plan", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "AI_NOT_CONFIGURED" } }),
    });
  });
  await page.route("**/api/research", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "RESEARCH_NOT_CONFIGURED" } }),
    });
  });
}

async function circleFeature(page: Page, featureId: string) {
  const surface = page.getByRole("region", {
    name: MAGIC_CIRCLE_NAME,
  });
  const status = surface.getByRole("status");
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error("Magic Circle surface has no layout bounds.");

  const radius = Math.max(18, Math.min(bounds.width, bounds.height) * 0.035);
  const preferredFractions: Record<string, [number, number]> = {
    "hole:nw": [0.69, 0.42],
    "hole:ne": [0.43, 0.73],
    "hole:sw": [0.55, 0.3],
    "hole:se": [0.29, 0.55],
  };
  const observedStatuses = new Set<string>();
  const fractions = [
    0.18,
    0.24,
    0.3,
    0.36,
    0.42,
    0.48,
    0.54,
    0.6,
    0.66,
    0.72,
    0.78,
    0.84,
  ];

  async function attempt(xFraction: number, yFraction: number) {
    const x = bounds.x + bounds.width * xFraction;
    const y = bounds.y + bounds.height * yFraction;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + radius, y);
    await page.mouse.up();
    await page.waitForTimeout(40);
    const statusText = (await status.textContent()) ?? "";
    observedStatuses.add(statusText);
    return statusText.includes(`Selected ${featureId},`);
  }

  const preferred = preferredFractions[featureId];
  if (preferred && (await attempt(preferred[0], preferred[1]))) return;
  for (const candidate of Object.values(preferredFractions)) {
    if (candidate === preferred) continue;
    if (await attempt(candidate[0], candidate[1])) return;
  }

  for (const yFraction of fractions) {
    for (const xFraction of fractions) {
      if (await attempt(xFraction, yFraction)) return;
    }
  }

  throw new Error(
    `Could not select ${featureId} with the Magic Circle in the rendered viewport. Observed: ${JSON.stringify([...observedStatuses])}`,
  );
}

test("@smoke completes an exact offline local patch and STEP export", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = await collectBrowserErrors(page);
  await useOfflineRoutes(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/PatchCAD/);
  await expect(page.getByRole("main")).toBeVisible();
  await waitForExactKernel(page, errors);

  await circleFeature(page, "hole:nw");
  await expect(page.getByText("hole:nw", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Current diameter")).toHaveText("6 mm");

  await page
    .getByRole("textbox", { name: "Patch instruction" })
    .fill("make this hole 8 mm");
  await page.getByRole("button", { name: "Preview patch" }).click();

  await expect(page.getByText("Offline grammar")).toBeVisible();
  await expect(page.getByText("1 changed feature")).toBeVisible();
  await expect(page.getByText("3 protected holes unchanged")).toBeVisible();

  await page.getByRole("button", { name: "Apply verified patch" }).click();
  await expect(page.getByLabel("Current diameter")).toHaveText("8 mm");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download STEP" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("patchcad-bracket.step");
  const stream = await download.createReadStream();
  let downloadedBytes = 0;
  for await (const chunk of stream) downloadedBytes += chunk.length;
  expect(downloadedBytes).toBeGreaterThan(0);
  await expect(page.getByText(/STEP [1-9]/, { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Undo patch" }).click();
  await expect(page.getByLabel("Current diameter")).toHaveText("6 mm");
  expect(
    errors.console.filter((message) => message.includes("status of 503")),
  ).toHaveLength(2);
  expect(unexpectedConsoleErrors(errors)).toEqual([]);
  expect(errors.page).toEqual([]);
  expect(
    errors.warnings.filter((message) =>
      message.includes("PCFSoftShadowMap has been deprecated"),
    ),
  ).toEqual([]);
});

test("accepts a route-mocked typed OpenAI plan", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await collectBrowserErrors(page);
  await page.route("**/api/plan", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plan: {
          version: 2,
          operation: "resize_hole",
          targetFeatureId: "hole:nw",
          diameterMm: 8,
          rationale: "Resize hole:nw to 8 mm.",
        },
        source: "openai",
      }),
    });
  });
  await page.route("**/api/research", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sources: [] }),
    });
  });

  await page.goto("/");
  await waitForExactKernel(page, errors);
  await circleFeature(page, "hole:nw");
  await page
    .getByRole("textbox", { name: "Patch instruction" })
    .fill("make this hole 8 mm");
  await page.getByRole("button", { name: "Preview patch" }).click();

  await expect(page.getByText("OpenAI plan")).toBeVisible();
  await expect(page.getByText("3 protected holes unchanged")).toBeVisible();
});

test("round-trips exact STEP and limits imported edits to a hit planar face", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = await collectBrowserErrors(page);
  await useOfflineRoutes(page);
  await page.goto("/");
  await waitForExactKernel(page, errors);

  const result = await page.evaluate(async () => {
    type FaceGroup = {
      start: number;
      count: number;
      faceId: number;
    };
    type MeshReply = {
      type: "mesh";
      mesh: {
        positions: Float32Array;
        indices: Uint32Array;
        normals: Float32Array;
        bounds: { max: { z: number } };
        faceGroups: FaceGroup[];
        holeAnchors: Array<{
          featureId: string;
          diameterMm: number;
        }>;
      };
    };
    type ImportedReply = {
      type: "imported";
      model: { solidCount: number };
      mesh: MeshReply["mesh"];
    };
    type StepReply = {
      type: "step";
      bytes: ArrayBuffer;
    };
    type ErrorReply = {
      type: "error";
      code: string;
      message: string;
    };
    type Reply =
      | MeshReply
      | ImportedReply
      | StepReply
      | ErrorReply
      | { type: "ready" };

    const worker = (
      window as unknown as {
        __patchcadWorkers?: Worker[];
      }
    ).__patchcadWorkers?.[0];
    if (!worker) throw new Error("PatchCAD worker probe is unavailable.");

    function request(
      command: Record<string, unknown>,
      transfer: Transferable[] = [],
    ): Promise<Reply> {
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Direct worker request timed out: ${id}`)),
          30_000,
        );
        const onMessage = (event: MessageEvent<Reply & { id?: string }>) => {
          if (event.data.id !== id) return;
          clearTimeout(timeout);
          worker.removeEventListener("message", onMessage);
          resolve(event.data);
        };
        worker.addEventListener("message", onMessage);
        worker.postMessage({ ...command, id }, transfer);
      });
    }

    function topFace(mesh: MeshReply["mesh"]): {
      faceId: number;
      z: number;
    } {
      for (const group of mesh.faceGroups) {
        let normalZ = 0;
        let samples = 0;
        for (
          let offset = group.start;
          offset < group.start + group.count;
          offset += 1
        ) {
          const vertexIndex = mesh.indices[offset];
          normalZ += mesh.normals[vertexIndex * 3 + 2];
          samples += 1;
        }
        if (samples > 0 && normalZ / samples > 0.8) {
          return {
            faceId: group.faceId,
            z: mesh.positions[mesh.indices[group.start] * 3 + 2],
          };
        }
      }
      throw new Error("Imported mesh has no upward planar face group.");
    }

    const exported = await request({ type: "export-step" });
    if (exported.type !== "step") {
      throw new Error(`Expected STEP reply, received ${exported.type}.`);
    }
    const exportedByteLength = exported.bytes.byteLength;

    const imported = await request(
      { type: "import-step", bytes: exported.bytes.slice(0) },
      [],
    );
    if (imported.type !== "imported") {
      throw new Error(`Expected imported reply, received ${imported.type}.`);
    }
    const top = topFace(imported.mesh);
    const faceId = top.faceId;
    const center = {
      x: 50,
      y: 32,
      z: top.z,
    };
    const added = await request({
      type: "cut-session-hole",
      faceId,
      pointMm: center,
      diameterMm: 5,
    });
    if (added.type !== "mesh") {
      throw new Error(
        `Expected add-hole mesh, received ${added.type}${
          added.type === "error"
            ? ` (${added.code}: ${added.message})`
            : ""
        }. ${JSON.stringify({
          faceId,
          bounds: imported.mesh.bounds,
          groups: imported.mesh.faceGroups.map((group) => ({
            ...group,
            averageNormalZ: (() => {
              let total = 0;
              for (
                let offset = group.start;
                offset < group.start + group.count;
                offset += 1
              ) {
                total +=
                  imported.mesh.normals[
                    imported.mesh.indices[offset] * 3 + 2
                  ];
              }
              return total / group.count;
            })(),
          })),
        })}`,
      );
    }
    const addedDiameter = added.mesh.holeAnchors.find(
      (anchor) => anchor.featureId === "session-hole:1",
    )?.diameterMm;

    const resized = await request({
      type: "cut-session-hole",
      faceId,
      pointMm: center,
      diameterMm: 7,
    });
    if (resized.type !== "mesh") {
      throw new Error(`Expected resize mesh, received ${resized.type}.`);
    }
    const resizedDiameter = resized.mesh.holeAnchors.find(
      (anchor) => anchor.featureId === "session-hole:1",
    )?.diameterMm;

    const resetImport = await request({
      type: "import-step",
      bytes: exported.bytes.slice(0),
    });
    if (resetImport.type !== "imported") {
      throw new Error(`Expected reset import, received ${resetImport.type}.`);
    }
    const resetTop = topFace(resetImport.mesh);
    const rejected = await request({
      type: "cut-session-hole",
      faceId: resetTop.faceId,
      pointMm: {
        x: 12,
        y: 52,
        z: resetTop.z,
      },
      diameterMm: 8,
    });

    return {
      exportedByteLength,
      importedSolidCount: imported.model.solidCount,
      addedDiameter,
      resizedDiameter,
      preExistingHoleReply:
        rejected.type === "error" ? rejected.code : rejected.type,
    };
  });

  expect(result).toEqual({
    exportedByteLength: expect.any(Number),
    importedSolidCount: 1,
    addedDiameter: 5,
    resizedDiameter: 7,
    preExistingHoleReply: "POINT_NOT_ON_FACE",
  });
  expect(result.exportedByteLength).toBeGreaterThan(0);
  expect(unexpectedConsoleErrors(errors)).toEqual([]);
  expect(errors.page).toEqual([]);
});

test("keeps the full editing workspace usable at 390 by 844", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = await collectBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await useOfflineRoutes(page);
  await page.goto("/");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("complementary", {
    name: "Patch inspector",
  })).toBeVisible();
  await waitForExactKernel(page, errors);
  await expect(
    page.getByRole("region", { name: MAGIC_CIRCLE_NAME }),
  ).toBeVisible();

  const bodyWidth = await page.locator("body").evaluate(
    (body) => body.scrollWidth,
  );
  expect(bodyWidth).toBeLessThanOrEqual(390);
  await expect(
    page.getByRole("button", { name: "Preview patch" }),
  ).toBeVisible();
});

test("@smoke exposes a safe health response", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    status: "ok",
    cadRuntime: "browser-wasm",
    openaiConfigured: expect.any(Boolean),
    exaConfigured: expect.any(Boolean),
  });
});
