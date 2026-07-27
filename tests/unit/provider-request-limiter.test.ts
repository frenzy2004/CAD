import { describe, expect, it } from "vitest";

import { createProviderRequestLimiter } from "@/server/provider-request-limiter";

function requestFor(address: string): Request {
  return new Request("http://localhost/api/plan", {
    headers: { "x-forwarded-for": address },
  });
}

describe("process-local provider request limiter", () => {
  it("shares one global in-flight bound across client partitions", () => {
    const limiter = createProviderRequestLimiter({
      maxInFlight: 1,
      clientWindowMs: 60_000,
      maxRequestsPerClientWindow: 10,
      maxTrackedClients: 10,
    });
    const firstLease = limiter.acquire(requestFor("198.51.100.1"));

    expect(firstLease).not.toBeNull();
    expect(limiter.acquire(requestFor("198.51.100.2"))).toBeNull();

    firstLease?.release();
    expect(limiter.acquire(requestFor("198.51.100.2"))).not.toBeNull();
  });

  it("bounds each client window and admits it again after expired entries are pruned", () => {
    let now = 1_000;
    const limiter = createProviderRequestLimiter({
      maxInFlight: 2,
      clientWindowMs: 1_000,
      maxRequestsPerClientWindow: 1,
      maxTrackedClients: 2,
      now: () => now,
    });
    const request = requestFor("198.51.100.3");

    limiter.acquire(request)?.release();
    expect(limiter.acquire(request)).toBeNull();

    now = 2_001;
    expect(limiter.acquire(request)).not.toBeNull();
  });

  it("keeps spoofed client partitions within a finite tracking bound", () => {
    const limiter = createProviderRequestLimiter({
      maxInFlight: 2,
      clientWindowMs: 60_000,
      maxRequestsPerClientWindow: 1,
      maxTrackedClients: 2,
    });

    for (let index = 0; index < 20; index += 1) {
      limiter.acquire(requestFor(`198.51.100.${index}`))?.release();
    }

    expect(limiter.trackedClientCount).toBeLessThanOrEqual(2);
  });
});
