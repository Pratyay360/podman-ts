# Requirements Document

## Introduction

This document captures the requirements for improving `podman-client-ts` — the TypeScript client for the Podman RESTful API (libpod) — into a production-quality, runtime-agnostic TypeScript module. The improvements address build tooling, package metadata, runtime portability, type safety, API correctness, streaming support, error handling, testing, and documentation.

## Glossary

- **APIClient**: The low-level HTTP client in `src/api/client.ts` that sends requests to the Podman service.
- **PodmanClient**: The top-level user-facing client in `src/client.ts` that exposes domain managers.
- **Manager**: An abstract base class in `src/domain/manager.ts` that resource managers extend.
- **PodmanResource**: An abstract base class representing a single Podman resource (container, image, etc.).
- **Mixin**: A class whose prototype methods are copied onto another class via `Object.assign`.
- **libpod**: The Podman-native API path prefix (`/v{version}/libpod/`).
- **compat**: The Docker-compatible API path prefix (`/v{version}/compat/`).
- **ESM**: ECMAScript Modules — the standard JavaScript module format.
- **CJS**: CommonJS — the Node.js legacy module format.
- **TOML_Parser**: A runtime-agnostic TOML parsing utility that replaces direct `Bun.TOML` usage.
- **LogStream**: An async iterable that yields log lines from a container.
- **Biome**: A fast formatter and linter for TypeScript/JavaScript.

---

## Requirements

### Requirement 1: Runtime-Agnostic Build Output

**User Story:** As a Node.js or Bun developer, I want to install `podman-client` from npm and import it in my project without runtime-specific errors, so that I can use it regardless of which JavaScript runtime I target.

#### Acceptance Criteria

1. THE Build_System SHALL produce an ESM output bundle at `dist/index.js` targeting `ES2022` or later.
2. THE Build_System SHALL produce a CommonJS output bundle at `dist/index.cjs` for Node.js compatibility.
3. THE Build_System SHALL produce TypeScript declaration files (`.d.ts`) alongside each output bundle.
4. THE `package.json` SHALL include an `exports` field that maps `"."` to the ESM bundle for `import`, the CJS bundle for `require`, and the declaration file for `types`.
5. THE `package.json` SHALL include a `files` field listing only `dist/` and `src/` to prevent publishing unnecessary files.
6. THE `package.json` SHALL include an `engines` field specifying `node >= 18` and `bun >= 1.0`.
7. THE `tsconfig.json` SHALL use `moduleResolution: "node16"` or `"nodenext"` instead of `"bundler"` so that module resolution is not Bun-specific.

---

### Requirement 2: Correct libpod URL Construction

**User Story:** As a developer calling the Podman API, I want every request URL to include the API version segment, so that requests are routed to the correct versioned libpod endpoint.

#### Acceptance Criteria

1. WHEN `APIClient` builds a URL for a libpod path, THE `APIClient` SHALL produce a URL of the form `{httpBase}/v{version}/libpod{path}`.
2. WHEN `APIClient` builds a URL for a compat path, THE `APIClient` SHALL produce a URL of the form `{httpBase}/v{version}/compat{path}`.
3. THE `APIClient` SHALL default to version `"5.0.0"` when no version is provided.
4. WHEN the version string already contains a `v` prefix, THE `APIClient` SHALL NOT double-prefix the version segment.

---

### Requirement 3: Runtime-Agnostic Configuration Parsing

**User Story:** As a Node.js developer, I want `PodmanConfig` to parse `containers.conf` TOML files without depending on `Bun.TOML`, so that the module works outside of the Bun runtime.

#### Acceptance Criteria

1. THE `TOML_Parser` SHALL parse TOML-formatted strings into JavaScript objects without using `Bun.TOML`.
2. WHEN `PodmanConfig` reads a `containers.conf` file, THE `PodmanConfig` SHALL use `TOML_Parser` to parse the file contents.
3. IF `TOML_Parser` is unavailable at runtime, THEN THE `PodmanConfig` SHALL skip TOML parsing and log a warning rather than throwing an unhandled error.
4. THE `TOML_Parser` SHALL be a runtime-agnostic implementation (e.g., a pure-JS/TS TOML library) with no Bun-specific APIs.

---

### Requirement 4: Type-Safe Mixin Pattern

**User Story:** As a TypeScript developer, I want mixin methods on managers to be fully type-checked, so that I get correct autocomplete and compile-time errors when calling `containers.create()` or `images.build()`.

#### Acceptance Criteria

1. THE `ContainersManager` SHALL declare `create` and `run` as concrete typed methods rather than using `declare` with `Object.assign`.
2. THE `ImagesManager` SHALL declare `build` as a concrete typed method rather than using `Object.assign`.
3. WHEN a mixin method is called on a manager, THE TypeScript compiler SHALL resolve the correct parameter and return types without requiring a type cast.
4. THE Build_System SHALL produce zero TypeScript type errors related to mixin method declarations.

---

### Requirement 5: Streaming Container Logs

**User Story:** As a developer monitoring a running container, I want to consume container logs as an async iterable of lines, so that I can process log output incrementally without buffering the entire response.

#### Acceptance Criteria

1. THE `Container` SHALL expose a `logs` method that accepts a `stream: true` option and returns an `AsyncIterable<string>`.
2. WHEN `stream` is `false` or omitted, THE `Container.logs` method SHALL return a `Promise<string>` containing the full log output.
3. WHEN the Podman service closes the log stream, THE `LogStream` SHALL complete the async iterable without error.
4. IF the Podman service returns an error status during log streaming, THEN THE `LogStream` SHALL throw an `APIError` with the response status code.
5. THE `Container.logs` method SHALL accept `stdout`, `stderr`, `follow`, `since`, `until`, and `tail` options consistent with the libpod `/containers/{name}/logs` endpoint.

---

### Requirement 6: PATCH HTTP Method on APIClient

**User Story:** As a developer using the low-level `APIClient`, I want a `patch` method available alongside `get`, `post`, `put`, and `delete`, so that I can call Podman API endpoints that require HTTP PATCH.

#### Acceptance Criteria

1. THE `APIClient` SHALL expose a `patch<T>` method with the same signature as the existing `put<T>` method.
2. WHEN `APIClient.patch` is called, THE `APIClient` SHALL send an HTTP `PATCH` request to the constructed URL.
3. THE `patch` method SHALL be exported from `src/index.ts` as part of the `APIClient` type.

---

### Requirement 7: Retry Logic and Connection Error Handling

**User Story:** As a developer running against a Podman service that may be temporarily unavailable, I want the client to retry transient connection failures automatically, so that short service interruptions do not require manual retry logic in my application.

#### Acceptance Criteria

1. THE `APIClient` SHALL accept a `retries` option (default: `0`) specifying the maximum number of retry attempts on connection errors.
2. WHEN a request fails with a network-level error (e.g., `ECONNREFUSED`, `ENOENT` on a Unix socket) and `retries > 0`, THE `APIClient` SHALL retry the request up to `retries` times before throwing.
3. THE `APIClient` SHALL apply an exponential backoff delay between retries, starting at 100 ms and doubling on each attempt, capped at 2000 ms.
4. THE `APIClient` SHALL NOT retry requests that fail with HTTP 4xx or 5xx status codes — only network-level errors are retried.
5. IF all retry attempts are exhausted, THEN THE `APIClient` SHALL throw a `PodmanError` with a message indicating the number of attempts made.

---

### Requirement 8: Eliminate Redundant APIResponse Wrapper

**User Story:** As a developer using the domain layer, I want manager methods to return typed data directly rather than wrapping it in an `APIResponse` object, so that I don't need to call `.data` to access results.

#### Acceptance Criteria

1. THE `Manager` subclass methods (`get`, `list`, `create`, etc.) SHALL return typed domain objects or primitives directly, not `APIResponse<T>` instances.
2. THE `APIClient` internal `request` method MAY continue to return `APIResponse<T>` for internal error-checking purposes.
3. WHEN a domain method calls `res.raiseForStatus()`, THE domain method SHALL then return `res.data` (or a model constructed from it) to the caller.
4. THE public API surface exported from `src/index.ts` SHALL NOT require callers to interact with `APIResponse` for normal usage.

---

### Requirement 9: Test Suite

**User Story:** As a contributor to `podman-client-ts`, I want a test suite that validates core client behaviour without requiring a live Podman service, so that I can verify correctness during development.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `APIClient` URL construction covering both libpod and compat path prefixes with version segments.
2. THE Test_Suite SHALL include unit tests for `prepareFilters` covering empty input, single-value filters, multi-value filters, and array-of-string input.
3. THE Test_Suite SHALL include unit tests for `PodmanConfig` covering JSON connection file parsing and TOML legacy file parsing.
4. THE Test_Suite SHALL include unit tests for `demuxOutput` covering stdout-only, stderr-only, and interleaved stdout/stderr streams.
5. THE Test_Suite SHALL include unit tests for `ContainersManager.list` and `ContainersManager.get` using a mocked `APIClient`.
6. THE Test_Suite SHALL include unit tests for `ImagesManager.list` and `ImagesManager.get` using a mocked `APIClient`.
7. WHEN all unit tests are run with `bun test`, THE Test_Suite SHALL complete with zero failures.
8. THE Test_Suite SHALL be located under `podman-client-ts/src/__tests__/` with filenames matching `*.test.ts`.

---

### Requirement 10: Linting and Formatting Configuration

**User Story:** As a contributor, I want a consistent code style enforced by a linter and formatter, so that pull requests don't introduce style inconsistencies.

#### Acceptance Criteria

1. THE Repository SHALL include a `biome.json` configuration file at `podman-client-ts/biome.json`.
2. THE `biome.json` SHALL configure formatting with 2-space indentation, double quotes, and a line width of 100.
3. THE `biome.json` SHALL enable the `recommended` lint rule set.
4. THE `package.json` SHALL include a `lint` script that runs `biome check src/`.
5. THE `package.json` SHALL include a `format` script that runs `biome format --write src/`.
6. WHEN `bun run lint` is executed on the `src/` directory, THE Linter SHALL report zero errors on the existing source files after any required fixes are applied.

---

### Requirement 11: README and Usage Documentation

**User Story:** As a new user of `podman-client-ts`, I want a README that shows how to install and use the client, so that I can get started without reading the source code.

#### Acceptance Criteria

1. THE Repository SHALL include a `README.md` file at `podman-client-ts/README.md`.
2. THE `README.md` SHALL include an installation section showing `npm install podman-client` and `bun add podman-client`.
3. THE `README.md` SHALL include a quick-start code example demonstrating `PodmanClient` construction, listing containers, and pulling an image.
4. THE `README.md` SHALL document the `PodmanClientOptions` fields (`baseUrl`, `connection`, `version`, `timeout`).
5. THE `README.md` SHALL include a section describing the two-layer architecture (`api/` vs `domain/`).
6. THE `README.md` SHALL include a section listing all exported domain managers and their primary methods.
