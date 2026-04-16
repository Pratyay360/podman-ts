/**
 * APIClient — low-level HTTP client for the Podman service.
 * Uses Bun's native fetch with Unix-socket support (no axios / node:http needed).
 */

import { APIError, NotFound, PodmanError } from "../errors";

interface FetchOptions extends globalThis.RequestInit {
  unix?: string;
}

export interface APIClientOptions {
  /** Full URL to Podman service, e.g. "http+unix:///run/podman/podman.sock" */
  baseUrl: string;
  /** API version prefix override. Default: "v5.0.0" */
  version?: string;
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** Max retry attempts on network-level errors. Default: 0 */
  retries?: number;
}

export interface RequestConfig {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  data?: unknown;
  /** Use Docker-compat URL prefix instead of libpod. */
  compatible?: boolean;
}

const DEFAULT_VERSION = "v5.0.0";

/** Serialise query params, dropping null/undefined values. */
function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/**
 * Parse a podman-style base URL into the pieces Bun.fetch needs.
 *
 * Bun supports Unix-domain sockets via the `unix` option on fetch:
 *   fetch("http://localhost/path", { unix: "/run/podman/podman.sock" })
 */
function resolveConnection(rawUrl: string): {
  httpBase: string;
  unix?: string;
} {
  // http+unix:///run/podman/podman.sock  →  unix socket path
  if (rawUrl.startsWith("http+unix://") || rawUrl.startsWith("unix://")) {
    const socketPath = rawUrl.replace(/^(http\+unix|unix):\/\//, "");
    return { httpBase: "http://localhost", unix: socketPath };
  }

  // tcp:// → http://
  if (rawUrl.startsWith("tcp://")) {
    return { httpBase: rawUrl.replace("tcp://", "http://") };
  }

  // ssh:// — requires an external tunnel; fail fast with a clear message
  if (rawUrl.startsWith("http+ssh://") || rawUrl.startsWith("ssh://")) {
    throw new Error(
      "SSH connections require an SSH tunnel. " +
        "Set up the tunnel first and connect via tcp:// or http+unix://.",
    );
  }

  return { httpBase: rawUrl };
}

/** Thin wrapper around a Bun Response that mirrors the Python APIResponse proxy. */
export class APIResponse<T = unknown> {
  private _data?: T;

  constructor(
    private readonly _status: number,
    private readonly _body: unknown,
  ) {}

  get status(): number {
    return this._status;
  }

  get ok(): boolean {
    return this._status >= 200 && this._status < 300;
  }

  get data(): T {
    return this._body as T;
  }

  /**
   * Throws an APIError (or subclass) when the response status >= 400.
   * @param NotFoundClass - Override the error class used for 404 responses.
   */
  raiseForStatus(NotFoundClass: typeof NotFound = NotFound): void {
    if (this._status < 400) return;

    let message = String(this._body ?? "");
    let explanation: string | undefined;

    if (typeof this._body === "object" && this._body !== null) {
      const body = this._body as Record<string, string>;
      message = body["cause"] ?? body["message"] ?? message;
      explanation = body["message"];
    }

    if (this._status === 404) {
      throw new NotFoundClass(message, explanation);
    }
    throw new APIError(message, this._status, explanation);
  }
}

export class APIClient {
  readonly baseUrl: string;
  readonly version: string;
  private readonly timeout?: number;
  private readonly retries: number;
  private readonly httpBase: string;
  private readonly unix?: string;

  constructor(options: APIClientOptions) {
    this.baseUrl = options.baseUrl;
    this.version = options.version ?? DEFAULT_VERSION;
    this.timeout = options.timeout;
    this.retries = options.retries ?? 0;

    const { httpBase, unix } = resolveConnection(options.baseUrl);
    this.httpBase = httpBase;
    this.unix = unix;
  }

  private buildUrl(path: string, compatible: boolean, params?: Record<string, unknown>): string {
    const ver = this.version.replace(/^v/, "");
    const prefix = compatible ? `/v${ver}/compat` : `/v${ver}/libpod`;
    return `${this.httpBase}${prefix}${path}${buildQuery(params)}`;
  }

  /** Expose buildUrl for testing purposes. */
  buildUrlPublic(path: string, compatible: boolean, params?: Record<string, unknown>): string {
    return this.buildUrl(path, compatible, params);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async fetchWithRetry(
    url: string,
    opts: RequestInit & { unix?: string },
  ): Promise<Response> {
    let delay = 100;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await fetch(url, opts);
      } catch (err) {
        if (attempt === this.retries) {
          throw new PodmanError(`Request failed after ${attempt + 1} attempt(s): ${err}`);
        }
        await this.sleep(Math.min(delay, 2000));
        delay *= 2;
      }
    }
    throw new PodmanError("Unreachable");
  }

  private async request<T>(
    method: string,
    path: string,
    config: RequestConfig = {},
  ): Promise<APIResponse<T>> {
    const url = this.buildUrl(path, config.compatible ?? false, config.params);

    const fetchOptions: RequestInit & { unix?: string } = {
      method,
      headers: { ...config.headers },
    };

    if (this.unix) fetchOptions.unix = this.unix;

    if (config.data !== undefined) {
      fetchOptions.body =
        typeof config.data === "string" ? config.data : JSON.stringify(config.data);
      (fetchOptions.headers as Record<string, string>)["Content-Type"] ??= "application/json";
    }

    if (this.timeout !== undefined) {
      fetchOptions.signal = AbortSignal.timeout(this.timeout);
    }

    const res = await this.fetchWithRetry(url, fetchOptions);

    // Parse body — try JSON first, fall back to text
    let body: unknown;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    return new APIResponse<T>(res.status, body);
  }

  get<T = unknown>(path: string, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.request<T>("GET", path, config);
  }

  post<T = unknown>(path: string, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.request<T>("POST", path, config);
  }

  delete<T = unknown>(path: string, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.request<T>("DELETE", path, config);
  }

  put<T = unknown>(path: string, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.request<T>("PUT", path, config);
  }

  patch<T = unknown>(path: string, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.request<T>("PATCH", path, config);
  }

  head(path: string, config?: RequestConfig): Promise<APIResponse> {
    return this.request("HEAD", path, config);
  }

  options<T = unknown>(path: string, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.request<T>("OPTIONS", path, config);
  }
}

function setTimeout(r: (value: void | PromiseLike<void>) => void, ms: number): void {
  throw new Error("Function not implemented.");
}
