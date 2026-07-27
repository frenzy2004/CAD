import "server-only";

const OVERFLOW_CLIENT = "__overflow__";
const UNKNOWN_CLIENT = "__unknown__";

export type ProviderRequestLease = {
  release(): void;
};

export type ProviderRequestLimiter = {
  acquire(request: Request): ProviderRequestLease | null;
  readonly trackedClientCount: number;
};

type ProviderRequestLimiterOptions = {
  maxInFlight: number;
  clientWindowMs: number;
  maxRequestsPerClientWindow: number;
  maxTrackedClients: number;
  now?: () => number;
};

type ClientWindow = {
  startedAt: number;
  requestCount: number;
};

export function createProviderRequestLimiter(
  options: ProviderRequestLimiterOptions,
): ProviderRequestLimiter {
  const {
    maxInFlight,
    clientWindowMs,
    maxRequestsPerClientWindow,
    maxTrackedClients,
    now = Date.now,
  } = options;
  const clients = new Map<string, ClientWindow>();
  let inFlight = 0;

  function pruneExpired(currentTime: number): void {
    for (const [client, window] of clients) {
      if (currentTime - window.startedAt >= clientWindowMs) {
        clients.delete(client);
      }
    }
  }

  function partitionFor(request: Request): string {
    const address = readClientAddress(request);
    if (clients.has(address) || clients.size < maxTrackedClients) return address;
    if (!clients.has(OVERFLOW_CLIENT)) {
      const oldestClient = clients.keys().next().value as string | undefined;
      if (oldestClient) clients.delete(oldestClient);
    }
    return OVERFLOW_CLIENT;
  }

  return {
    acquire(request) {
      const currentTime = now();
      pruneExpired(currentTime);
      if (inFlight >= maxInFlight) return null;

      const client = partitionFor(request);
      const currentWindow = clients.get(client);
      if (
        currentWindow &&
        currentWindow.requestCount >= maxRequestsPerClientWindow
      ) {
        return null;
      }

      if (currentWindow) {
        currentWindow.requestCount += 1;
      } else {
        clients.set(client, { startedAt: currentTime, requestCount: 1 });
      }
      inFlight += 1;
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          inFlight -= 1;
        },
      };
    },
    get trackedClientCount() {
      return clients.size;
    },
  };
}

function readClientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0];
  const address =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    forwarded ??
    UNKNOWN_CLIENT;
  const bounded = address.trim().slice(0, 128);
  return bounded || UNKNOWN_CLIENT;
}

export const providerRequestLimiter = createProviderRequestLimiter({
  maxInFlight: 4,
  clientWindowMs: 60_000,
  maxRequestsPerClientWindow: 20,
  maxTrackedClients: 1_024,
});
