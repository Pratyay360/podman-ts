import { prepareBody } from "../api/utils";
import { Manager, PodmanResource } from "./manager";
import { NotFound } from "../errors";
import { Buffer } from "node:buffer";

export class Secret extends PodmanResource {
  get id(): string | undefined {
    return this.attrs["ID"] as string | undefined;
  }

  get name(): string {
    return ((this.attrs["Spec"] as Record<string, unknown>)?.["Name"] as string) ?? "";
  }

  toString(): string {
    return `<Secret: ${this.name}>`;
  }

  async remove(options: { all?: boolean } = {}): Promise<void> {
    const res = await this.client.delete(`/secrets/${this.id}`, {
      params: { all: options.all },
    });
    res.raiseForStatus(NotFound);
  }
}

export interface SecretCreateOptions {
  labels?: Record<string, string>;
  driver?: string;
}

export class SecretsManager extends Manager<Secret> {
  protected resourceClass() {
    return Secret;
  }

  async create(
    name: string,
    data: Buffer | string,
    options: SecretCreateOptions = {},
  ): Promise<Secret> {
    const res = await this.client.post<Record<string, unknown>>("/secrets/create", {
      params: { name, driver: options.driver, labels: options.labels },
      data: typeof data === "string" ? data : data.toString("base64"),
      headers: { "Content-Type": "application/json" },
    });
    res.raiseForStatus();
    return this.get((res.data as { ID: string }).ID);
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.get(`/secrets/${encodeURIComponent(key)}/json`);
    return res.ok;
  }

  async get(secretId: string): Promise<Secret> {
    const res = await this.client.get<Record<string, unknown>>(
      `/secrets/${encodeURIComponent(secretId)}/json`,
    );
    res.raiseForStatus(NotFound);
    return this.prepareModel(res.data);
  }

  async list(options: { filters?: Record<string, string> } = {}): Promise<Secret[]> {
    const res = await this.client.get<Record<string, unknown>[]>("/secrets/json", {
      params: options.filters,
    });
    res.raiseForStatus();
    return res.data.map((attrs) => this.prepareModel(attrs));
  }

  async remove(secretId: string, options: { all?: boolean } = {}): Promise<void> {
    const res = await this.client.delete(`/secrets/${encodeURIComponent(secretId)}`, {
      params: { all: options.all },
    });
    res.raiseForStatus(NotFound);
  }
}
