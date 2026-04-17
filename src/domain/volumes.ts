import { prepareBody, prepareFilters } from "../api/utils";
import { NotFound } from "../errors";
import { Manager, PodmanResource } from "./manager";

export class Volume extends PodmanResource {
  get id(): string | undefined {
    return this.name;
  }

  get name(): string | undefined {
    return this.attrs["Name"] as string | undefined;
  }

  async inspect(): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>(
      `/volumes/${encodeURIComponent(this.name ?? "")}/json`,
    );
    res.raiseForStatus();
    return res.data;
  }

  async remove(options: { force?: boolean } = {}): Promise<void> {
    const res = await this.client.delete(`/volumes/${encodeURIComponent(this.name ?? "")}`, {
      params: { force: options.force },
    });
    res.raiseForStatus();
  }

  async reload(): Promise<void> {
    const res = await this.client.get<Record<string, unknown>>(
      `/volumes/${encodeURIComponent(this.name ?? "")}/json`,
    );
    res.raiseForStatus(NotFound);
    this.attrs = res.data;
  }
}

export interface VolumeCreateOptions {
  driver?: string;
  driverOpts?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface VolumeListOptions {
  filters?: Record<string, string | string[]>;
}

export class VolumesManager extends Manager<Volume> {
  protected resourceClass(): typeof Volume {
    return Volume;
  }

  async create(name?: string, options: VolumeCreateOptions = {}): Promise<Volume> {
    const res = await this.client.post<Record<string, unknown>>("/volumes/create", {
      data: prepareBody({
        Name: name,
        Driver: options.driver,
        DriverOpts: options.driverOpts,
        Labels: options.labels,
      }),
      headers: { "Content-Type": "application/json" },
    });
    res.raiseForStatus();
    return this.prepareModel(res.data);
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.get(`/volumes/${encodeURIComponent(key)}/exists`);
    return res.ok;
  }

  async get(volumeId: string): Promise<Volume> {
    const res = await this.client.get<Record<string, unknown>>(
      `/volumes/${encodeURIComponent(volumeId)}/json`,
    );
    res.raiseForStatus(NotFound);
    return this.prepareModel(res.data);
  }

  async list(options: VolumeListOptions = {}): Promise<Volume[]> {
    const res = await this.client.get<{ Volumes: Record<string, unknown>[] }>("/volumes/json", {
      params: { filters: prepareFilters(options.filters) },
    });
    res.raiseForStatus();
    const volumes = res.data?.Volumes ?? (res.data as unknown as Record<string, unknown>[]);
    return (Array.isArray(volumes) ? volumes : []).map((attrs) => this.prepareModel(attrs));
  }

  async remove(name: string, options: { force?: boolean } = {}): Promise<void> {
    const res = await this.client.delete(`/volumes/${encodeURIComponent(name)}`, {
      params: { force: options.force },
    });
    res.raiseForStatus();
  }

  async prune(filters?: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/volumes/prune", {
      params: { filters: prepareFilters(filters) },
    });
    res.raiseForStatus();
    return res.data;
  }
}
