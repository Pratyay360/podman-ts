import { prepareFilters } from "../api/utils";
import { BuildError, ImageNotFound } from "../errors";
import type { BuildOptions } from "./images_build";
import { Manager, PodmanResource } from "./manager";

export class Image extends PodmanResource {
  get labels(): Record<string, string> {
    return (this.attrs["Labels"] as Record<string, string>) ?? {};
  }

  get tags(): string[] {
    const repoTags = this.attrs["RepoTags"] as string[] | undefined;
    if (!repoTags) return [];
    return repoTags.filter((t) => t !== "<none>:<none>");
  }

  toString(): string {
    return `<Image: '${this.tags.join("', '")}'>`;
  }

  async history(): Promise<Record<string, unknown>[]> {
    const res = await this.client.get<Record<string, unknown>[]>(`/images/${this.id}/history`);
    res.raiseForStatus(ImageNotFound);
    return res.data;
  }

  async tag(repository: string, tag?: string): Promise<boolean> {
    const res = await this.client.post(`/images/${this.id}/tag`, {
      params: { repo: repository, tag },
    });
    res.raiseForStatus(ImageNotFound);
    return res.ok;
  }

  /** Remove a tag from this image. */
  async untag(repository: string, tag?: string): Promise<void> {
    const res = await this.client.post(`/images/${this.id}/untag`, {
      params: { repo: repository, tag },
    });
    res.raiseForStatus(ImageNotFound);
  }

  /** Return the image dependency tree. */
  async tree(options: { whatrequires?: boolean } = {}): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>(`/images/${this.id}/tree`, {
      params: { whatrequires: options.whatrequires },
    });
    res.raiseForStatus(ImageNotFound);
    return res.data;
  }

  /** Report filesystem changes (adds, deletes, modifications). */
  async changes(options: { parent?: string; diffType?: "all" | "container" | "image" } = {}): Promise<Array<Record<string, unknown>>> {
    const res = await this.client.get<Array<Record<string, unknown>>>(`/images/${this.id}/changes`, {
      params: { parent: options.parent, diffType: options.diffType },
    });
    res.raiseForStatus(ImageNotFound);
    return res.data;
  }

  /** Export this image as a tar archive. */
  async export(options: { format?: string; compress?: boolean } = {}): Promise<ArrayBuffer> {
    const res = await this.client.get<ArrayBuffer>(`/images/${this.id}/get`, {
      params: { format: options.format, compress: options.compress },
      parseAs: "arraybuffer",
    });
    res.raiseForStatus(ImageNotFound);
    return res.data;
  }

  async remove(options: { force?: boolean } = {}): Promise<Record<string, unknown>[]> {
    const res = await this.client.delete<Record<string, unknown>[]>(`/images/${this.id}`, {
      params: { force: options.force },
    });
    res.raiseForStatus(ImageNotFound);
    return res.data;
  }

  async reload(): Promise<void> {
    const res = await this.client.get<Record<string, unknown>>(`/images/${this.id}/json`);
    res.raiseForStatus(ImageNotFound);
    this.attrs = res.data;
  }
}

export interface ImageListOptions {
  name?: string;
  all?: boolean;
  filters?: Record<string, string | string[]>;
}

export interface ImagePullOptions {
  tag?: string;
  allTags?: boolean;
  quiet?: boolean;
  tlsVerify?: boolean;
}

export interface ImagePushOptions {
  tag?: string;
  tlsVerify?: boolean;
}

export interface ImageSearchOptions {
  limit?: number;
  filters?: Record<string, string>;
  tlsVerify?: boolean;
  listTags?: boolean;
}

export class ImagesManager extends Manager<Image> {
  protected resourceClass(): typeof Image {
    return Image;
  }

  async build(options: BuildOptions): Promise<{ image: Image; logs: string[] }> {
    if (!options.path) throw new TypeError("path must be provided.");

    const params = this._renderBuildParams(options);

    const contextPath = options.path;
    const proc = Bun.spawn(["tar", "-C", contextPath, "-c", "."], { stdout: "pipe" });
    const tarBytes = await new Response(proc.stdout).arrayBuffer();
    await proc.exited;

    const res = await this.client.post<string>("/build", {
      params,
      data: tarBytes,
      headers: { "Content-Type": "application/x-tar" },
    });
    res.raiseForStatus(ImageNotFound);

    const logs: string[] = [];
    let imageId: string | undefined;
    const markerRe = /^([0-9a-f]+)\n$/;

    const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    for (const line of body.split("\n")) {
      if (!line.trim()) continue;
      logs.push(line);
      try {
        const parsed = JSON.parse(line) as Record<string, string>;
        if (parsed["error"]) throw new BuildError(parsed["error"], logs);
        if (parsed["stream"]) {
          const m = markerRe.exec(parsed["stream"]);
          if (m) imageId = m[1];
        }
      } catch (e) {
        if (e instanceof BuildError) throw e;
      }
    }

    if (!imageId) throw new BuildError("Could not determine built image ID.", logs);
    const image = await this.get(imageId);
    return { image, logs };
  }

  private _renderBuildParams(opts: BuildOptions): Record<string, unknown> {
    const params: Record<string, unknown> = {
      dockerfile: opts.dockerfile ?? "Dockerfile",
      forcerm: opts.forcerm,
      httpproxy: opts.httpProxy,
      networkmode: opts.networkMode,
      manifest: opts.manifest,
      nocache: opts.nocache,
      platform: opts.platform,
      pull: opts.pull,
      q: opts.quiet,
      rm: opts.rm,
      shmsize: opts.shmsize,
      squash: opts.squash,
      t: opts.tag,
      target: opts.target,
      layers: opts.layers ?? true,
      output: opts.output,
      outputformat: opts.outputformat ?? "application/vnd.oci.image.manifest.v1+json",
    };

    if (opts.buildargs) params["buildargs"] = JSON.stringify(opts.buildargs);
    if (opts.cacheFrom) params["cachefrom"] = JSON.stringify(opts.cacheFrom);
    if (opts.extraHosts) params["extrahosts"] = JSON.stringify(opts.extraHosts);
    if (opts.labels) params["labels"] = JSON.stringify(opts.labels);
    if (opts.secrets) params["secrets"] = JSON.stringify(opts.secrets);

    if (opts.containerLimits) {
      const cl = opts.containerLimits;
      Object.assign(params, {
        cpuperiod: cl.cpuperiod,
        cpuquota: cl.cpuquota,
        cpusetcpus: cl.cpusetcpus,
        cpushares: cl.cpushares,
        memory: cl.memory,
        memswap: cl.memswap,
      });
    }

    return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.get(`/images/${encodeURIComponent(key)}/exists`);
    return res.ok;
  }

  async get(name: string): Promise<Image> {
    const res = await this.client.get<Record<string, unknown>>(
      `/images/${encodeURIComponent(name)}/json`,
    );
    res.raiseForStatus(ImageNotFound);
    return this.prepareModel(res.data);
  }

  async list(options: ImageListOptions = {}): Promise<Image[]> {
    const filters = { ...options.filters };
    if (options.name) filters["reference"] = options.name;

    const res = await this.client.get<Record<string, unknown>[]>("/images/json", {
      params: {
        all: options.all,
        filters: prepareFilters(filters),
      },
    });
    if (res.status === 404) return [];
    res.raiseForStatus();
    return res.data.map((attrs) => this.prepareModel(attrs));
  }

  async pull(repository: string, options: ImagePullOptions = {}): Promise<Image> {
    const res = await this.client.post<Record<string, unknown>>("/images/pull", {
      params: {
        reference: options.tag ? `${repository}:${options.tag}` : repository,
        allTags: options.allTags,
        quiet: options.quiet,
        tlsVerify: options.tlsVerify,
      },
    });
    res.raiseForStatus();
    return this.get(repository);
  }

  async push(repository: string, options: ImagePushOptions = {}): Promise<void> {
    const res = await this.client.post(`/images/${encodeURIComponent(repository)}/push`, {
      params: { tag: options.tag, tlsVerify: options.tlsVerify },
    });
    res.raiseForStatus(ImageNotFound);
  }

  async remove(
    name: string,
    options: { force?: boolean } = {},
  ): Promise<Record<string, unknown>[]> {
    const res = await this.client.delete<Record<string, unknown>[]>(
      `/images/${encodeURIComponent(name)}`,
      { params: { force: options.force } },
    );
    res.raiseForStatus(ImageNotFound);
    return res.data;
  }

  async prune(
    options: { all?: boolean; filters?: Record<string, string> } = {},
  ): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/images/prune", {
      params: {
        all: options.all,
        filters: prepareFilters(options.filters),
      },
    });
    res.raiseForStatus();
    return res.data;
  }

  async search(term: string, options: ImageSearchOptions = {}): Promise<Record<string, unknown>[]> {
    const res = await this.client.get<Record<string, unknown>[]>("/images/search", {
      params: {
        term,
        limit: options.limit,
        filters: prepareFilters(options.filters),
        tlsVerify: options.tlsVerify,
        listTags: options.listTags,
      },
    });
    res.raiseForStatus();
    return res.data;
  }

  /**
   * Export multiple images as a single tar archive.
   * @param names - Image names/IDs to export.
   */
  async exportImages(
    names: string[],
    options: { format?: string; compress?: boolean } = {},
  ): Promise<ArrayBuffer> {
    const res = await this.client.get<ArrayBuffer>("/images/export", {
      params: { names, format: options.format, compress: options.compress },
      parseAs: "arraybuffer",
    });
    res.raiseForStatus();
    return res.data;
  }

  /**
   * Import an image from a tar archive (OCI or Docker format).
   * @param data - Tar archive as ArrayBuffer or Uint8Array.
   */
  async importImage(
    data: ArrayBuffer | Uint8Array,
    options: {
      changes?: string[];
      message?: string;
      reference?: string;
      url?: string;
    } = {},
  ): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/images/import", {
      params: {
        changes: options.changes,
        message: options.message,
        reference: options.reference,
        url: options.url,
      },
      data,
      headers: { "Content-Type": "application/x-tar" },
    });
    res.raiseForStatus();
    return res.data;
  }

  /**
   * Load one or more images from a tar archive (docker save format).
   * @param data - Tar archive as ArrayBuffer or Uint8Array.
   */
  async load(data: ArrayBuffer | Uint8Array): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/images/load", {
      data,
      headers: { "Content-Type": "application/x-tar" },
    });
    res.raiseForStatus();
    return res.data;
  }

  /**
   * Resolve an image short name to a fully-qualified reference.
   */
  async resolve(name: string): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>(
      `/images/${encodeURIComponent(name)}/resolve`,
    );
    res.raiseForStatus(ImageNotFound);
    return res.data;
  }

  /**
   * Copy an image from one host to another via SCP.
   */
  async scp(
    name: string,
    options: {
      destination?: string;
      quiet?: boolean;
    } = {},
  ): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>(
      `/images/scp/${encodeURIComponent(name)}`,
      {
        params: { destination: options.destination, quiet: options.quiet },
      },
    );
    res.raiseForStatus(ImageNotFound);
    return res.data;
  }

  /**
   * Remove one or more images from storage (batch delete).
   */
  async removeAll(
    names: string[],
    options: { force?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const res = await this.client.delete<Record<string, unknown>>("/images/remove", {
      params: { images: names, force: options.force },
    });
    res.raiseForStatus();
    return res.data;
  }
}

export type { BuildOptions };
