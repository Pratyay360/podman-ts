/**
 * PodmanClient — top-level entry point for the Podman TypeScript SDK.
 *
 * @example
 * ```ts
 * import { PodmanClient } from "podman-client";
 *
 * const client = new PodmanClient();
 * const containers = await client.containers.list({ all: true });
 * await client.close();
 * ```
 */

import { join } from "path";
import { APIClient, APIClientOptions } from "./api/client";
import { PodmanConfig } from "./domain/config";
import { ContainersManager } from "./domain/containers";
import { ImagesManager } from "./domain/images";
import { NetworksManager } from "./domain/networks";
import { VolumesManager } from "./domain/volumes";
import { PodsManager } from "./domain/pods";
import { SecretsManager } from "./domain/secrets";
import { ManifestsManager } from "./domain/manifests";
import { QuadletsManager } from "./domain/quadlets";
import { EventsManager } from "./domain/events";
import { SystemManager } from "./domain/system";

export interface PodmanClientOptions {
  /** Full URL to Podman service. Defaults to local Unix socket. */
  baseUrl?: string;
  /** Named connection from containers.conf / podman-connections.json. */
  connection?: string;
  /** API version override. Default: "v5.0.0" */
  version?: string;
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** Path to SSH identity file (for ssh:// connections). */
  identity?: string;
}

function defaultSocketPath(): string {
  const uid = process.getuid?.() ?? 0;
  if (uid === 0) return "http+unix:///run/podman/podman.sock";
  const xdgRuntime = process.env["XDG_RUNTIME_DIR"] ?? `/run/user/${uid}`;
  return `http+unix://${join(xdgRuntime, "podman", "podman.sock")}`;
}

export class PodmanClient {
  readonly api: APIClient;

  private _containers?: ContainersManager;
  private _images?: ImagesManager;
  private _networks?: NetworksManager;
  private _volumes?: VolumesManager;
  private _pods?: PodsManager;
  private _secrets?: SecretsManager;
  private _manifests?: ManifestsManager;
  private _quadlets?: QuadletsManager;
  private _events?: EventsManager;
  private _system?: SystemManager;

  constructor(options: PodmanClientOptions = {}) {
    let baseUrl = options.baseUrl;

    if (!baseUrl) {
      if (options.connection) {
        const config = new PodmanConfig();
        const svc = config.services[options.connection];
        if (!svc) throw new Error(`Connection '${options.connection}' not found in containers.conf`);
        baseUrl = svc.url.toString();
      } else {
        // Check active service from config
        const config = new PodmanConfig();
        const active = config.activeService;
        if (active?.isMachine) {
          baseUrl = active.url.toString();
        } else {
          baseUrl = defaultSocketPath();
        }
      }
    }

    this.api = new APIClient({ baseUrl, version: options.version, timeout: options.timeout });
  }

  /** Create a PodmanClient from environment variables (CONTAINER_HOST or DOCKER_HOST). */
  static fromEnv(options: Omit<PodmanClientOptions, "baseUrl"> = {}): PodmanClient {
    const baseUrl =
      process.env["CONTAINER_HOST"] ??
      process.env["DOCKER_HOST"] ??
      defaultSocketPath();
    return new PodmanClient({ ...options, baseUrl });
  }

  get containers(): ContainersManager {
    return (this._containers ??= new ContainersManager(this.api));
  }

  get images(): ImagesManager {
    return (this._images ??= new ImagesManager(this.api));
  }

  get networks(): NetworksManager {
    return (this._networks ??= new NetworksManager(this.api));
  }

  get volumes(): VolumesManager {
    return (this._volumes ??= new VolumesManager(this.api));
  }

  get pods(): PodsManager {
    return (this._pods ??= new PodsManager(this.api));
  }

  get secrets(): SecretsManager {
    return (this._secrets ??= new SecretsManager(this.api));
  }

  get manifests(): ManifestsManager {
    return (this._manifests ??= new ManifestsManager(this.api));
  }

  get quadlets(): QuadletsManager {
    return (this._quadlets ??= new QuadletsManager(this.api));
  }

  get events(): EventsManager {
    return (this._events ??= new EventsManager(this.api));
  }

  get system(): SystemManager {
    return (this._system ??= new SystemManager(this.api));
  }

  async ping(): Promise<boolean> { return this.system.ping(); }
  async version(): Promise<Record<string, unknown>> { return this.system.version(); }
  async info(): Promise<Record<string, unknown>> { return this.system.info(); }
  async df(): Promise<Record<string, unknown>> { return this.system.df(); }

  close(): void { /* no-op — Bun fetch has no persistent pool to drain */ }

  [Symbol.dispose](): void { this.close(); }
}

/** Alias for Docker SDK compatibility. */
export const DockerClient = PodmanClient;

/** Shorthand factory — mirrors Python's `from_env()`. */
export function fromEnv(options?: Omit<PodmanClientOptions, "baseUrl">): PodmanClient {
  return PodmanClient.fromEnv(options);
}
