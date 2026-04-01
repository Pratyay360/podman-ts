/**
 * Unit + property tests for PodmanConfig.
 *
 * Feature: podman-client-ts-improvements
 * Property 8: PodmanConfig services round-trip — every connection in JSON maps to a ServiceConnection with correct URI
 *
 * Tests use a temporary directory with synthetic config files to avoid
 * touching the real user config.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fc from "fast-check";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PodmanConfig } from "../domain/config";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "podman-config-test-"));
}

function writeJson(dir: string, content: object): void {
  writeFileSync(join(dir, "podman-connections.json"), JSON.stringify(content), "utf-8");
}

function writeToml(dir: string, content: string): void {
  writeFileSync(join(dir, "containers.conf"), content, "utf-8");
}

// Minimal valid JSON connection file structure
function makeConnectionJson(connections: Record<string, { URI: string }>): object {
  return {
    Connection: {
      Default: Object.keys(connections)[0] ?? "",
      Connections: connections,
    },
  };
}

// ─── Unit tests — JSON parsing ────────────────────────────────────────────────

describe("PodmanConfig — JSON connection file parsing", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("reads a single connection from JSON", () => {
    writeJson(tmpDir, makeConnectionJson({ default: { URI: "unix:///run/podman/podman.sock" } }));
    const cfg = new PodmanConfig(tmpDir);
    const services = cfg.services;
    expect(Object.keys(services)).toHaveLength(1);
    expect(services["default"]).toBeDefined();
    expect(services["default"].attrs.URI).toBe("unix:///run/podman/podman.sock");
  });

  test("reads multiple connections from JSON", () => {
    writeJson(
      tmpDir,
      makeConnectionJson({
        local: { URI: "unix:///run/podman/podman.sock" },
        remote: { URI: "tcp://192.168.1.10:8080" },
      }),
    );
    const cfg = new PodmanConfig(tmpDir);
    const services = cfg.services;
    expect(Object.keys(services)).toHaveLength(2);
    expect(services["local"]).toBeDefined();
    expect(services["remote"]).toBeDefined();
  });

  test("activeService returns the default connection", () => {
    writeJson(tmpDir, {
      Connection: {
        Default: "local",
        Connections: {
          local: { URI: "unix:///run/podman/podman.sock" },
          remote: { URI: "tcp://192.168.1.10:8080" },
        },
      },
    });
    const cfg = new PodmanConfig(tmpDir);
    expect(cfg.activeService?.name).toBe("local");
  });

  test("services returns empty object when no config files exist", () => {
    const cfg = new PodmanConfig(tmpDir);
    expect(cfg.services).toEqual({});
  });

  test("ServiceConnection.id returns the connection name", () => {
    writeJson(tmpDir, makeConnectionJson({ myconn: { URI: "unix:///run/podman/podman.sock" } }));
    const cfg = new PodmanConfig(tmpDir);
    expect(cfg.services["myconn"].id).toBe("myconn");
  });

  test("ServiceConnection.isMachine defaults to false", () => {
    writeJson(tmpDir, makeConnectionJson({ myconn: { URI: "unix:///run/podman/podman.sock" } }));
    const cfg = new PodmanConfig(tmpDir);
    expect(cfg.services["myconn"].isMachine).toBe(false);
  });
});

// ─── Unit tests — TOML parsing ────────────────────────────────────────────────

describe("PodmanConfig — TOML legacy file parsing", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("reads service_destinations from TOML", () => {
    writeToml(
      tmpDir,
      `
[engine]
active_service = "local"

[engine.service_destinations.local]
uri = "unix:///run/podman/podman.sock"
`,
    );
    const cfg = new PodmanConfig(tmpDir);
    const services = cfg.services;
    expect(services["local"]).toBeDefined();
    expect(services["local"].attrs.uri).toBe("unix:///run/podman/podman.sock");
  });

  test("TOML active_service is reflected in activeService", () => {
    writeToml(
      tmpDir,
      `
[engine]
active_service = "local"

[engine.service_destinations.local]
uri = "unix:///run/podman/podman.sock"
`,
    );
    const cfg = new PodmanConfig(tmpDir);
    expect(cfg.activeService?.name).toBe("local");
  });

  test("JSON takes precedence over TOML for Connection key", () => {
    writeJson(tmpDir, makeConnectionJson({ jsonconn: { URI: "unix:///run/podman/podman.sock" } }));
    writeToml(
      tmpDir,
      `
[engine]
active_service = "tomlconn"

[engine.service_destinations.tomlconn]
uri = "unix:///run/podman/podman2.sock"
`,
    );
    const cfg = new PodmanConfig(tmpDir);
    // Both should be present (JSON adds Connection, TOML adds engine)
    expect(cfg.services["jsonconn"]).toBeDefined();
    expect(cfg.services["tomlconn"]).toBeDefined();
  });
});

// ─── Unit tests — graceful TOML failure ──────────────────────────────────────

describe("PodmanConfig — graceful TOML failure", () => {
  let tmpDir: string;
  let warnMessages: string[];
  const origWarn = console.warn;

  beforeEach(() => {
    tmpDir = makeTempDir();
    warnMessages = [];
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.warn = origWarn;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("does not throw when TOML is malformed", () => {
    writeToml(tmpDir, "this is not valid TOML !!!! [[[");
    expect(() => new PodmanConfig(tmpDir)).not.toThrow();
  });

  test("emits a console.warn when TOML parse fails", () => {
    writeToml(tmpDir, "this is not valid TOML !!!! [[[");
    new PodmanConfig(tmpDir);
    expect(warnMessages.some((m) => m.includes("podman-client"))).toBe(true);
  });

  test("still returns JSON services when TOML is malformed", () => {
    writeJson(tmpDir, makeConnectionJson({ myconn: { URI: "unix:///run/podman/podman.sock" } }));
    writeToml(tmpDir, "this is not valid TOML !!!! [[[");
    const cfg = new PodmanConfig(tmpDir);
    expect(cfg.services["myconn"]).toBeDefined();
  });

  test("services is empty (not an error) when both files are absent", () => {
    const cfg = new PodmanConfig(tmpDir);
    expect(cfg.services).toEqual({});
    expect(cfg.activeService).toBeUndefined();
  });
});

// ─── Property 8: PodmanConfig services round-trip ────────────────────────────

describe("Property 8 — PodmanConfig services round-trip", () => {
  // Feature: podman-client-ts-improvements, Property 8: PodmanConfig services round-trip

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const connNameArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s));

  const uriArb = fc.oneof(
    fc.constant("unix:///run/podman/podman.sock"),
    fc.constant("tcp://127.0.0.1:8080"),
    fc
      .tuple(fc.ipV4(), fc.integer({ min: 1024, max: 65535 }))
      .map(([ip, port]) => `tcp://${ip}:${port}`),
  );

  test("property: every connection name in JSON appears in services", () => {
    fc.assert(
      fc.property(fc.dictionary(connNameArb, uriArb, { minKeys: 1, maxKeys: 5 }), (connections) => {
        const json = makeConnectionJson(
          Object.fromEntries(Object.entries(connections).map(([k, v]) => [k, { URI: v }])),
        );
        writeJson(tmpDir, json);

        const cfg = new PodmanConfig(tmpDir);
        const services = cfg.services;

        for (const name of Object.keys(connections)) {
          expect(services[name]).toBeDefined();
          expect(services[name].id).toBe(name);
        }
      }),
    );
  });

  test("property: URI is preserved for every connection", () => {
    fc.assert(
      fc.property(fc.dictionary(connNameArb, uriArb, { minKeys: 1, maxKeys: 5 }), (connections) => {
        const json = makeConnectionJson(
          Object.fromEntries(Object.entries(connections).map(([k, v]) => [k, { URI: v }])),
        );
        writeJson(tmpDir, json);

        const cfg = new PodmanConfig(tmpDir);
        const services = cfg.services;

        for (const [name, uri] of Object.entries(connections)) {
          expect(services[name].attrs.URI).toBe(uri);
        }
      }),
    );
  });
});
