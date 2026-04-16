/** Exec session — run a command inside a running container (libpod `/exec` API). */

import type { APIClient } from "../api/client";
import { prepareBody } from "../api/utils";
import { APIError, NotFound } from "../errors";

export class ExecInstance {
  constructor(
    readonly id: string,
    private readonly client: APIClient,
  ) {}

  async inspect(): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>(`/exec/${this.id}/json`);
    res.raiseForStatus(NotFound);
    return res.data;
  }

  async resize(options: { height?: number; width?: number; running?: boolean } = {}): Promise<void> {
    const res = await this.client.post(`/exec/${this.id}/resize`, {
      params: { h: options.height, w: options.width, running: options.running },
    });
    res.raiseForStatus(NotFound);
  }

  /**
   * Start the exec instance. When `detach` is false, returns the raw `Response` stream
   * (same framing as container attach). When `detach` is true, returns `undefined` after the command is started.
   */
  async start(
    options: { detach?: boolean; tty?: boolean; height?: number; width?: number } = {},
  ): Promise<Response | undefined> {
    const res = await this.client.rawRequest("POST", `/exec/${this.id}/start`, {
      data: prepareBody({
        Detach: options.detach,
        Tty: options.tty,
        h: options.height,
        w: options.width,
      }),
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const body = await res.text();
      let message = body;
      try {
        const j = JSON.parse(body) as Record<string, string>;
        message = j["cause"] ?? j["message"] ?? body;
      } catch {
        /* keep text */
      }
      throw new APIError(message, res.status);
    }
    if (options.detach) return undefined;
    return res;
  }
}
