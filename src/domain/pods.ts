import { prepareFilters } from "../api/utils";
import { NotFound } from "../errors";
import { Manager, PodmanResource } from "./manager";

export class Pod extends PodmanResource {
  get id(): string | undefined {
    return (this.attrs["ID"] ?? this.attrs["Id"]) as string | undefined;
  }

  get name(): string | undefined {
    return this.attrs["Name"] as string | undefined;
  }

  async kill(signal?: string | number): Promise<void> {
    const res = await this.client.post(`/pods/${this.id}/kill`, {
      params: { signal },
    });
    res.raiseForStatus(NotFound);
  }

  async pause(): Promise<void> {
    const res = await this.client.post(`/pods/${this.id}/pause`);
    res.raiseForStatus(NotFound);
  }

  async unpause(): Promise<void> {
    const res = await this.client.post(`/pods/${this.id}/unpause`);
    res.raiseForStatus(NotFound);
  }

  async restart(): Promise<void> {
    const res = await this.client.post(`/pods/${this.id}/restart`);
    res.raiseForStatus(NotFound);
  }

  async start(): Promise<void> {
    const res = await this.client.post(`/pods/${this.id}/start`);
    res.raiseForStatus(NotFound);
  }

  async stop(options: { timeout?: number } = {}): Promise<void> {
    const res = await this.client.post(`/pods/${this.id}/stop`, {
      params: { t: options.timeout },
    });
    res.raiseForStatus(NotFound);
  }

  async remove(options: { force?: boolean } = {}): Promise<void> {
    const res = await this.client.delete(`/pods/${this.id}`, {
      params: { force: options.force },
    });
    res.raiseForStatus(NotFound);
  }

  async top(options: { psArgs?: string } = {}): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>(`/pods/${this.id}/top`, {
      params: { ps_args: options.psArgs },
    });
    res.raiseForStatus(NotFound);
    return res.data;
  }

  async inspect(): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>(`/pods/${this.id}/json`);
    res.raiseForStatus(NotFound);
    return res.data;
  }

  async reload(): Promise<void> {
    const res = await this.client.get<Record<string, unknown>>(`/pods/${this.id}/json`);
    res.raiseForStatus(NotFound);
    this.attrs = res.data;
  }
}

export interface PodListOptions {
  filters?: Record<string, string | string[]>;
}

export class PodsManager extends Manager<Pod> {
  protected resourceClass(): typeof Pod {
    return Pod;
  }

  async create(name: string, options: Record<string, unknown> = {}): Promise<Pod> {
    const res = await this.client.post<{ Id: string }>("/pods/create", {
      data: JSON.stringify({ ...options, name }),
      headers: { "Content-Type": "application/json" },
    });
    res.raiseForStatus();
    return this.get(res.data.Id);
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.get(`/pods/${encodeURIComponent(key)}/exists`);
    return res.ok;
  }

  async get(podId: string): Promise<Pod> {
    const res = await this.client.get<Record<string, unknown>>(
      `/pods/${encodeURIComponent(podId)}/json`,
    );
    res.raiseForStatus(NotFound);
    return this.prepareModel(res.data);
  }

  async list(options: PodListOptions = {}): Promise<Pod[]> {
    const res = await this.client.get<Record<string, unknown>[]>("/pods/json", {
      params: { filters: prepareFilters(options.filters) },
    });
    res.raiseForStatus();
    return res.data.map((attrs) => this.prepareModel(attrs));
  }

  async remove(podId: string, options: { force?: boolean } = {}): Promise<void> {
    const res = await this.client.delete(`/pods/${encodeURIComponent(podId)}`, {
      params: { force: options.force },
    });
    res.raiseForStatus(NotFound);
  }

  async prune(filters?: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/pods/prune", {
      params: { filters: prepareFilters(filters) },
    });
    res.raiseForStatus();
    return res.data;
  }

  async stats(options: { all?: boolean } = {}): Promise<Record<string, unknown>[]> {
    const res = await this.client.get<Record<string, unknown>[]>("/pods/stats", {
      params: { all: options.all },
    });
    res.raiseForStatus();
    return res.data;
  }
}
