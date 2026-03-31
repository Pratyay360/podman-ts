/**
 * PodmanConfig — reads podman-connections.json (and legacy containers.conf TOML).
 * Uses smol-toml for runtime-agnostic TOML parsing.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { parse as parseToml } from "smol-toml";

export interface ServiceConnectionAttrs {
  uri?: string;
  URI?: string;
  identity?: string;
  Identity?: string;
  IsMachine?: boolean;
}

export class ServiceConnection {
  readonly name: string;
  readonly attrs: ServiceConnectionAttrs;

  constructor(name: string, attrs: ServiceConnectionAttrs) {
    this.name = name;
    this.attrs = attrs;
  }

  get id(): string {
    return this.name;
  }

  get url(): URL {
    const raw = this.attrs.uri ?? this.attrs.URI ?? "";
    return new URL(raw);
  }

  get identity(): string {
    return this.attrs.identity ?? this.attrs.Identity ?? "";
  }

  get isMachine(): boolean {
    return this.attrs.IsMachine ?? false;
  }

  toString(): string {
    return `<ServiceConnection: '${this.id}'>`;
  }
}

function getXdgConfigHome(): string {
  return process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
}

export class PodmanConfig {
  readonly path: string;
  private attrs: Record<string, unknown> = {};

  constructor(configPath?: string) {
    const base = configPath ?? join(getXdgConfigHome(), "containers");
    this.path = join(base, "podman-connections.json");
    const tomlPath = join(base, "containers.conf");

    if (existsSync(this.path)) {
      try {
        this.attrs = JSON.parse(readFileSync(this.path, "utf-8"));
      } catch {
        // fall through to TOML
      }
    }

    // Merge legacy TOML config if present
    if (existsSync(tomlPath)) {
      try {
        const toml = parseToml(readFileSync(tomlPath, "utf-8"));
        Object.assign(this.attrs, toml);
      } catch {
        console.warn("[podman-client] Failed to parse containers.conf TOML — skipping.");
      }
    }
  }

  get services(): Record<string, ServiceConnection> {
    const result: Record<string, ServiceConnection> = {};

    // Legacy TOML format
    const engine = this.attrs["engine"] as Record<string, unknown> | undefined;
    if (engine) {
      const destinations = engine["service_destinations"] as
        | Record<string, ServiceConnectionAttrs>
        | undefined;
      if (destinations) {
        for (const [key, val] of Object.entries(destinations)) {
          result[key] = new ServiceConnection(key, val);
        }
      }
    }

    // New JSON format (takes precedence)
    const connection = this.attrs["Connection"] as Record<string, unknown> | undefined;
    if (connection) {
      const destinations = connection["Connections"] as
        | Record<string, ServiceConnectionAttrs>
        | undefined;
      if (destinations) {
        for (const [key, val] of Object.entries(destinations)) {
          result[key] = new ServiceConnection(key, val);
        }
      }
    }

    return result;
  }

  get activeService(): ServiceConnection | undefined {
    const connection = this.attrs["Connection"] as Record<string, unknown> | undefined;
    if (connection) {
      const active = connection["Default"] as string | undefined;
      const destinations = connection["Connections"] as
        | Record<string, ServiceConnectionAttrs>
        | undefined;
      if (active && destinations?.[active]) {
        return new ServiceConnection(active, destinations[active]);
      }
    }

    const engine = this.attrs["engine"] as Record<string, unknown> | undefined;
    if (engine) {
      const active = engine["active_service"] as string | undefined;
      const destinations = engine["service_destinations"] as
        | Record<string, ServiceConnectionAttrs>
        | undefined;
      if (active && destinations?.[active]) {
        return new ServiceConnection(active, destinations[active]);
      }
    }

    return undefined;
  }
}
