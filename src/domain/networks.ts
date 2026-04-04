import { prepareBody, prepareFilters } from "../api/utils";
import { NotFound } from "../errors";
import { Manager, PodmanResource } from "./manager";

export class Network extends PodmanResource {
  get id(): string | undefined {
    return (this.attrs["Id"] ?? this.attrs["id"]) as string | undefined;
  }

  get name(): string {
    const n = (this.attrs["Name"] ?? this.attrs["name"]) as string | undefined;
    if (!n) throw new Error("Neither 'name' nor 'Name' attribute found.");
    return n;
  }

  async connect(container: string, options: { aliases?: string[] } = {}): Promise<void> {
    const res = await this.client.post(`/networks/${this.name}/connect`, {
      data: prepareBody({ Container: container, EndpointConfig: { Aliases: options.aliases } }),
      headers: { "Content-Type": "application/json" },
    });
    res.raiseForStatus();
  }

  async disconnect(container: string, options: { force?: boolean } = {}): Promise<void> {
    const res = await this.client.post(`/networks/${this.name}/disconnect`, {
      data: prepareBody({ Container: container, Force: options.force }),
      headers: { "Content-Type": "application/json" },
    });
    res.raiseForStatus();
  }

  async remove(options: { force?: boolean } = {}): Promise<void> {
    const res = await this.client.delete(`/networks/${this.name}`, {
      params: { force: options.force },
    });
    res.raiseForStatus();
  }

  async reload(): Promise<void> {
    const res = await this.client.get<Record<string, unknown>>(`/networks/${this.name}/json`);
    res.raiseForStatus(NotFound);
    this.attrs = res.data;
  }
}

export interface NetworkCreateOptions {
  driver?: string;
  dnsEnabled?: boolean;
  networkDnsServers?: string[];
  enableIpv6?: boolean;
  internal?: boolean;
  labels?: Record<string, string>;
  options?: Record<string, string>;
}

export interface NetworkListOptions {
  filters?: Record<string, string | string[]>;
}

export class NetworksManager extends Manager<Network> {
  protected resourceClass(): typeof Network {
    return Network;
  }

  async create(name: string, options: NetworkCreateOptions = {}): Promise<Network> {
    const data = prepareBody({
      name,
      driver: options.driver,
      dns_enabled: options.dnsEnabled,
      network_dns_servers: options.networkDnsServers,
      ipv6_enabled: options.enableIpv6,
      internal: options.internal,
      labels: options.labels,
      options: options.options,
    });
    const res = await this.client.post<Record<string, unknown>>("/networks/create", {
      data,
      headers: { "Content-Type": "application/json" },
    });
    res.raiseForStatus();
    return this.prepareModel(res.data);
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.get(`/networks/${encodeURIComponent(key)}/exists`);
    return res.ok;
  }

  async get(key: string): Promise<Network> {
    const res = await this.client.get<Record<string, unknown>>(
      `/networks/${encodeURIComponent(key)}/json`,
    );
    res.raiseForStatus(NotFound);
    return this.prepareModel(res.data);
  }

  async list(options: NetworkListOptions = {}): Promise<Network[]> {
    const res = await this.client.get<Record<string, unknown>[]>("/networks/json", {
      params: { filters: prepareFilters(options.filters) },
    });
    res.raiseForStatus();
    return res.data.map((attrs) => this.prepareModel(attrs));
  }

  async remove(name: string, options: { force?: boolean } = {}): Promise<void> {
    const res = await this.client.delete(`/networks/${encodeURIComponent(name)}`, {
      params: { force: options.force },
    });
    res.raiseForStatus();
  }

  async prune(filters?: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/networks/prune", {
      params: { filters: prepareFilters(filters) },
    });
    res.raiseForStatus();
    return res.data;
  }
}
