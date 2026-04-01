/**
 * Unit + property tests for prepareFilters.
 *
 * Feature: podman-client-ts-improvements
 * Property 3: prepareFilters round-trip — every key-value pair is preserved as string arrays
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { prepareFilters } from "../api/utils";

// ─── Unit tests ──────────────────────────────────────────────────────────────

describe("prepareFilters — unit tests", () => {
  test("returns undefined for undefined input", () => {
    expect(prepareFilters(undefined)).toBeUndefined();
  });

  test("returns undefined for null input", () => {
    expect(prepareFilters(null)).toBeUndefined();
  });

  test("returns undefined for empty object", () => {
    expect(prepareFilters({})).toBeUndefined();
  });

  test("returns undefined for empty array", () => {
    expect(prepareFilters([])).toBeUndefined();
  });

  test("single string value is wrapped in an array", () => {
    const result = prepareFilters({ status: "running" });
    expect(result).toBeDefined();
    expect(JSON.parse(result!)).toEqual({ status: ["running"] });
  });

  test("single boolean value is stringified and wrapped", () => {
    const result = prepareFilters({ dangling: true });
    expect(result).toBeDefined();
    expect(JSON.parse(result!)).toEqual({ dangling: ["true"] });
  });

  test("single number value is stringified and wrapped", () => {
    const result = prepareFilters({ exitCode: 0 });
    expect(result).toBeDefined();
    expect(JSON.parse(result!)).toEqual({ exitCode: ["0"] });
  });

  test("array-of-string value is preserved as-is", () => {
    const result = prepareFilters({ status: ["running", "paused"] });
    expect(result).toBeDefined();
    expect(JSON.parse(result!)).toEqual({ status: ["running", "paused"] });
  });

  test("multi-value object with multiple keys", () => {
    const result = prepareFilters({ status: "running", label: "app=web" });
    expect(result).toBeDefined();
    const parsed = JSON.parse(result!);
    expect(parsed).toEqual({ status: ["running"], label: ["app=web"] });
  });

  test("null values are skipped", () => {
    const result = prepareFilters({ status: "running", name: null });
    expect(result).toBeDefined();
    const parsed = JSON.parse(result!);
    expect(parsed).not.toHaveProperty("name");
    expect(parsed).toHaveProperty("status");
  });

  test("undefined values are skipped", () => {
    const result = prepareFilters({ status: "running", name: undefined });
    expect(result).toBeDefined();
    const parsed = JSON.parse(result!);
    expect(parsed).not.toHaveProperty("name");
  });

  test("array-of-string input: parses key=value pairs", () => {
    const result = prepareFilters(["status=running", "label=app=web"]);
    expect(result).toBeDefined();
    const parsed = JSON.parse(result!);
    expect(parsed["status"]).toEqual(["running"]);
    expect(parsed["label"]).toEqual(["app=web"]);
  });

  test("array-of-string input: multiple values for same key", () => {
    const result = prepareFilters(["status=running", "status=paused"]);
    expect(result).toBeDefined();
    const parsed = JSON.parse(result!);
    expect(parsed["status"]).toEqual(["running", "paused"]);
  });

  test("array-of-string input: entries without '=' are ignored", () => {
    const result = prepareFilters(["status=running", "badentry"]);
    expect(result).toBeDefined();
    const parsed = JSON.parse(result!);
    expect(parsed).not.toHaveProperty("badentry");
    expect(parsed["status"]).toEqual(["running"]);
  });

  test("output is valid JSON string", () => {
    const result = prepareFilters({ status: "running" });
    expect(() => JSON.parse(result!)).not.toThrow();
  });
});

// ─── Property 3: prepareFilters round-trip ───────────────────────────────────

describe("Property 3 — prepareFilters round-trip preserves all key-value pairs as string arrays", () => {
  // Feature: podman-client-ts-improvements, Property 3: prepareFilters round-trip

  // Arbitrary for a non-empty filters object with string values
  const filtersArb = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
    fc.oneof(
      fc.string({ minLength: 1, maxLength: 30 }),
      fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
    ),
    { minKeys: 1, maxKeys: 5 },
  );

  test("property: every key maps to an array of strings in the output", () => {
    fc.assert(
      fc.property(filtersArb, (filters) => {
        const result = prepareFilters(filters as Record<string, string | string[]>);
        expect(result).toBeDefined();
        const parsed = JSON.parse(result!) as Record<string, unknown>;

        // Every key in output maps to a non-empty string array
        for (const [key, val] of Object.entries(parsed)) {
          expect(Array.isArray(val)).toBe(true);
          for (const item of val as unknown[]) {
            expect(typeof item).toBe("string");
          }
        }
      }),
    );
  });

  test("property: every input key appears in the output", () => {
    fc.assert(
      fc.property(filtersArb, (filters) => {
        const result = prepareFilters(filters as Record<string, string | string[]>);
        expect(result).toBeDefined();
        const parsed = JSON.parse(result!) as Record<string, string[]>;

        for (const key of Object.keys(filters)) {
          expect(parsed).toHaveProperty(key);
        }
      }),
    );
  });

  test("property: every input value is represented in the output array", () => {
    fc.assert(
      fc.property(filtersArb, (filters) => {
        const result = prepareFilters(filters as Record<string, string | string[]>);
        const parsed = JSON.parse(result!) as Record<string, string[]>;

        for (const [key, val] of Object.entries(filters)) {
          const inputValues = Array.isArray(val) ? val : [String(val)];
          const outputValues = parsed[key];
          for (const v of inputValues) {
            expect(outputValues).toContain(String(v));
          }
        }
      }),
    );
  });

  test("property: result is always valid JSON when input is non-empty", () => {
    fc.assert(
      fc.property(filtersArb, (filters) => {
        const result = prepareFilters(filters as Record<string, string | string[]>);
        expect(result).toBeDefined();
        expect(() => JSON.parse(result!)).not.toThrow();
      }),
    );
  });

  test("property: array-of-string input round-trips correctly", () => {
    // Generate key=value pairs
    const pairsArb = fc.array(
      fc.tuple(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("=")),
      ),
      { minLength: 1, maxLength: 5 },
    );

    fc.assert(
      fc.property(pairsArb, (pairs) => {
        const input = pairs.map(([k, v]) => `${k}=${v}`);
        const result = prepareFilters(input);
        expect(result).toBeDefined();
        const parsed = JSON.parse(result!) as Record<string, string[]>;

        // Every pair must appear in the output
        for (const [k, v] of pairs) {
          expect(parsed[k]).toBeDefined();
          expect(parsed[k]).toContain(v);
        }
      }),
    );
  });
});
