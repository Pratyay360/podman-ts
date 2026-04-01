import { prepareFilters, prepareBody } from "../api/utils";
import { Manager, PodmanResource } from "./manager";
import { NotFound, APIError, ImageNotFound, ContainerError } from "../errors";
import { ContainerCreateOptions, renderCreatePayload } from "./containers_create";
import type { RunOptions } from "./containers_run";

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

  async wait(options: { condition?: string } = {}): Promise<number> {
    const res = await this.client.post<{ StatusCode: number }>(`/containers/${this.id}/wait`, {
      params: { condition: options.condition },
    });
    res.raiseForStatus();
    return res.data.StatusCode;
  }

  async remove(options: { force?: boolean; volumes?: boolean } = {}): Promise<void> {
    const res = await this.client.delete(`/containers/${this.id}`, {
      params: { force: options.force, v: options.volumes },
    });
    res.raiseForStatus();
  }

  async rename(name: string): Promise<void> {
    const res = await this.client.post(`/containers/${this.id}/rename`, {
      params: { name },
    });
    res.raiseForStatus();
  }

  async inspect(): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>(`/containers/${this.id}/json`);
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
    if (!res.ok) throw new APIError(`Log stream error`, res.status);
    const reader = res.body!.getReader();
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

  async diff(): Promise<Array<Record<string, unknown>>> {
    const res = await this.client.get<Array<Record<string, unknown>>>(
      `/containers/${this.id}/changes`,
    );
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
    const res = await this.client.post<Record<string, unknown>>(`/commit`, {
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
  filters?: Record<string, string | string[]>;
  since?: string;
  before?: string;
}

export class ContainersManager extends Manager<Container> {
  protected resourceClass() {
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
        filters: prepareFilters(options.filters),
        since: options.since,
        before: options.before,
      },
    });
    res.raiseForStatus();
    return res.data.map((attrs) => this.prepareModel(attrs));
  }

  async remove(id: string, options: { force?: boolean; volumes?: boolean } = {}): Promise<void> {
    const res = await this.client.delete(`/containers/${encodeURIComponent(id)}`, {
      params: { force: options.force, v: options.volumes },
    });
    res.raiseForStatus();
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
