/** EventsManager — stream Podman service events. */

import { APIClient } from "../api/client";
import { prepareFilters, prepareTimestamp } from "../api/utils";

export interface EventsListOptions {
  since?: Date | number;
  until?: Date | number;
  filters?: Record<string, string | string[]>;
  decode?: boolean;
}

export class EventsManager {
  constructor(private readonly client: APIClient) {}

  /**
   * Stream events from the Podman service.
   *
   * @yields Raw event strings, or decoded objects when decode=true.
   */
  async *list(
    options: EventsListOptions = {}
  ): AsyncGenerator<string | Record<string, unknown>> {
    const res = await this.client.get<string>("/events", {
      params: {
        filters: prepareFilters(options.filters),
        since: prepareTimestamp(options.since),
        until: prepareTimestamp(options.until),
        stream: true,
      },
    });
    res.raiseForStatus();

    const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      yield options.decode ? (JSON.parse(trimmed) as Record<string, unknown>) : trimmed;
    }
  }
}
