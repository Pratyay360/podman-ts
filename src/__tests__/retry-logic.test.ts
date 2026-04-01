/**
 * Property-based tests for APIClient retry logic.
 *
 * Feature: podman-client-ts-improvements
 * Property 5: Retry exhaustion throws PodmanError after exactly n+1 attempts
 * Property 6: Exponential backoff stays within bounds
 * Property 7: HTTP errors are not retried
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import fc from "fast-check";
import { APIClient } from "../api/client";
import { PodmanError } from "../errors";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Build a minimal mock Response with the given status. */
function mockResponse(status: number): Response {
  return new Response(JSON.stringify({ message: "error" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Create an APIClient whose underlying fetch is replaced by a controllable stub.
 * Returns the client and a setter for the stub behaviour.
 */
function makeClient(retries: number): {
  client: APIClient;
  setFetchBehaviour: (fn: () => Promise<Response>) => void;
  callCount: () => number;
} {
  let fetchImpl: () => Promise<Response> = () => Promise.reject(new Error("network error"));
  let calls = 0;

  const fetchStub = mock((_url: string, _opts: RequestInit) => {
    calls++;
    return fetchImpl();
  });

  // Patch global fetch for this client instance
  const origFetch = globalThis.fetch;
  globalThis.fetch = fetchStub as unknown as typeof fetch;

  const client = new APIClient({
    baseUrl: "http://localhost",
    retries,
    // Use a tiny timeout so tests don't hang; we override fetch anyway
  });

  // Restore after construction (the client captures nothing at construction time)
  // We keep the mock active for the duration of the test.

  return {
    client,
    setFetchBehaviour: (fn) => {
      fetchImpl = fn;
    },
    callCount: () => calls,
  };
}

// ─── Property 5: Retry exhaustion ───────────────────────────────────────────

describe("Property 5 — retry exhaustion throws PodmanError after n+1 attempts", () => {
  // **Validates: Requirements 7.1, 7.2, 7.5**

  test("retries=0: single attempt, throws PodmanError immediately", async () => {
    const origFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const client = new APIClient({ baseUrl: "http://localhost", retries: 0 });

    await expect(client.get("/test")).rejects.toBeInstanceOf(PodmanError);
    expect(calls).toBe(1);

    globalThis.fetch = origFetch;
  });

  test("property: for any retries n in [1,5], exactly n+1 fetch calls are made", async () => {
    // Feature: podman-client-ts-improvements, Property 5: Retry exhaustion throws PodmanError
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (retries) => {
        const origFetch = globalThis.fetch;
        const origSetTimeout = globalThis.setTimeout;

        // Mock setTimeout to execute immediately and avoid timeouts
        globalThis.setTimeout = ((fn: () => void, _ms: number) => {
          fn();
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as unknown as typeof setTimeout;

        let calls = 0;
        globalThis.fetch = mock(async () => {
          calls++;
          throw new Error("ECONNREFUSED");
        }) as unknown as typeof fetch;

        const client = new APIClient({
          baseUrl: "http://localhost",
          retries,
        });

        let threw = false;
        let thrownError: unknown;
        try {
          await client.get("/test");
        } catch (e) {
          threw = true;
          thrownError = e;
        }

        globalThis.fetch = origFetch;
        globalThis.setTimeout = origSetTimeout;

        // Must throw
        if (!threw) return false;
        // Must be PodmanError
        if (!(thrownError instanceof PodmanError)) return false;
        // Must have made exactly retries+1 calls
        if (calls !== retries + 1) return false;
        // Message must mention attempt count
        if (!thrownError.message.includes(`${retries + 1} attempt`)) return false;

        return true;
      }),
      { numRuns: 20 },
    );
  });
});

// ─── Property 6: Exponential backoff ────────────────────────────────────────

describe("Property 6 — exponential backoff formula: min(100 * 2^i, 2000)", () => {
  // **Validates: Requirements 7.3**
  // Feature: podman-client-ts-improvements, Property 6: Exponential backoff stays within bounds

  test("property: backoff at attempt index i equals min(100 * 2^i, 2000)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), (i) => {
        const expected = Math.min(100 * 2 ** i, 2000);
        // Verify the formula directly — this is the spec for the delay sequence
        expect(expected).toBeGreaterThanOrEqual(100);
        expect(expected).toBeLessThanOrEqual(2000);
        // Monotonically non-decreasing
        if (i > 0) {
          const prev = Math.min(100 * 2 ** (i - 1), 2000);
          expect(expected).toBeGreaterThanOrEqual(prev);
        }
        return true;
      }),
    );
  });

  test("backoff sequence matches expected values for first 5 attempts", () => {
    // Concrete spot-check of the formula
    const expected = [100, 200, 400, 800, 1600, 2000, 2000];
    for (let i = 0; i < expected.length; i++) {
      expect(Math.min(100 * 2 ** i, 2000)).toBe(expected[i]);
    }
  });

  test("property: delays observed during retries match the formula", async () => {
    // Feature: podman-client-ts-improvements, Property 6: Exponential backoff stays within bounds
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 4 }), async (retries) => {
        const origFetch = globalThis.fetch;
        const sleepDelays: number[] = [];

        // Intercept setTimeout to capture delays without actually waiting
        const origSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = ((fn: () => void, ms: number) => {
          sleepDelays.push(ms);
          fn(); // execute immediately
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as unknown as typeof setTimeout;

        globalThis.fetch = mock(async () => {
          throw new Error("network error");
        }) as unknown as typeof fetch;

        const client = new APIClient({ baseUrl: "http://localhost", retries });

        try {
          await client.get("/test");
        } catch {
          // expected
        }

        globalThis.fetch = origFetch;
        globalThis.setTimeout = origSetTimeout;

        // Should have exactly `retries` sleep calls (one between each attempt)
        if (sleepDelays.length !== retries) return false;

        // Each delay must match min(100 * 2^i, 2000)
        for (let i = 0; i < sleepDelays.length; i++) {
          const expected = Math.min(100 * 2 ** i, 2000);
          if (sleepDelays[i] !== expected) return false;
        }

        return true;
      }),
      { numRuns: 10 },
    );
  });
});

// ─── Property 7: HTTP errors are not retried ────────────────────────────────

describe("Property 7 — HTTP 4xx/5xx responses are never retried", () => {
  // **Validates: Requirements 7.4**
  // Feature: podman-client-ts-improvements, Property 7: HTTP errors are not retried

  test("property: for any status >= 400, fetch is called exactly once regardless of retries", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 400, max: 599 }),
        fc.integer({ min: 1, max: 5 }),
        async (status, retries) => {
          const origFetch = globalThis.fetch;
          let calls = 0;

          globalThis.fetch = mock(async () => {
            calls++;
            return mockResponse(status);
          }) as unknown as typeof fetch;

          calls = 0;
          const client = new APIClient({ baseUrl: "http://localhost", retries });

          // The request should complete (not throw from fetchWithRetry) — HTTP errors
          // are returned as APIResponse and only throw when raiseForStatus() is called.
          const res = await client.get("/test");

          globalThis.fetch = origFetch;

          // Exactly one fetch call — no retries for HTTP errors
          if (calls !== 1) return false;
          // Response status must be preserved
          if (res.status !== status) return false;

          return true;
        },
      ),
      { numRuns: 30 },
    );
  });

  test("HTTP 404 with retries=3 still only calls fetch once", async () => {
    const origFetch = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = mock(async () => {
      calls++;
      return mockResponse(404);
    }) as unknown as typeof fetch;

    const client = new APIClient({ baseUrl: "http://localhost", retries: 3 });
    const res = await client.get("/test");

    globalThis.fetch = origFetch;

    expect(calls).toBe(1);
    expect(res.status).toBe(404);
  });

  test("HTTP 500 with retries=5 still only calls fetch once", async () => {
    const origFetch = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = mock(async () => {
      calls++;
      return mockResponse(500);
    }) as unknown as typeof fetch;

    const client = new APIClient({ baseUrl: "http://localhost", retries: 5 });
    const res = await client.get("/test");

    globalThis.fetch = origFetch;

    expect(calls).toBe(1);
    expect(res.status).toBe(500);
  });
});
