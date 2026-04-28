/**
 * ArtifactsManager — OCI artifact operations (Podman v5 libpod API).
 *
 * Covers:
 *   POST   /libpod/artifacts/add          — ArtifactAddLibpod
 *   POST   /libpod/artifacts/local/add    — ArtifactLocalLibpod
 *   POST   /libpod/artifacts/pull         — ArtifactPullLibpod
 *   POST   /libpod/artifacts/{name}/push  — ArtifactPushLibpod
 *   GET    /libpod/artifacts/json         — ArtifactListLibpod
 *   GET    /libpod/artifacts/{name}/json  — ArtifactInspectLibpod
 *   GET    /libpod/artifacts/{name}/extract — ArtifactExtractLibpod
 *   DELETE /libpod/artifacts/{name}       — ArtifactDeleteLibpod
 *   DELETE /libpod/artifacts/remove       — ArtifactDeleteAllLibpod
 */

import type { APIClient } from "../api/client";
import { NotFound } from "../errors";
import { Manager, PodmanResource } from "./manager";

export class Artifact extends PodmanResource {
  get id(): string | undefined {
    return (this.attrs["Digest"] ?? this.attrs["digest"]) as string | undefined;
  }

  get name(): string {
    return (this.attrs["Name"] ?? this.attrs["name"] ?? "") as string;
  }

  toString(): string {
    return `<Artifact: ${this.name}>`;
  }

  /** Inspect this artifact. */
  async inspect(): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>(
      `/artifacts/${encodeURIComponent(this.name)}/json`,
    );
    res.raiseForStatus(NotFound);
    return res.data;
  }

  /**
   * Extract the artifact's contents.
   * @param options.title - Extract only the blob with this title/annotation.
   * @param options.digest - Extract only the blob with this digest.
   */
  async extract(options: { title?: string; digest?: string } = {}): Promise<ArrayBuffer> {
    const res = await this.client.get<ArrayBuffer>(
      `/artifacts/${encodeURIComponent(this.name)}/extract`,
      {
        params: { title: options.title, digest: options.digest },
        parseAs: "arraybuffer",
      },
    );
    res.raiseForStatus(NotFound);
    return res.data;
  }

  /**
   * Push this artifact to a registry.
   */
  async push(options: {
    destination?: string;
    tlsVerify?: boolean;
    authFile?: string;
    quiet?: boolean;
  } = {}): Promise<void> {
    const res = await this.client.post(
      `/artifacts/${encodeURIComponent(this.name)}/push`,
      {
        params: {
          destination: options.destination,
          tlsVerify: options.tlsVerify,
          authFile: options.authFile,
          quiet: options.quiet,
        },
      },
    );
    res.raiseForStatus(NotFound);
  }

  /** Remove this artifact from local storage. */
  async remove(): Promise<void> {
    const res = await this.client.delete(`/artifacts/${encodeURIComponent(this.name)}`);
    res.raiseForStatus(NotFound);
  }

  async reload(): Promise<void> {
    const res = await this.client.get<Record<string, unknown>>(
      `/artifacts/${encodeURIComponent(this.name)}/json`,
    );
    res.raiseForStatus(NotFound);
    this.attrs = res.data;
  }
}

export interface ArtifactAddOptions {
  /** Annotation key=value pairs to attach to the artifact. */
  annotations?: Record<string, string>;
  /** Artifact type (OCI media type). */
  artifactType?: string;
  /** Append to an existing artifact instead of replacing it. */
  append?: boolean;
  /** File title annotation. */
  fileTitle?: string;
}

export interface ArtifactPullOptions {
  /** TLS verification for the registry. */
  tlsVerify?: boolean;
  /** Path to auth file. */
  authFile?: string;
  /** Suppress output. */
  quiet?: boolean;
  /** Retry count on failure. */
  retry?: number;
  /** Delay between retries. */
  retryDelay?: string;
}

export class ArtifactsManager extends Manager<Artifact> {
  protected resourceClass(): typeof Artifact {
    return Artifact;
  }

  /**
   * Add a file as an OCI artifact (data provided inline).
   * @param name - Artifact reference (e.g. "registry/repo:tag").
   * @param data - File content as ArrayBuffer or Uint8Array.
   */
  async add(
    name: string,
    data: ArrayBuffer | Uint8Array,
    options: ArtifactAddOptions = {},
  ): Promise<Artifact> {
    const res = await this.client.post<Record<string, unknown>>("/artifacts/add", {
      params: {
        name,
        annotation: options.annotations
          ? Object.entries(options.annotations).map(([k, v]) => `${k}=${v}`)
          : undefined,
        artifactType: options.artifactType,
        append: options.append,
        fileTitle: options.fileTitle,
      },
      data,
      headers: { "Content-Type": "application/octet-stream" },
    });
    res.raiseForStatus();
    return this.prepareModel({ ...res.data, Name: name });
  }

  /**
   * Add a local file path as an OCI artifact.
   * @param name - Artifact reference.
   * @param filePath - Local file path to add.
   */
  async addLocal(
    name: string,
    filePath: string,
    options: ArtifactAddOptions = {},
  ): Promise<Artifact> {
    const res = await this.client.post<Record<string, unknown>>("/artifacts/local/add", {
      params: {
        name,
        file: filePath,
        annotation: options.annotations
          ? Object.entries(options.annotations).map(([k, v]) => `${k}=${v}`)
          : undefined,
        artifactType: options.artifactType,
        append: options.append,
        fileTitle: options.fileTitle,
      },
    });
    res.raiseForStatus();
    return this.prepareModel({ ...res.data, Name: name });
  }

  /**
   * Pull an artifact from a registry.
   * @param name - Artifact reference to pull.
   */
  async pull(name: string, options: ArtifactPullOptions = {}): Promise<Artifact> {
    const res = await this.client.post<Record<string, unknown>>("/artifacts/pull", {
      params: {
        name,
        tlsVerify: options.tlsVerify,
        authFile: options.authFile,
        quiet: options.quiet,
        retry: options.retry,
        retryDelay: options.retryDelay,
      },
    });
    res.raiseForStatus();
    return this.get(name);
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.get(`/artifacts/${encodeURIComponent(key)}/json`);
    return res.ok;
  }

  async get(name: string): Promise<Artifact> {
    const res = await this.client.get<Record<string, unknown>>(
      `/artifacts/${encodeURIComponent(name)}/json`,
    );
    res.raiseForStatus(NotFound);
    return this.prepareModel(res.data);
  }

  async list(): Promise<Artifact[]> {
    const res = await this.client.get<Record<string, unknown>[]>("/artifacts/json");
    res.raiseForStatus();
    return res.data.map((attrs) => this.prepareModel(attrs));
  }

  /**
   * Remove one or more artifacts from local storage (batch).
   * @param names - Artifact names/references to remove.
   */
  async remove(names: string | string[], options: { all?: boolean } = {}): Promise<Record<string, unknown>> {
    const nameList = Array.isArray(names) ? names : [names];
    const res = await this.client.delete<Record<string, unknown>>("/artifacts/remove", {
      params: { names: nameList, all: options.all },
    });
    res.raiseForStatus();
    return res.data;
  }

  /**
   * Remove a single artifact by name.
   */
  async removeOne(name: string): Promise<void> {
    const res = await this.client.delete(`/artifacts/${encodeURIComponent(name)}`);
    res.raiseForStatus(NotFound);
  }
}
