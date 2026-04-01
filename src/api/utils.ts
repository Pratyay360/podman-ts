/** Utility functions for preparing HTTP request parameters. */

type FilterValue = string | string[] | boolean | number | null | undefined;

/**
 * Serialize a filters object into a JSON string suitable for Podman API query params.
 * Normalizes all values to Record<string, string[]>.
 */
export function prepareFilters(
  filters?: Record<string, FilterValue> | string[] | null,
): string | undefined {
  if (!filters) return undefined;

  const criteria: Record<string, string[]> = Object.create(null);

  if (Array.isArray(filters)) {
    for (const item of filters) {
      const idx = item.indexOf("=");
      if (idx !== -1) {
        const key = item.slice(0, idx);
        const value = item.slice(idx + 1);
        if (key) (criteria[key] ??= []).push(value);
      }
    }
  } else {
    for (const [key, value] of Object.entries(filters)) {
      if (value === null || value === undefined) continue;
      const values = Array.isArray(value) ? value : [String(value)];
      criteria[key] = values.map(String);
    }
  }

  return Object.keys(criteria).length ? JSON.stringify(criteria) : undefined;
}

/**
 * Serialize a request body, stripping null/undefined/empty values.
 */
export function prepareBody(body: Record<string, unknown>): string {
  return JSON.stringify(filterValues(body));
}

function filterValues(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = filterValues(value as Record<string, unknown>);
      if (Object.keys(nested).length > 0) result[key] = nested;
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Encode an auth config object as base64url JSON (for X-Registry-Auth header). */
export function encodeAuthHeader(authConfig: Record<string, string>): string {
  return btoa(JSON.stringify(authConfig));
}

/** Parse "repository:tag" into [repository, tag | undefined]. */
export function parseRepository(name: string): [string, string | undefined] {
  const idx = name.lastIndexOf(":");
  if (idx === -1) return [name, undefined];
  const tag = name.slice(idx + 1);
  const repo = name.slice(0, idx);
  // If tag contains "/" it's a port number, not a tag
  if (tag.includes("/")) return [name, undefined];
  return [repo, tag];
}

/** Convert a Date or unix timestamp to a UTC unix timestamp (seconds). */
export function prepareTimestamp(value: Date | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  return Math.floor(value.getTime() / 1000);
}

/** Demux a multiplexed container stream into { stdout, stderr }. */
export function demuxOutput(data: Uint8Array): { stdout: Uint8Array; stderr: Uint8Array } {
  const HEADER_SIZE = 8;
  let stdout = new Uint8Array(0);
  let stderr = new Uint8Array(0);
  let offset = 0;

  while (data.length - offset >= HEADER_SIZE) {
    const streamType = data[offset];
    const payloadSize =
      (data[offset + 4] << 24) |
      (data[offset + 5] << 16) |
      (data[offset + 6] << 8) |
      data[offset + 7];
    offset += HEADER_SIZE;

    if (data.length - offset < payloadSize) break;
    const payload = data.slice(offset, offset + payloadSize);
    offset += payloadSize;

    if (streamType === 1) {
      const merged = new Uint8Array(stdout.length + payload.length);
      merged.set(stdout);
      merged.set(payload, stdout.length);
      stdout = merged;
    } else if (streamType === 2) {
      const merged = new Uint8Array(stderr.length + payload.length);
      merged.set(stderr);
      merged.set(payload, stderr.length);
      stderr = merged;
    }
  }

  return { stdout, stderr };
}
