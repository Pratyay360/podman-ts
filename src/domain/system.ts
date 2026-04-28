import type { APIClient } from "../api/client";
import { prepareBody } from "../api/utils";

export interface LoginOptions {
  password?: string;
  email?: string;
  registry?: string;
  tlsVerify?: boolean;
}

export class SystemManager {
  constructor(private readonly client: APIClient) {}

  async df(): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>("/system/df");
    res.raiseForStatus();
    return res.data;
  }

  async info(): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>("/info");
    res.raiseForStatus();
    return res.data;
  }

  async ping(): Promise<boolean> {
    const res = await this.client.head("/_ping");
    return res.ok;
  }

  async version(options: { apiVersion?: boolean } = {}): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>("/version");
    res.raiseForStatus();
    const body = res.data;
    if (options.apiVersion === false) {
      body["APIVersion"] = undefined;
    }
    return body;
  }

  async login(username: string, options: LoginOptions = {}): Promise<Record<string, unknown>> {
    const payload = prepareBody({
      username,
      password: options.password,
      email: options.email,
      serveraddress: options.registry,
    });
    const res = await this.client.post<Record<string, unknown>>("/auth", {
      data: payload,
      headers: { "Content-Type": "application/json" },
      compatible: true,
    });
    res.raiseForStatus();
    return res.data;
  }

  /**
   * Prune unused data (containers, images, volumes, networks).
   */
  async prune(options: {
    all?: boolean;
    external?: boolean;
    filters?: Record<string, string>;
    volumes?: boolean;
  } = {}): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/system/prune", {
      params: {
        all: options.all,
        external: options.external,
        volumes: options.volumes,
        filters: options.filters ? JSON.stringify(options.filters) : undefined,
      },
    });
    res.raiseForStatus();
    return res.data;
  }

  /**
   * Perform consistency checks on storage, optionally removing items that fail.
   */
  async check(options: {
    quick?: boolean;
    repair?: boolean;
    repairLossy?: boolean;
    unreferencedLayerMaximumAge?: string;
  } = {}): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/system/check", {
      params: {
        quick: options.quick,
        repair: options.repair,
        repairLossy: options.repairLossy,
        unreferencedLayerMaximumAge: options.unreferencedLayerMaximumAge,
      },
    });
    res.raiseForStatus();
    return res.data;
  }
}
