/** podman-ts — TypeScript/Bun bindings for the Podman RESTful API (libpod). */

export const VERSION = "5.8.0";

// ── Client ────────────────────────────────────────────────────────────────────
export { PodmanClient, DockerClient, fromEnv } from "./client";
export type { PodmanClientOptions } from "./client";

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
} from "./errors";

// ── Low-level API client ──────────────────────────────────────────────────────
export { APIClient, APIResponse } from "./api/client";
export type { APIClientOptions, RequestConfig } from "./api/client";

// ── API utilities ─────────────────────────────────────────────────────────────
export {
  prepareFilters,
  prepareBody,
  encodeAuthHeader,
  parseRepository,
  prepareTimestamp,
  demuxOutput,
} from "./api/utils";

export { VERSION as API_VERSION, COMPATIBLE_VERSION, DEFAULT_CHUNK_SIZE } from "./api/versions";

// ── Domain: Containers ────────────────────────────────────────────────────────
export { Container, ContainersManager } from "./domain/containers";
export { ExecInstance } from "./domain/exec";
export type {
  ContainerListOptions,
  ContainerCreateOptions,
  RunOptions,
  LogOptions,
} from "./domain/containers";

// ── Domain: Images ────────────────────────────────────────────────────────────
export { Image, ImagesManager } from "./domain/images";
export type {
  ImageListOptions,
  ImagePullOptions,
  ImagePushOptions,
  ImageSearchOptions,
  BuildOptions,
} from "./domain/images";

// ── Domain: Networks ─────────────────────────────────────────────────────────
export { Network, NetworksManager } from "./domain/networks";
export type { NetworkCreateOptions, NetworkListOptions } from "./domain/networks";

// ── Domain: Volumes ───────────────────────────────────────────────────────────
export { Volume, VolumesManager } from "./domain/volumes";
export type { VolumeCreateOptions, VolumeListOptions } from "./domain/volumes";

// ── Domain: Pods ──────────────────────────────────────────────────────────────
export { Pod, PodsManager } from "./domain/pods";
export type { PodListOptions } from "./domain/pods";

// ── Domain: Secrets ───────────────────────────────────────────────────────────
export { Secret, SecretsManager } from "./domain/secrets";
export type { SecretCreateOptions } from "./domain/secrets";

// ── Domain: Manifests ─────────────────────────────────────────────────────────
export { Manifest, ManifestsManager } from "./domain/manifests";

// ── Domain: Quadlets ──────────────────────────────────────────────────────────
export { Quadlet, QuadletsManager } from "./domain/quadlets";
export type { QuadletFileItem, QuadletDeleteOptions } from "./domain/quadlets";

// ── Domain: Events ────────────────────────────────────────────────────────────
export { EventsManager } from "./domain/events";
export type { EventsListOptions } from "./domain/events";

// ── Domain: System ────────────────────────────────────────────────────────────
export { SystemManager } from "./domain/system";
export type { LoginOptions } from "./domain/system";

// ── Domain: Config ────────────────────────────────────────────────────────────
export { PodmanConfig, ServiceConnection } from "./domain/config";
export type { ServiceConnectionAttrs } from "./domain/config";

// ── Domain: IPAM ─────────────────────────────────────────────────────────────
export { IPAMPool, IPAMConfig } from "./domain/ipam";
export type { IPAMPoolOptions, IPAMConfigOptions } from "./domain/ipam";

// ── Domain: Registry data ─────────────────────────────────────────────────────
export { RegistryData } from "./domain/registry_data";

// ── Domain: JSON stream ───────────────────────────────────────────────────────
export { jsonStream, lineStream } from "./domain/json_stream";

// ── Domain: Kube ──────────────────────────────────────────────────────────────
export { KubeManager } from "./domain/kube";
export type {
  GenerateKubeOptions,
  GenerateSystemdOptions,
  KubeApplyOptions,
  PlayKubeOptions,
} from "./domain/kube";

// ── Domain: Artifacts ─────────────────────────────────────────────────────────
export { Artifact, ArtifactsManager } from "./domain/artifacts";
export type { ArtifactAddOptions, ArtifactPullOptions } from "./domain/artifacts";

// ── Base classes ──────────────────────────────────────────────────────────────
export { PodmanResource, Manager } from "./domain/manager";
