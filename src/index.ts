/** podman-ts — TypeScript/Bun bindings for the Podman RESTful API (libpod). */

export const VERSION = "5.8.0";

// ── Client ────────────────────────────────────────────────────────────────────
export { PodmanClient, DockerClient, fromEnv } from "./client.ts";
export type { PodmanClientOptions } from "./client.ts";

// ── Errors ────────────────────────────────────────────────────────────────────
export {
  PodmanError,
  APIError,
  NotFound,
  ImageNotFound,
  BuildError,
  ContainerError,
  InvalidArgument,
  StreamParseError,
} from "./errors.ts";

// ── Low-level API client ──────────────────────────────────────────────────────
export { APIClient, APIResponse } from "./api/client.ts";
export type { APIClientOptions, RequestConfig } from "./api/client.ts";

// ── API utilities ─────────────────────────────────────────────────────────────
export {
  prepareFilters,
  prepareBody,
  encodeAuthHeader,
  parseRepository,
  prepareTimestamp,
  demuxOutput,
} from "./api/utils.ts";

export { VERSION as API_VERSION, COMPATIBLE_VERSION, DEFAULT_CHUNK_SIZE } from "./api/versions.ts";

// ── Domain: Containers ────────────────────────────────────────────────────────
export { Container, ContainersManager } from "./domain/containers.ts";
export type {
  ContainerListOptions,
  ContainerCreateOptions,
  RunOptions,
  LogOptions,
} from "./domain/containers.ts";

// ── Domain: Images ────────────────────────────────────────────────────────────
export { Image, ImagesManager } from "./domain/images.ts";
export type {
  ImageListOptions,
  ImagePullOptions,
  ImagePushOptions,
  ImageSearchOptions,
  BuildOptions,
} from "./domain/images.ts";

// ── Domain: Networks ─────────────────────────────────────────────────────────
export { Network, NetworksManager } from "./domain/networks.ts";
export type { NetworkCreateOptions, NetworkListOptions } from "./domain/networks.ts";

// ── Domain: Volumes ───────────────────────────────────────────────────────────
export { Volume, VolumesManager } from "./domain/volumes.ts";
export type { VolumeCreateOptions, VolumeListOptions } from "./domain/volumes.ts";

// ── Domain: Pods ──────────────────────────────────────────────────────────────
export { Pod, PodsManager } from "./domain/pods.ts";
export type { PodListOptions } from "./domain/pods.ts";

// ── Domain: Secrets ───────────────────────────────────────────────────────────
export { Secret, SecretsManager } from "./domain/secrets.ts";
export type { SecretCreateOptions } from "./domain/secrets.ts";

// ── Domain: Manifests ─────────────────────────────────────────────────────────
export { Manifest, ManifestsManager } from "./domain/manifests.ts";

// ── Domain: Quadlets ──────────────────────────────────────────────────────────
export { Quadlet, QuadletsManager } from "./domain/quadlets.ts";
export type { QuadletFileItem, QuadletDeleteOptions } from "./domain/quadlets.ts";

// ── Domain: Events ────────────────────────────────────────────────────────────
export { EventsManager } from "./domain/events.ts";
export type { EventsListOptions } from "./domain/events.ts";

// ── Domain: System ────────────────────────────────────────────────────────────
export { SystemManager } from "./domain/system.ts";
export type { LoginOptions } from "./domain/system.ts";

// ── Domain: Config ────────────────────────────────────────────────────────────
export { PodmanConfig, ServiceConnection } from "./domain/config.ts";
export type { ServiceConnectionAttrs } from "./domain/config.ts";

// ── Domain: IPAM ─────────────────────────────────────────────────────────────
export { IPAMPool, IPAMConfig } from "./domain/ipam.ts";
export type { IPAMPoolOptions, IPAMConfigOptions } from "./domain/ipam.ts";

// ── Domain: Registry data ─────────────────────────────────────────────────────
export { RegistryData } from "./domain/registry_data.ts";

// ── Domain: JSON stream ───────────────────────────────────────────────────────
export { jsonStream, lineStream } from "./domain/json_stream.ts";

// ── Base classes ──────────────────────────────────────────────────────────────
export { PodmanResource, Manager } from "./domain/manager.ts";
