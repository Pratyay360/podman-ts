import { prepareFilters } from "../api/utils";
import { Manager, PodmanResource } from "./manager";
import { NotFound, PodmanError } from "../errors";

/** A quadlet file item: a [filename, content] tuple, a file path string, or a URL/path object. */
export type QuadletFileItem = [string, string | Uint8Array] | string;

export class Quadlet extends PodmanResource {
  get name(): string { return (this.attrs["Name"] ?? this.attrs["name"] ?? "") as string; }
  get unitName(): string { return (this.attrs["UnitName"] ?? this.attrs["unitName"] ?? "") as string; }
  get path(): string { return (this.attrs["Path"] ?? this.attrs["path"] ?? "") as string; }
  get status(): string { return (this.attrs["Status"] ?? this.attrs["status"] ?? "") as string; }
  get application(): string { return (this.attrs["App"] ?? this.attrs["app"] ?? "") as string; }

  toString(): string { return `<Quadlet: ${this.name}>`; }

  async delete(options: { force?: boolean; ignore?: boolean; reloadSystemd?: boolean } = {}): Promise<string[]> {
    return (this.manager as QuadletsManager).delete(this.name, options);
  }

  async getContents(): Promise<string> {
    return (this.manager as QuadletsManager).getContents(this.name);
  }
}

export interface QuadletDeleteOptions {
  force?: boolean;
  ignore?: boolean;
  reloadSystemd?: boolean;
}

export class QuadletsManager extends Manager<Quadlet> {
  protected resourceClass() { return Quadlet; }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.get(`/quadlets/${encodeURIComponent(key)}/exists`);
    if (res.status === 404) return false;
    res.raiseForStatus();
    return true;
  }

  async get(name: string): Promise<Quadlet> {
    const res = await this.client.get<Record<string, unknown>[]>("/quadlets/json", {
      params: { filters: prepareFilters({ name }) },
    });
    res.raiseForStatus();
    const data = res.data;
    if (!data || data.length === 0) throw new NotFound(`Quadlet ${name} not found`);
    return this.prepareModel(data[0]);
  }

  async list(options: { filters?: Record<string, string> } = {}): Promise<Quadlet[]> {
    const res = await this.client.get<Record<string, unknown>[]>("/quadlets/json", {
      params: options.filters ? { filters: prepareFilters(options.filters) } : {},
    });
    if (res.status === 404) return [];
    res.raiseForStatus();
    return res.data.map((attrs) => this.prepareModel(attrs));
  }

  async getContents(name: string | Quadlet): Promise<string> {
    const n = name instanceof Quadlet ? name.name : name;
    const res = await this.client.get<string>(`/quadlets/${encodeURIComponent(n)}/file`);
    res.raiseForStatus();
    return res.data as string;
  }

  async delete(
    name?: string | Quadlet | null,
    options: QuadletDeleteOptions & { all?: boolean } = {}
  ): Promise<string[]> {
    if (!name && !options.all) throw new PodmanError("Quadlet name or all=true must be provided.");
    const n = name instanceof Quadlet ? name.name : name;
    const params = {
      force: options.force ?? false,
      ignore: options.ignore ?? false,
      "reload-systemd": options.reloadSystemd ?? true,
      ...(options.all ? { all: true } : {}),
    };
    const path = options.all ? "/quadlets" : `/quadlets/${encodeURIComponent(n!)}`;
    const res = await this.client.delete<{ Removed: string[] }>(path, { params });
    res.raiseForStatus();
    return res.data.Removed;
  }

  async install(
    files: QuadletFileItem | QuadletFileItem[],
    options: { replace?: boolean; reloadSystemd?: boolean } = {}
  ): Promise<Record<string, unknown>> {
    const items = Array.isArray(files) && !isTuple(files) ? files as QuadletFileItem[] : [files as QuadletFileItem];
    if (items.length === 0) throw new PodmanError("files must not be empty.");

    const params = {
      replace: options.replace ?? false,
      "reload-systemd": options.reloadSystemd ?? true,
    };

    // Single tar file path
    const first = items[0];
    if (items.length === 1 && typeof first === "string" && (first.endsWith(".tar") || first.endsWith(".tar.gz"))) {
      const tarBytes = await Bun.file(first).arrayBuffer();
      const res = await this.client.post<Record<string, unknown>>("/quadlets", {
        params,
        data: tarBytes,
        headers: { "Content-Type": "application/x-tar" },
      });
      res.raiseForStatus();
      return res.data;
    }

    // Multipart — build a FormData
    const form = new FormData();
    for (const item of items) {
      if (isTuple(item)) {
        const [filename, content] = item as [string, string | Uint8Array];
        const blob = typeof content === "string"
          ? new Blob([content], { type: "text/plain" })
          : new Blob([content]);
        form.append(filename, blob, filename);
      } else {
        const filepath = item as string;
        const bytes = await Bun.file(filepath).arrayBuffer();
        const name = filepath.split("/").pop()!;
        form.append(name, new Blob([bytes]), name);
      }
    }

    const res = await this.client.post<Record<string, unknown>>("/quadlets", {
      params,
      data: form,
    });
    res.raiseForStatus();
    return res.data;
  }
}

function isTuple(v: unknown): v is [string, string | Uint8Array] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "string";
}
