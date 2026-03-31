/**
 * Unit + property tests for APIClient.buildUrlPublic (URL construction).
 *
 * Feature: podman-client-ts-improvements
 * Property 1: libpod URL contains version segment exactly once
 * Property 2: compat URL contains version segment exactly once
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { APIClient } from "../api/client";

function makeClient(version?: string): APIClient {
  return new APIClient({ baseUrl: "http://localhost", version });
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

describe("buildUrl — libpod paths", () => {
  test("produces /v{version}/libpod{path} for a plain path", () => {
    const client = makeClient("5.0.0");
    const url = client.buildUrlPublic("/containers/json", false);
    expect(url).toBe("http://localhost/v5.0.0/libpod/containers/json");
  });

  test("strips leading v from version string", () => {
    const client = makeClient("v5.0.0");
    const url = client.buildUrlPublic("/containers/json", false);
    expect(url).toBe("http://localhost/v5.0.0/libpod/containers/json");
  });

  test("uses default version 5.0.0 when none provided", () => {
    const client = makeClient();
    const url = client.buildUrlPublic("/containers/json", false);
    expect(url).toContain("/v5.0.0/libpod/");
  });

  test("appends query params", () => {
    const client = makeClient("5.0.0");
    const url = client.buildUrlPublic("/containers/json", false, { all: true });
    expect(url).toBe("http://localhost/v5.0.0/libpod/containers/json?all=true");
  });

  test("omits null/undefined query params", () => {
    const client = makeClient("5.0.0");
    const url = client.buildUrlPublic("/containers/json", false, { all: undefined, limit: null as unknown as undefined });
    expect(url).toBe("http://localhost/v5.0.0/libpod/containers/json");
  });
});

describe("buildUrl — compat paths", () => {
  test("produces /v{version}/compat{path}", () => {
    const client = makeClient("5.0.0");
    const url = client.buildUrlPublic("/containers/json", true);
    expect(url).toBe("http://localhost/v5.0.0/compat/containers/json");
  });

  test("strips leading v from version for compat too", () => {
    const client = makeClient("v5.0.0");
    const url = client.buildUrlPublic("/containers/json", true);
    expect(url).toBe("http://localhost/v5.0.0/compat/containers/json");
  });
});

// ─── Property 1: libpod URL contains version segment exactly once ─────────────

describe("Property 1 — libpod URL contains /v{semver}/libpod exactly once", () => {
  // Feature: podman-client-ts-improvements, Property 1: libpod URL contains version segment exactly once

  const semverArb = fc
    .tuple(
      fc.integer({ min: 0, max: 9 }),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
    )
    .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

  test("property: URL contains /v{ver}/libpod exactly once (bare semver)", () => {
    fc.assert(
      fc.property(semverArb, fc.constantFrom("/containers/json", "/images/json", "/info"), (ver, path) => {
        const client = makeClient(ver);
        const url = client.buildUrlPublic(path, false);
        const segment = `/v${ver}/libpod`;
        // appears exactly once
        expect(url.indexOf(segment)).toBe(url.lastIndexOf(segment));
        expect(url).toContain(segment);
        // no double-v prefix
        expect(url).not.toContain("/vv");
        // no double-slash before libpod
        expect(url).not.toContain("//libpod");
      }),
    );
  });

  test("property: URL contains /v{ver}/libpod exactly once (v-prefixed semver)", () => {
    fc.assert(
      fc.property(semverArb, (ver) => {
        const client = makeClient(`v${ver}`);
        const url = client.buildUrlPublic("/containers/json", false);
        const segment = `/v${ver}/libpod`;
        expect(url.indexOf(segment)).toBe(url.lastIndexOf(segment));
        expect(url).toContain(segment);
        expect(url).not.toContain("/vv");
      }),
    );
  });
});

// ─── Property 2: compat URL contains version segment exactly once ─────────────

describe("Property 2 — compat URL contains /v{semver}/compat exactly once", () => {
  // Feature: podman-client-ts-improvements, Property 2: compat URL contains version segment exactly once

  const semverArb = fc
    .tuple(
      fc.integer({ min: 0, max: 9 }),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
    )
    .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

  test("property: compat URL contains /v{ver}/compat exactly once (bare semver)", () => {
    fc.assert(
      fc.property(semverArb, (ver) => {
        const client = makeClient(ver);
        const url = client.buildUrlPublic("/containers/json", true);
        const segment = `/v${ver}/compat`;
        expect(url.indexOf(segment)).toBe(url.lastIndexOf(segment));
        expect(url).toContain(segment);
        expect(url).not.toContain("/vv");
      }),
    );
  });

  test("property: compat URL contains /v{ver}/compat exactly once (v-prefixed semver)", () => {
    fc.assert(
      fc.property(semverArb, (ver) => {
        const client = makeClient(`v${ver}`);
        const url = client.buildUrlPublic("/containers/json", true);
        const segment = `/v${ver}/compat`;
        expect(url.indexOf(segment)).toBe(url.lastIndexOf(segment));
        expect(url).toContain(segment);
        expect(url).not.toContain("/vv");
      }),
    );
  });
});
