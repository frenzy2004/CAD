import { describe, expect, it } from "vitest";

import {
  commitPreparedResource,
  commitPreparedResourceAsync,
  retainValidatedResource,
} from "@/lib/cad/owned-resource";

class TrackedResource {
  deleted = false;

  delete(): void {
    this.deleted = true;
  }
}

describe("owned CAD resources", () => {
  it("deletes a resource when validation fails before ownership transfer", () => {
    const resource = new TrackedResource();

    expect(() =>
      retainValidatedResource(resource, () => {
        throw new Error("invalid exact solid");
      }),
    ).toThrow("invalid exact solid");
    expect(resource.deleted).toBe(true);
  });

  it("retains a validated resource for its next owner", () => {
    const resource = new TrackedResource();

    expect(retainValidatedResource(resource, () => undefined)).toBe(resource);
    expect(resource.deleted).toBe(false);
  });

  it("deletes an unadopted resource when reply preparation fails", () => {
    const resource = new TrackedResource();
    let adopted = false;

    expect(() =>
      commitPreparedResource(
        resource,
        () => {
          throw new Error("mesh validation failed");
        },
        () => {
          adopted = true;
        },
      ),
    ).toThrow("mesh validation failed");
    expect(adopted).toBe(false);
    expect(resource.deleted).toBe(true);
  });

  it("prepares a reply before transferring resource ownership", () => {
    const resource = new TrackedResource();
    const events: string[] = [];

    const prepared = commitPreparedResource(
      resource,
      () => {
        events.push("prepared");
        return "valid mesh";
      },
      () => {
        events.push("adopted");
      },
    );

    expect(prepared).toBe("valid mesh");
    expect(events).toEqual(["prepared", "adopted"]);
    expect(resource.deleted).toBe(false);
  });

  it("deletes an unadopted resource when async export preparation fails", async () => {
    const resource = new TrackedResource();
    let adopted = false;

    await expect(
      commitPreparedResourceAsync(
        resource,
        async () => {
          throw new Error("STEP serialization failed");
        },
        () => {
          adopted = true;
        },
      ),
    ).rejects.toThrow("STEP serialization failed");
    expect(adopted).toBe(false);
    expect(resource.deleted).toBe(true);
  });

  it("awaits async export preparation before transferring ownership", async () => {
    const resource = new TrackedResource();
    const events: string[] = [];

    const prepared = await commitPreparedResourceAsync(
      resource,
      async () => {
        await Promise.resolve();
        events.push("prepared");
        return new Uint8Array([1, 2, 3]);
      },
      () => {
        events.push("adopted");
      },
    );

    expect([...prepared]).toEqual([1, 2, 3]);
    expect(events).toEqual(["prepared", "adopted"]);
    expect(resource.deleted).toBe(false);
  });
});
