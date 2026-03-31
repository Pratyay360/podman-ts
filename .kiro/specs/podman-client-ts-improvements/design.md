# Design Document: podman-client-ts Improvements

## Overview

`podman-client-ts` is a TypeScript SDK for the Podman RESTful API (libpod). The current implementation has several issues that prevent it from being used outside the Bun runtime: it uses `Bun.TOML` for config parsing, `Bun.spawn` in the build mixin, a `moduleResolution: "bundler"` tsconfig that is Bun-specific, and a broken `buildUrl` method that omits the version segment from libpod paths. Additionally, the public API leaks `APIResponse` wrappers, the mixin pattern produces TypeScript type errors, and there is no test suite, linter config, or README.

This design addresses all eleven requirements by making targeted, minimal changes to the existing source tree. The two-layer architecture (`api/` for HTTP transport, `domain/` for resource models) is preserved throughout.

---

## Architecture

The module follows a two-layer design:

```
src/
  index.ts              ← public re-exports
  client.ts             ← PodmanClient (top-level entry point)
  errors.ts             ← error hierarchy
  api/
    client.ts           ← APIClient (low-level HTTP, retry, URL construction)
    utils.ts            ← prepareFilters, demuxOutput, etc.
    versions.ts         ← version constants
  domain/
    manager.ts          ← PodmanResource, Manager base classes
    config.ts           ← PodmanConfig (TOML via smol-toml)
    containers.ts       ← Container resource + ContainersManager
    containers_create.ts← CreateMixin → concrete method on ContainersManager
    containers_run.ts   ← RunMixin → concrete method on ContainersManager
    images.ts           ← Image resource + ImagesManager
    images_build.ts     ← BuildMixin → concrete method on ImagesManager
    ... (networks, volumes, pods, secrets, manifests, quadlets, events, system)
  __tests__/
    url-construction.test.ts
    prepare-filters.test.ts
    podman-config.test.ts
    demux-output.test.ts
    containers-manager.test.ts
    images-manager.test.ts
```

Build output (produced by `tsup`):

```
dist/
  index.js      ← ESM bundle (ES2022)
  index.cjs     ← CJS bundle
  index.d.ts    ← TypeScript declarations (ESM)
  index.d.cts   ← TypeScript declarations (CJS)
```

### Build Tool

`tsup` is chosen as the build tool because it produces dual ESM/CJS output with `.d.ts` files from a single config, requires no manual Rollup/webpack configuration, and works with both Bun and Node.js. It replaces the current `bun build` invocation.

---

## Components and Interfaces

### 1. `APIClient` (`src/api/client.ts`)

**Changes:**

- Fix `buildUrl`: libpod prefix becomes `/v${this.version}/libpod`, compat prefix becomes `/v${this.version}/compat`. Strip any leading `v` from the stored version so the prefix is always `v{semver}`.
- Add `patch<T>()` method with the same signature as `put<T>()`.
- Add `retries` to `APIClientOptions` (default `0`). Wrap `fetch` in a retry loop with exponential backoff (100 ms base, ×2 per attempt, cap 2000 ms). Only retry on network-level errors (caught `Error` before a `Response` is received), never on HTTP 4xx/5xx.

```typescript
export interface APIClientOptions {
  baseUrl: string;
  version?: string;
  timeout?: number;
  retries?: number; // NEW — default 0
}
```

Fixed `buildUrl`:

```typescript
private buildUrl(path: string, compatible: boolean, params?: Record<string, unknown>): string {
  const ver = this.version.replace(/^v/, "");
  const prefix = compatible ? `/v${ver}/compat` : `/v${ver}/libpod`;
  return `${this.httpBase}${prefix}${path}${buildQuery(params)}`;
}
```

Retry loop (sketch):

```typescript
private async fetchWithRetry(url: string, opts: RequestInit & { unix?: string }): Promise<Response> {
  let delay = 100;
  for (let attempt = 0; attempt <= this.retries; attempt++) {
    try {
      return await fetch(url, opts);
    } catch (err) {
      if (attempt === this.retries) throw new PodmanError(`Request failed after ${attempt + 1} attempt(s): ${err}`);
      await sleep(Math.min(delay, 2000));
      delay *= 2;
    }
  }
  throw new PodmanError("Unreachable");
}
```

### 2. `PodmanConfig` (`src/domain/config.ts`)

**Change:** Replace `Bun.TOML.parse(...)` with `import { parse } from "smol-toml"`. Wrap in try/catch; on failure log a warning and continue (graceful degradation).

```typescript
import { parse as parseToml } from "smol-toml";
// ...
try {
  const toml = parseToml(readFileSync(tomlPath, "utf-8"));
  Object.assign(this.attrs, toml);
} catch {
  console.warn("[podman-client] Failed to parse containers.conf TOML — skipping.");
}
```

### 3. Mixin Pattern (`containers.ts`, `images.ts`)

**Change:** Remove `declare` fields and `Object.assign` calls. Instead, inline the mixin logic as concrete methods directly on the manager classes, delegating to the helper functions already defined in `containers_create.ts`, `containers_run.ts`, and `images_build.ts`.

`ContainersManager`:

```typescript
// Replace: declare create: ...
async create(opts: ContainerCreateOptions): Promise<Container> {
  return new CreateMixin().create.call(this, opts);
}
async run(image: string, command?: string | string[], options?: RunOptions) {
  return new RunMixin().run.call(this, image, command, options);
}
```

A cleaner alternative (preferred): move the implementation bodies directly into `ContainersManager` and `ImagesManager`, removing the separate mixin classes entirely. The mixin files become pure helper modules exporting only the option types and render functions.

`ImagesManager`:

```typescript
// Replace: build!: ...
async build(options: BuildOptions): Promise<{ image: Image; logs: string[] }> {
  // implementation moved inline from BuildMixin
}
```

This eliminates all `declare` and `!` non-null assertions on method fields, producing zero TS type errors from mixin declarations.

### 4. `Container.logs` (`src/domain/containers.ts`)

**Change:** Overload `logs()` to return `AsyncIterable<string>` when `stream: true`, and `Promise<string>` otherwise.

```typescript
async logs(options: LogOptions & { stream: true }): Promise<AsyncIterable<string>>;
async logs(options?: LogOptions): Promise<string>;
async logs(options: LogOptions = {}): Promise<string | AsyncIterable<string>> {
  const params = {
    stdout: options.stdout ?? true,
    stderr: options.stderr ?? true,
    follow: options.follow ?? false,
    since: options.since,
    until: options.until,
    tail: options.tail,
  };
  if (options.stream) {
    return this._streamLogs(params);
  }
  const res = await this.client.get<string>(`/containers/${this.id}/logs`, { params });
  res.raiseForStatus();
  return res.data;
}

private async *_streamLogs(params: Record<string, unknown>): AsyncIterable<string> {
  const url = this.client.buildUrlPublic(`/containers/${this.id}/logs`, false, params);
  const res = await fetch(url, { /* unix socket opts */ });
  if (!res.ok) throw new APIError(`Log stream error`, res.status);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const line of lines) yield line;
  }
  if (buf) yield buf;
}
```

`LogOptions` interface:

```typescript
export interface LogOptions {
  stream?: boolean;
  stdout?: boolean;
  stderr?: boolean;
  follow?: boolean;
  since?: string | number;
  until?: string | number;
  tail?: number | "all";
}
```

### 5. Domain Methods — Eliminate `APIResponse` from Public API

**Change:** All manager methods already call `res.raiseForStatus()` and then return `res.data`. The `APIResponse` type is already internal. The only change needed is to ensure `APIResponse` is not required in normal caller code. The existing pattern (`res.raiseForStatus(); return res.data`) is correct — no structural change needed beyond verifying no manager method returns a raw `APIResponse`.

### 6. Build Configuration

**`tsconfig.json`** — change `moduleResolution` from `"bundler"` to `"node16"`, remove `"bun-types"` from `types`, add `"node"`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

**`package.json`** additions:

```json
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "files": ["dist", "src"],
  "engines": { "node": ">=18", "bun": ">=1.0" },
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts --target es2022 --out-dir dist",
    "lint": "biome check src/",
    "format": "biome format --write src/"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "@biomejs/biome": "^1.8.0"
  },
  "dependencies": {
    "smol-toml": "^1.3.0"
  }
}
```

### 7. Biome Configuration (`biome.json`)

```json
{
  "$schema": "https://biomejs.dev/schemas/1.8.0/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  }
}
```

---

## Data Models

### `APIClientOptions`

| Field     | Type     | Default   | Description                              |
| --------- | -------- | --------- | ---------------------------------------- |
| `baseUrl` | `string` | —         | Full URL to Podman service               |
| `version` | `string` | `"5.0.0"` | API version (with or without `v` prefix) |
| `timeout` | `number` | —         | Request timeout in ms                    |
| `retries` | `number` | `0`       | Max retry attempts on network errors     |

### `LogOptions`

| Field    | Type               | Default | Description                                                 |
| -------- | ------------------ | ------- | ----------------------------------------------------------- |
| `stream` | `boolean`          | `false` | Return `AsyncIterable<string>` instead of `Promise<string>` |
| `stdout` | `boolean`          | `true`  | Include stdout                                              |
| `stderr` | `boolean`          | `true`  | Include stderr                                              |
| `follow` | `boolean`          | `false` | Follow log output                                           |
| `since`  | `string \| number` | —       | Show logs since timestamp                                   |
| `until`  | `string \| number` | —       | Show logs until timestamp                                   |
| `tail`   | `number \| "all"`  | —       | Number of lines from end                                    |

### `ServiceConnection` (unchanged)

Reads from `podman-connections.json` (JSON format) or `containers.conf` (TOML format via `smol-toml`).

### URL Construction

| Input                                              | Output                                           |
| -------------------------------------------------- | ------------------------------------------------ |
| `libpod`, path `/containers/json`, version `5.0.0` | `http://localhost/v5.0.0/libpod/containers/json` |
| `compat`, path `/containers/json`, version `5.0.0` | `http://localhost/v5.0.0/compat/containers/json` |
| version `"v5.0.0"` (with prefix)                   | strips to `5.0.0`, produces `v5.0.0` once        |

---

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Property 1: libpod URL contains version segment exactly once

_For any_ valid semver version string (with or without a leading `v`), the URL produced by `APIClient.buildUrl` for a libpod path must contain the substring `/v{semver}/libpod` exactly once and must not contain `//libpod` or `/vv`.

**Validates: Requirements 2.1, 2.3, 2.4**

---

### Property 2: compat URL contains version segment exactly once

_For any_ valid semver version string, the URL produced by `APIClient.buildUrl` for a compat path must contain the substring `/v{semver}/compat` exactly once.

**Validates: Requirements 2.2, 2.3, 2.4**

---

### Property 3: `prepareFilters` round-trip

_For any_ non-empty filters object, `JSON.parse(prepareFilters(filters)!)` must produce an object where every key maps to an array of strings, and every original filter key-value pair is represented.

**Validates: Requirements 9.2**

---

### Property 4: `demuxOutput` stdout/stderr partition

_For any_ sequence of multiplexed frames (stream type 1 = stdout, type 2 = stderr), `demuxOutput` must produce stdout and stderr byte arrays whose concatenated lengths equal the sum of all payload sizes, and each byte must appear in the correct output channel.

**Validates: Requirements 9.4**

---

### Property 5: Retry exhaustion throws `PodmanError`

_For any_ `retries` value `n ≥ 1`, when every fetch attempt throws a network-level error, `APIClient` must throw a `PodmanError` after exactly `n + 1` total attempts (1 initial + n retries).

**Validates: Requirements 7.1, 7.2, 7.5**

---

### Property 6: Exponential backoff stays within bounds

_For any_ retry attempt index `i` (0-based), the backoff delay must equal `min(100 * 2^i, 2000)` milliseconds.

**Validates: Requirements 7.3**

---

### Property 7: HTTP errors are not retried

_For any_ HTTP response with status ≥ 400, `APIClient` must not retry the request regardless of the `retries` setting — the error must be surfaced immediately after the first attempt.

**Validates: Requirements 7.4**

---

### Property 8: `PodmanConfig` services round-trip

_For any_ valid `podman-connections.json` content, constructing a `PodmanConfig` and reading `.services` must return a map where every connection name present in the JSON maps to a `ServiceConnection` with the correct URI.

**Validates: Requirements 3.2, 9.3**

---

### Property 9: `Container.logs` stream yields all lines

_For any_ sequence of log lines emitted by the Podman service, consuming the `AsyncIterable<string>` returned by `Container.logs({ stream: true })` must yield every line in order with no lines dropped or duplicated.

**Validates: Requirements 5.1, 5.3**

---

## Error Handling

| Scenario                                 | Behaviour                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| HTTP 4xx/5xx                             | `raiseForStatus()` throws `APIError` (or `NotFound` for 404) immediately, no retry |
| Network error, `retries = 0`             | Throws `PodmanError` immediately                                                   |
| Network error, `retries = n`             | Retries up to `n` times with exponential backoff, then throws `PodmanError`        |
| TOML parse failure in `PodmanConfig`     | Logs a warning, skips TOML merge, continues with JSON data only                    |
| Log stream HTTP error                    | `_streamLogs` throws `APIError` with the response status code                      |
| Empty `prepareFilters` input             | Returns `undefined` (no `filters` query param sent)                                |
| `Container.logs` stream closed by server | Async iterable completes normally (no error thrown)                                |

---

## Testing Strategy

### Unit Tests (`src/__tests__/*.test.ts`)

Unit tests use `bun test` (built-in test runner). HTTP calls are mocked by replacing `APIClient` methods with stub functions — no live Podman service required.

**Test files and coverage:**

| File                         | What it tests                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `url-construction.test.ts`   | `buildUrl` for libpod/compat paths, version with/without `v` prefix, default version |
| `prepare-filters.test.ts`    | `prepareFilters` with empty, single-value, multi-value, and array-of-string inputs   |
| `podman-config.test.ts`      | `PodmanConfig` JSON parsing, TOML parsing via `smol-toml`, graceful TOML failure     |
| `demux-output.test.ts`       | `demuxOutput` with stdout-only, stderr-only, and interleaved frames                  |
| `containers-manager.test.ts` | `ContainersManager.list` and `.get` with mocked `APIClient`                          |
| `images-manager.test.ts`     | `ImagesManager.list` and `.get` with mocked `APIClient`                              |

### Property-Based Tests

Property-based tests use **fast-check** (the standard PBT library for TypeScript/JavaScript). Each property test runs a minimum of 100 iterations.

Each test is tagged with a comment in the format:
`// Feature: podman-client-ts-improvements, Property {N}: {property_text}`

| Property   | Test description                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Property 1 | Generate random semver strings (with/without `v`), assert URL contains `/v{ver}/libpod` exactly once                    |
| Property 2 | Same for compat prefix                                                                                                  |
| Property 3 | Generate random filter objects, assert `JSON.parse(prepareFilters(...))` preserves all key-value pairs as string arrays |
| Property 4 | Generate random frame sequences, assert `demuxOutput` partitions bytes correctly                                        |
| Property 5 | Generate `retries` values 1–5, mock fetch to always throw, assert `PodmanError` thrown after correct attempt count      |
| Property 6 | Generate attempt indices 0–10, assert backoff formula holds                                                             |
| Property 7 | Generate HTTP status codes 400–599, assert no retry occurs                                                              |
| Property 8 | Generate random connection maps, assert `PodmanConfig.services` round-trips correctly                                   |
| Property 9 | Generate random line arrays, assert async iterable yields all lines in order                                            |

### Balance

Unit tests handle specific examples, integration points, and edge cases (e.g., empty filter input, TOML parse failure). Property tests handle universal correctness across all inputs. Both are required — they are complementary, not redundant.
