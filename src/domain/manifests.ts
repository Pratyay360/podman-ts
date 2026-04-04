import { encodeAuthHeader, prepareBody } from "../api/utils.ts";
import { ImageNotFound, NotFound } from "../errors.ts";
import { Image } from "./images.ts";
import { Manager, PodmanResource } from "./manager.ts";

export class Manifest extends PodmanResource {
  get id(): string | undefined {
    const manifests = this.attrs["manifests"] as Array<Record<string, string>> | undefined;
    const digest = manifests?.[0]?.["digest"];
    if (!digest) return this.name;
    return digest.startsWith("sha256:") ? digest.slice(7) : digest;
  }

  get name(): string {
    return this.attrs["names"] as string;
  }

  get quotedName(): string {
    return encodeURIComponent(this.name);
  }

  get mediaType(): string | undefined {
    return this.attrs["mediaType"] as string | undefined;
  }

  get version(): number | undefined {
    return this.attrs["schemaVersion"] as number | undefined;
  }

  async add(
    images: Array<Image | string>,
    options: {
      all?: boolean;
      annotation?: Record<string, string>;
      arch?: string;
      features?: string[];
      os?: string;
      osVersion?: string;
      variant?: string;
    } = {},
  ): Promise<void> {
    const data = prepareBody({
      all: options.all,
      annotation: options.annotation,
      arch: options.arch,
      features: options.features,
      images: images.map((i) => (i instanceof Image ? (i.attrs["RepoTags"] as string[])[0] : i)),
      os: options.os,
      os_version: options.osVersion,
      variant: options.variant,
      operation: "update",
    });
    const res = await this.client.put(`/manifests/${this.quotedName}`, {
      data,
      headers: { "Content-Type": "application/json" },
    });
    res.raiseForStatus(ImageNotFound);
    await this.reload();
  }

  async push(
    destination: string,
    options: { all?: boolean; authConfig?: Record<string, string> } = {},
  ): Promise<void> {
    const headers: Record<string, string> = {
      "X-Registry-Auth": options.authConfig ? encodeAuthHeader(options.authConfig) : "",
    };
    const res = await this.client.post(
      `/manifests/${this.quotedName}/registry/${encodeURIComponent(destination)}`,
      { params: { all: options.all, destination }, headers },
    );
    res.raiseForStatus();
  }

  async remove(digest: string): Promise<void> {
    const d = digest.includes("@") ? digest.split("@")[1] : digest;
    const data = prepareBody({ operation: "remove", images: [d] });
    const res = await this.client.put(`/manifests/${this.quotedName}`, {
      data,
      headers: { "Content-Type": "application/json" },
    });
    res.raiseForStatus(ImageNotFound);
    await this.reload();
  }

  async reload(): Promise<void> {
    const latest = await (this.manager as ManifestsManager).get(this.name);
    this.attrs = latest.attrs;
  }
}

export class ManifestsManager extends Manager<Manifest> {
  protected resourceClass() {
    return Manifest;
  }

  async create(name: string, images?: Array<Image | string>, all?: boolean): Promise<Manifest> {
    const params: Record<string, unknown> = {};
    if (images) {
      params["images"] = images.map((i) =>
        i instanceof Image ? (i.attrs["RepoTags"] as string[])[0] : i,
      );
    }
    if (all !== undefined) params["all"] = all;

    const res = await this.client.post<{ Id: string }>(`/manifests/${encodeURIComponent(name)}`, {
      params,
    });
    res.raiseForStatus(ImageNotFound);
    const manifest = await this.get(res.data.Id);
    manifest.attrs["names"] = name;
    if (!manifest.attrs["manifests"]) manifest.attrs["manifests"] = [];
    return manifest;
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.get(`/manifests/${encodeURIComponent(key)}/exists`);
    return res.ok;
  }

  async get(key: string): Promise<Manifest> {
    const res = await this.client.get<Record<string, unknown>>(
      `/manifests/${encodeURIComponent(key)}/json`,
    );
    res.raiseForStatus(NotFound);
    const body = res.data;
    if (!("names" in body)) body["names"] = key;
    return this.prepareModel(body);
  }

  async list(): Promise<Manifest[]> {
    throw new Error("Podman service does not support listing manifests.");
  }

  async removeManifest(name: string | Manifest): Promise<Record<string, unknown>> {
    const n = name instanceof Manifest ? name.name : name;
    const res = await this.client.delete<Record<string, unknown>>(
      `/manifests/${encodeURIComponent(n)}`,
    );
    res.raiseForStatus(ImageNotFound);
    return { ...res.data, ExitCode: res.status };
  }
}
