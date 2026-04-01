/** Base classes for PodmanResource and Manager. */

import { APIClient } from "../api/client";

export abstract class PodmanResource {
  /** Raw attributes from the Podman service response. */
  attrs: Record<string, unknown>;
  readonly client: APIClient;
  manager?: Manager<PodmanResource>;

  constructor(
    attrs: Record<string, unknown> = {},
    client: APIClient,
    manager?: Manager<PodmanResource>,
  ) {
    this.attrs = attrs;
    this.client = client;
    this.manager = manager;
  }

  get id(): string | undefined {
    return this.attrs["Id"] as string | undefined;
  }

  get shortId(): string {
    const id = this.id ?? "";
    return id.startsWith("sha256:") ? id.slice(0, 17) : id.slice(0, 10);
  }

  /** Refresh this object's data from the service. */
  async reload(): Promise<void> {
    if (!this.manager || !this.id) return;
    const latest = await this.manager.get(this.id);
    this.attrs = latest.attrs;
  }

  toString(): string {
    return `<${this.constructor.name}: ${this.shortId}>`;
  }
}

export abstract class Manager<T extends PodmanResource> {
  readonly client: APIClient;

  constructor(client: APIClient) {
    this.client = client;
  }

  /** Instantiate a resource from raw API attributes. */
  protected prepareModel(attrs: Record<string, unknown>): T {
    return new (this.resourceClass())(
      attrs,
      this.client,
      this as unknown as Manager<PodmanResource>,
    ) as T;
  }

  /** Subclasses return their concrete resource constructor. */
  protected abstract resourceClass(): new (
    attrs: Record<string, unknown>,
    client: APIClient,
    manager: Manager<PodmanResource>,
  ) => T;

  abstract exists(key: string): Promise<boolean>;
  abstract get(key: string): Promise<T>;
  abstract list(options?: Record<string, unknown>): Promise<T[]>;
}
