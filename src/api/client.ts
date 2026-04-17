/**
 * APIClient — low-level HTTP client for the Podman service.
 * Uses Bun's native fetch with Unix-socket support (no axios / node:http needed).
 */

import { APIError, NotFound, PodmanError } from "../errors";

export function attachRequestBody(
  headers: Record<string, string>,
  data: unknown,
): ArrayBuffer | Uint8Array | Blob | FormData | string | undefined {
  if (data === undefined) return undefined;

  if (data instanceof FormData) {
    delete headers["Content-Type"];
    return data;
  }

  if (data instanceof ArrayBuffer) {
    headers["Content-Type"] ??= "application/octet-stream";
    return data;
  }

  if (data instanceof Uint8Array) {
    headers["Content-Type"] ??= "application/octet-stream";
    return data;
  }

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    headers["Content-Type"] ??= "application/octet-stream";
    return data;
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    headers["Content-Type"] ??= "application/octet-stream";
    return new Uint8Array(data);
  }

  if (typeof data === "string") {
    headers["Content-Type"] ??= "application/json";
    return data;
  }

  headers["Content-Type"] ??= "application/json";
  return JSON.stringify(data);
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
  /**
   * How to read the response body. When omitted, JSON is used if Content-Type is
   * application/json, otherwise text.
   */
  parseAs?: "json" | "text" | "arraybuffer";
}

const DEFAULT_VERSION = "v5.0.0";

/** Serialise query params, dropping null/undefined values. */
function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === null || item === undefined) continue;
        qs.append(k, String(item));
      }
    } else {
      qs.append(k, String(v));
    }
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
    const timerHost = globalThis as unknown as {
      setTimeout: (handler: () => void, timeout?: number) => unknown;
    };
    return new Promise((resolve) => {
      timerHost.setTimeout(resolve, ms);
    });
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

    const hdrs = fetchOptions.headers as Record<string, string>;
    const bodyInit = attachRequestBody(hdrs, config.data);
    if (bodyInit !== undefined) fetchOptions.body = bodyInit;

    if (this.timeout !== undefined) {
      fetchOptions.signal = AbortSignal.timeout(this.timeout);
    }

    const res = await this.fetchWithRetry(url, fetchOptions);

    let body: unknown;
    if (config.parseAs === "arraybuffer") {
      body = await res.arrayBuffer();
    } else if (config.parseAs === "text") {
      body = await res.text();
    } else if (config.parseAs === "json") {
      body = await res.json();
    } else {
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        body = await res.json();
      } else {
        body = await res.text();
      }
    }

    return new APIResponse<T>(res.status, body);
  }

  /**
   * Low-level fetch returning the raw Response (no body parsing).
   * Useful for attach/exec streams and hijacked connections.
   */
  async rawRequest(method: string, path: string, config: RequestConfig = {}): Promise<Response> {
    const url = this.buildUrl(path, config.compatible ?? false, config.params);
    const fetchOptions: RequestInit & { unix?: string } = {
      method,
      headers: { ...config.headers },
    };
    if (this.unix) fetchOptions.unix = this.unix;

    const hdrs = fetchOptions.headers as Record<string, string>;
    const bodyInit = attachRequestBody(hdrs, config.data);
    if (bodyInit !== undefined) fetchOptions.body = bodyInit;

    if (this.timeout !== undefined) {
      fetchOptions.signal = AbortSignal.timeout(this.timeout);
    }

    return this.fetchWithRetry(url, fetchOptions);
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
