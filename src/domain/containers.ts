import { prepareBody, prepareFilters } from "../api/utils";
import { APIError, ContainerError, ImageNotFound, NotFound, PodmanError } from "../errors";
import { type ContainerCreateOptions, renderCreatePayload } from "./containers_create";
import type { RunOptions } from "./containers_run";
import { ExecInstance } from "./exec";
import { Manager, PodmanResource } from "./manager";

export interface LogOptions {
  stream?: boolean;
  stdout?: boolean;
  stderr?: boolean;
  follow?: boolean;
  since?: string | number;
  until?: string | number;
  tail?: number | "all";
}

export class Container extends PodmanResource {
  get name(): string | undefined {
    const n = (this.attrs["Name"] ?? (this.attrs["Names"] as string[])?.[0]) as string | undefined;
    return n?.replace(/^\//, "");
  }

  get status(): string {
    return ((this.attrs["State"] as Record<string, unknown>)?.["Status"] as string) ?? "unknown";
  }

  get labels(): Record<string, string> {
    return (
      (this.attrs["Labels"] as Record<string, string>) ??
      ((this.attrs["Config"] as Record<string, unknown>)?.["Labels"] as Record<string, string>) ??
      {}
    );
  }

  get ports(): Record<string, unknown> {
    return (
      ((this.attrs["NetworkSettings"] as Record<string, unknown>)?.["Ports"] as Record<
        string,
        unknown
      >) ?? {}
    );
  }

  async start(): Promise<void> {
    const res = await this.client.post(`/containers/${this.id}/start`);
    res.raiseForStatus();
  }

  async stop(options: { timeout?: number } = {}): Promise<void> {
    const res = await this.client.post(`/containers/${this.id}/stop`, {
      params: { t: options.timeout },
    });
    res.raiseForStatus();
  }

  async restart(options: { timeout?: number } = {}): Promise<void> {
    const res = await this.client.post(`/containers/${this.id}/restart`, {
      params: { t: options.timeout },
    });
    res.raiseForStatus();
  }

  async kill(signal?: string | number): Promise<void> {
    const res = await this.client.post(`/containers/${this.id}/kill`, {
      params: { signal },
    });
    res.raiseForStatus();
  }

  async pause(): Promise<void> {
    const res = await this.client.post(`/containers/${this.id}/pause`);
    res.raiseForStatus();
  }

  async unpause(): Promise<void> {
    const res = await this.client.post(`/containers/${this.id}/unpause`);
    res.raiseForStatus();
  }

  async wait(options: { condition?: string | string[]; interval?: string } = {}): Promise<number> {
    const cond = options.condition;
    const res = await this.client.post<{ StatusCode: number } | number | string>(
      `/containers/${this.id}/wait`,
      {
        params: {
          condition:
            cond === undefined ? undefined : Array.isArray(cond) ? cond : [cond],
          interval: options.interval,
        },
      },
    );
    res.raiseForStatus();
    const d = res.data;
    if (typeof d === "number") return d;
    if (typeof d === "string") return parseInt(d, 10);
    return (d as { StatusCode: number }).StatusCode;
  }

  async remove(
    options: {
      force?: boolean;
      volumes?: boolean;
      depend?: boolean;
      ignore?: boolean;
      timeout?: number;
    } = {},
  ): Promise<void> {
    const res = await this.client.delete(`/containers/${this.id}`, {
      params: {
        force: options.force,
        v: options.volumes,
        depend: options.depend,
        ignore: options.ignore,
        timeout: options.timeout,
      },
    });
    res.raiseForStatus();
  }

  async rename(name: string): Promise<void> {
    const res = await this.client.post(`/containers/${this.id}/rename`, {
      params: { name },
    });
    res.raiseForStatus();
  }

  async inspect(options: { size?: boolean } = {}): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>(`/containers/${this.id}/json`, {
      params: { size: options.size },
    });
    res.raiseForStatus();
    return res.data;
  }

  async logs(opts: LogOptions & { stream: true }): Promise<AsyncIterable<string>>;
  async logs(opts?: LogOptions): Promise<string>;
  async logs(opts: LogOptions = {}): Promise<string | AsyncIterable<string>> {
    const params: Record<string, unknown> = {
      stdout: opts.stdout ?? true,
      stderr: opts.stderr ?? true,
      follow: opts.follow ?? false,
      since: opts.since,
      until: opts.until,
      tail: opts.tail,
    };
    if (opts.stream) {
      return this._streamLogs(params);
    }
    const res = await this.client.get<string>(`/containers/${this.id}/logs`, { params });
    res.raiseForStatus();
    return res.data;
  }

  private async *_streamLogs(params: Record<string, unknown>): AsyncIterable<string> {
    const url = this.client.buildUrlPublic(`/containers/${this.id}/logs`, false, params);
    const fetchOpts: RequestInit & { unix?: string } = {};
    if ((this.client as unknown as { unix?: string }).unix) {
      fetchOpts.unix = (this.client as unknown as { unix?: string }).unix;
    }
    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new APIError("Log stream error", res.status);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Failed to get reader from response body");
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop()!;
      for (const line of lines) yield line;
    }
    if (buf) yield buf;
  }

  async top(options: { psArgs?: string } = {}): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>(`/containers/${this.id}/top`, {
      params: { ps_args: options.psArgs },
    });
    res.raiseForStatus();
    return res.data;
  }

  async diff(
    options: { parent?: string; diffType?: "all" | "container" | "image" } = {},
  ): Promise<Array<Record<string, unknown>>> {
    const res = await this.client.get<Array<Record<string, unknown>>>(
      `/containers/${this.id}/changes`,
      { params: { parent: options.parent, diffType: options.diffType } },
    );
    res.raiseForStatus();
    return res.data;
  }

  async getArchive(containerPath: string, options: { rename?: string } = {}): Promise<ArrayBuffer> {
    const res = await this.client.get<ArrayBuffer>(`/containers/${this.id}/archive`, {
      params: { path: containerPath, rename: options.rename },
      parseAs: "arraybuffer",
    });
    res.raiseForStatus();
    return res.data;
  }

  async putArchive(
    containerPath: string,
    archive: ArrayBuffer | Uint8Array | Blob,
    options: { pause?: boolean } = {},
  ): Promise<void> {
    const res = await this.client.put(`/containers/${this.id}/archive`, {
      params: { path: containerPath, pause: options.pause ?? true },
      data: archive,
      headers: { "Content-Type": "application/x-tar" },
    });
    res.raiseForStatus();
  }

  /**
   * Attach to the container (raw stream). Check `response.ok`; the body uses Docker raw-stream
   * or multiplexed framing depending on server version and TTY settings.
   */
  async attach(
    options: {
      detachKeys?: string;
      logs?: boolean;
      stream?: boolean;
      stdout?: boolean;
      stderr?: boolean;
      stdin?: boolean;
    } = {},
  ): Promise<Response> {
    const res = await this.client.rawRequest("POST", `/containers/${this.id}/attach`, {
      params: {
        detachKeys: options.detachKeys,
        logs: options.logs,
        stream: options.stream,
        stdout: options.stdout,
        stderr: options.stderr,
        stdin: options.stdin,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      let message = body;
      try {
        const j = JSON.parse(body) as Record<string, string>;
        message = j["cause"] ?? j["message"] ?? body;
      } catch {
        /* keep text */
      }
      throw new APIError(message, res.status);
    }
    return res;
  }

  async checkpoint(
    options: {
      keep?: boolean;
      leaveRunning?: boolean;
      tcpEstablished?: boolean;
      exportTar?: boolean;
      ignoreRootFS?: boolean;
      ignoreVolumes?: boolean;
      preCheckpoint?: boolean;
      withPrevious?: boolean;
      fileLocks?: boolean;
      printStats?: boolean;
    } = {},
  ): Promise<Record<string, unknown> | ArrayBuffer> {
    const asTar = options.exportTar === true;
    const res = await this.client.post<Record<string, unknown> | ArrayBuffer>(
      `/containers/${this.id}/checkpoint`,
      {
        params: {
          keep: options.keep,
          leaveRunning: options.leaveRunning,
          tcpEstablished: options.tcpEstablished,
          export: options.exportTar,
          ignoreRootFS: options.ignoreRootFS,
          ignoreVolumes: options.ignoreVolumes,
          preCheckpoint: options.preCheckpoint,
          withPrevious: options.withPrevious,
          fileLocks: options.fileLocks,
          printStats: options.printStats,
        },
        parseAs: asTar ? "arraybuffer" : "json",
      },
    );
    res.raiseForStatus();
    return res.data;
  }

  async restore(
    options: {
      restoreAsName?: string;
      keep?: boolean;
      tcpEstablished?: boolean;
      tcpClose?: boolean;
      importCheckpoint?: boolean;
      ignoreRootFS?: boolean;
      ignoreVolumes?: boolean;
      ignoreStaticIP?: boolean;
      ignoreStaticMAC?: boolean;
      fileLocks?: boolean;
      printStats?: boolean;
      pod?: string;
    } = {},
  ): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>(`/containers/${this.id}/restore`, {
      params: {
        name: options.restoreAsName,
        keep: options.keep,
        tcpEstablished: options.tcpEstablished,
        tcpClose: options.tcpClose,
        import: options.importCheckpoint,
        ignoreRootFS: options.ignoreRootFS,
        ignoreVolumes: options.ignoreVolumes,
        ignoreStaticIP: options.ignoreStaticIP,
        ignoreStaticMAC: options.ignoreStaticMAC,
        fileLocks: options.fileLocks,
        printStats: options.printStats,
        pod: options.pod,
      },
    });
    res.raiseForStatus();
    return res.data;
  }

  async createExec(control: Record<string, unknown>): Promise<ExecInstance> {
    const res = await this.client.post<Record<string, unknown>>(`/containers/${this.id}/exec`, {
      data: control,
      headers: { "Content-Type": "application/json" },
    });
    res.raiseForStatus(NotFound);
    const id = (res.data["Id"] ?? res.data["id"]) as string | undefined;
    if (!id) throw new PodmanError("Exec API did not return an Id");
    return new ExecInstance(id, this.client);
  }

  async exportRootfs(): Promise<ArrayBuffer> {
    const res = await this.client.get<ArrayBuffer>(`/containers/${this.id}/export`, {
      parseAs: "arraybuffer",
    });
    res.raiseForStatus();
    return res.data;
  }

  async runHealthcheck(): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>(`/containers/${this.id}/healthcheck`);
    res.raiseForStatus();
    return res.data;
  }

  async init(): Promise<void> {
    const res = await this.client.post(`/containers/${this.id}/init`);
    if (res.status !== 204 && res.status !== 304) res.raiseForStatus();
  }

  async mount(options: { external?: boolean } = {}): Promise<string> {
    const res = await this.client.post<string>(`/containers/${this.id}/mount`, {
      params: { external: options.external },
    });
    res.raiseForStatus();
    return typeof res.data === "string" ? res.data : String(res.data);
  }

  async unmount(): Promise<void> {
    const res = await this.client.post(`/containers/${this.id}/unmount`);
    res.raiseForStatus();
  }

  async resizeTerminal(options: {
    height?: number;
    width?: number;
    running?: boolean;
  }): Promise<void> {
    const res = await this.client.post(`/containers/${this.id}/resize`, {
      params: { h: options.height, w: options.width, running: options.running },
    });
    res.raiseForStatus();
  }

  async update(
    body: Record<string, unknown>,
    options: { restartPolicy?: string; restartRetries?: number } = {},
  ): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>(`/containers/${this.id}/update`, {
      params: {
        restartPolicy: options.restartPolicy,
        restartRetries: options.restartRetries,
      },
      data: body,
      headers: { "Content-Type": "application/json" },
    });
    res.raiseForStatus();
    return res.data;
  }

  async stats(options: { stream?: boolean } = {}): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>(`/containers/${this.id}/stats`, {
      params: { stream: options.stream ?? false },
    });
    res.raiseForStatus();
    return res.data;
  }

  async commit(
    options: {
      repository?: string;
      tag?: string;
      message?: string;
      author?: string;
    } = {},
  ): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/commit", {
      params: {
        container: this.id,
        repo: options.repository,
        tag: options.tag,
        comment: options.message,
        author: options.author,
      },
    });
    res.raiseForStatus();
    return res.data;
  }

  async reload(): Promise<void> {
    const res = await this.client.get<Record<string, unknown>>(`/containers/${this.id}/json`);
    res.raiseForStatus(NotFound);
    this.attrs = res.data;
  }
}

// ── ContainersManager ─────────────────────────────────────────────────────────

export interface ContainerListOptions {
  all?: boolean;
  limit?: number;
  /** Alias for `limit` in the Podman API. */
  last?: number;
  external?: boolean;
  namespace?: boolean;
  size?: boolean;
  sync?: boolean;
  filters?: Record<string, string | string[]>;
  since?: string;
  before?: string;
}

export class ContainersManager extends Manager<Container> {
  protected resourceClass(): typeof Container {
    return Container;
  }

  async create(opts: ContainerCreateOptions): Promise<Container> {
    const payload = renderCreatePayload(opts);
    const res = await this.client.post<{ Id: string }>("/containers/create", {
      data: prepareBody(payload),
      headers: { "Content-Type": "application/json" },
    });
    res.raiseForStatus(ImageNotFound);
    return this.get(res.data.Id);
  }

  async run(
    image: string,
    command?: string | string[],
    options: RunOptions = {},
  ): Promise<Container | string | Uint8Array> {
    const {
      stdout = true,
      stderr = false,
      remove = false,
      detach = false,
      authConfig,
      platform,
      policy,
      ...createOpts
    } = options;

    let container: Container;
    try {
      container = await this.create({ ...createOpts, image, command });
    } catch (e) {
      if (e instanceof ImageNotFound) {
        await (
          this as unknown as {
            podmanClient?: {
              images: { pull: (id: string, opts: Record<string, unknown>) => Promise<unknown> };
            };
          }
        ).podmanClient?.images.pull(image, {
          authConfig,
          platform,
          policy: policy ?? "missing",
        });
        container = await this.create({ ...createOpts, image, command });
      } else {
        throw e;
      }
    }

    await container.start();
    await container.reload();

    if (detach) {
      if (remove) {
        container
          .wait()
          .then(() => container.remove())
          .catch(() => {});
      }
      return container;
    }

    const exitCode = await container.wait();
    if (remove) await container.remove();

    if (exitCode !== 0) {
      throw new ContainerError(`Container exited with status ${exitCode}`, exitCode);
    }

    const logs = await container.logs({ stdout, stderr });
    return logs;
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.get(`/containers/${encodeURIComponent(key)}/exists`);
    return res.ok;
  }

  async get(key: string, options: { compatible?: boolean } = {}): Promise<Container> {
    const res = await this.client.get<Record<string, unknown>>(
      `/containers/${encodeURIComponent(key)}/json`,
      { compatible: options.compatible },
    );
    res.raiseForStatus(NotFound);
    return this.prepareModel(res.data);
  }

  async list(options: ContainerListOptions = {}): Promise<Container[]> {
    const res = await this.client.get<Record<string, unknown>[]>("/containers/json", {
      params: {
        all: options.all,
        limit: options.limit,
        last: options.last,
        external: options.external,
        namespace: options.namespace,
        size: options.size,
        sync: options.sync,
        filters: prepareFilters(options.filters),
        since: options.since,
        before: options.before,
      },
    });
    res.raiseForStatus();
    return res.data.map((attrs) => this.prepareModel(attrs));
  }

  async remove(
    id: string,
    options: {
      force?: boolean;
      volumes?: boolean;
      depend?: boolean;
      ignore?: boolean;
      timeout?: number;
    } = {},
  ): Promise<void> {
    const res = await this.client.delete(`/containers/${encodeURIComponent(id)}`, {
      params: {
        force: options.force,
        v: options.volumes,
        depend: options.depend,
        ignore: options.ignore,
        timeout: options.timeout,
      },
    });
    res.raiseForStatus();
  }

  /**
   * Resource usage for one or more containers. With `stream: true`, returns one parsed JSON object
   * per non-empty line in the response body.
   */
  async stats(
    options: {
      containers?: string[];
      stream?: boolean;
      interval?: number;
      all?: boolean;
    } = {},
  ): Promise<Record<string, unknown> | Record<string, unknown>[]> {
    const stream = options.stream ?? false;
    const res = await this.client.get<Record<string, unknown> | Record<string, unknown>[] | string>(
      `/containers/stats`,
      {
        params: {
          containers: options.containers,
          stream,
          interval: options.interval,
          all: options.all,
        },
        parseAs: stream ? "text" : "json",
      },
    );
    res.raiseForStatus();
    if (stream) {
      const text = res.data as string;
      return text
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    }
    return res.data as Record<string, unknown> | Record<string, unknown>[];
  }

  async showMounted(): Promise<Record<string, string>> {
    const res = await this.client.get<Record<string, string>>(`/containers/showmounted`);
    res.raiseForStatus();
    return res.data;
  }

  async prune(filters?: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/containers/prune", {
      params: { filters: prepareFilters(filters) },
    });
    res.raiseForStatus();
    return res.data;
  }
}

export type { ContainerCreateOptions, RunOptions };
