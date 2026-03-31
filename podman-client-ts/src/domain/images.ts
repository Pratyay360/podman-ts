import { APIClient } from "../api/client";
import { prepareFilters } from "../api/utils";
import { Manager, PodmanResource } from "./manager";
import { ImageNotFound } from "../errors";
import { BuildMixin, BuildOptions } from "./images_build";

export class Image extends PodmanResource {
  get labels(): Record<string, string> {
    return (this.attrs["Labels"] as Record<string, string>) ?? {};
  }

  get tags(): string[] {
    const repoTags = this.attrs["RepoTags"] as string[] | undefined;
    if (!repoTags) return [];
    return repoTags.filter((t) => t !== "<none>:<none>");
  }

  toString(): string {
    return `<Image: '${this.tags.join("', '")}'>`;
  }

  async history(): Promise<Record<string, unknown>[]> {
    const res = await this.client.get<Record<string, unknown>[]>(`/images/${this.id}/history`);
    res.raiseForStatus(ImageNotFound);
    return res.data;
  }

  async tag(repository: string, tag?: string): Promise<boolean> {
    const res = await this.client.post(`/images/${this.id}/tag`, {
      params: { repo: repository, tag },
    });
    res.raiseForStatus(ImageNotFound);
    return res.ok;
  }

  async remove(options: { force?: boolean } = {}): Promise<Record<string, unknown>[]> {
    const res = await this.client.delete<Record<string, unknown>[]>(`/images/${this.id}`, {
      params: { force: options.force },
    });
    res.raiseForStatus(ImageNotFound);
    return res.data;
  }

  async reload(): Promise<void> {
    const res = await this.client.get<Record<string, unknown>>(`/images/${this.id}/json`);
    res.raiseForStatus(ImageNotFound);
    this.attrs = res.data;
  }
}

export interface ImageListOptions {
  name?: string;
  all?: boolean;
  filters?: Record<string, string | string[]>;
}

export interface ImagePullOptions {
  tag?: string;
  allTags?: boolean;
  quiet?: boolean;
  tlsVerify?: boolean;
}

export interface ImagePushOptions {
  tag?: string;
  tlsVerify?: boolean;
}

export interface ImageSearchOptions {
  limit?: number;
  filters?: Record<string, string>;
  tlsVerify?: boolean;
  listTags?: boolean;
}

export class ImagesManager extends Manager<Image> {
  protected resourceClass() {
    return Image;
  }

  // Wired in from BuildMixin
  build!: (options: BuildOptions) => Promise<{ image: Image; logs: string[] }>;

  async exists(key: string): Promise<boolean> {
    const res = await this.client.get(`/images/${encodeURIComponent(key)}/exists`);
    return res.ok;
  }

  async get(name: string): Promise<Image> {
    const res = await this.client.get<Record<string, unknown>>(
      `/images/${encodeURIComponent(name)}/json`
    );
    res.raiseForStatus(ImageNotFound);
    return this.prepareModel(res.data);
  }

  async list(options: ImageListOptions = {}): Promise<Image[]> {
    const filters = { ...options.filters };
    if (options.name) filters["reference"] = options.name;

    const res = await this.client.get<Record<string, unknown>[]>("/images/json", {
      params: {
        all: options.all,
        filters: prepareFilters(filters),
      },
    });
    if (res.status === 404) return [];
    res.raiseForStatus();
    return res.data.map((attrs) => this.prepareModel(attrs));
  }

  async pull(repository: string, options: ImagePullOptions = {}): Promise<Image> {
    const res = await this.client.post<Record<string, unknown>>("/images/pull", {
      params: {
        reference: options.tag ? `${repository}:${options.tag}` : repository,
        allTags: options.allTags,
        quiet: options.quiet,
        tlsVerify: options.tlsVerify,
      },
    });
    res.raiseForStatus();
    return this.get(repository);
  }

  async push(repository: string, options: ImagePushOptions = {}): Promise<void> {
    const res = await this.client.post(`/images/${encodeURIComponent(repository)}/push`, {
      params: { tag: options.tag, tlsVerify: options.tlsVerify },
    });
    res.raiseForStatus(ImageNotFound);
  }

  async remove(
    name: string,
    options: { force?: boolean } = {}
  ): Promise<Record<string, unknown>[]> {
    const res = await this.client.delete<Record<string, unknown>[]>(
      `/images/${encodeURIComponent(name)}`,
      { params: { force: options.force } }
    );
    res.raiseForStatus(ImageNotFound);
    return res.data;
  }

  async prune(options: { all?: boolean; filters?: Record<string, string> } = {}): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/images/prune", {
      params: {
        all: options.all,
        filters: prepareFilters(options.filters),
      },
    });
    res.raiseForStatus();
    return res.data;
  }

  async search(term: string, options: ImageSearchOptions = {}): Promise<Record<string, unknown>[]> {
    const res = await this.client.get<Record<string, unknown>[]>("/images/search", {
      params: {
        term,
        limit: options.limit,
        filters: prepareFilters(options.filters),
        tlsVerify: options.tlsVerify,
        listTags: options.listTags,
      },
    });
    res.raiseForStatus();
    return res.data;
  }
}

// Apply BuildMixin
Object.assign(ImagesManager.prototype, BuildMixin.prototype);

export type { BuildOptions };
