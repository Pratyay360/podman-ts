/** BuildMixin — image build() logic ported from images_build.py */

import type { APIClient } from "../api/client";
import { BuildError, ImageNotFound, PodmanError } from "../errors";
import type { Image } from "./images";

export interface BuildOptions {
  /** Path to the build context directory. */
  path?: string;
  /** Dockerfile/Containerfile name relative to path. */
  dockerfile?: string;
  /** Tag for the resulting image. */
  tag?: string;
  quiet?: boolean;
  nocache?: boolean;
  rm?: boolean;
  forcerm?: boolean;
  pull?: boolean;
  buildargs?: Record<string, string>;
  labels?: Record<string, string>;
  cacheFrom?: string[];
  target?: string;
  networkMode?: string;
  squash?: boolean;
  extraHosts?: Record<string, string>;
  platform?: string;
  shmsize?: number;
  layers?: boolean;
  output?: string;
  outputformat?: string;
  manifest?: string;
  secrets?: string[];
  httpProxy?: boolean;
  containerLimits?: {
    memory?: number;
    memswap?: number;
    cpushares?: number;
    cpusetcpus?: string;
    cpuperiod?: number;
    cpuquota?: number;
  };
}

/** Mixin providing build() for ImagesManager. */
export class BuildMixin {
  protected client!: APIClient;
  protected get!: (name: string) => Promise<Image>;

  async build(options: BuildOptions): Promise<{ image: Image; logs: string[] }> {
    if (!options.path) throw new TypeError("path must be provided.");

    const params = this.renderBuildParams(options);

    // Read the build context as a tar — use Bun's shell to create it
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

  private renderBuildParams(opts: BuildOptions): Record<string, unknown> {
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

    // Strip undefined values
    return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
  }
}
