# Tasks: podman-client-ts Improvements

## Task List

- [x] 1. Fix build tooling and package metadata
  - [x] 1.1 Add `tsup` and `@biomejs/biome` to `devDependencies`, add `smol-toml` to `dependencies` in `podman-client-ts/package.json`
  - [x] 1.2 Replace the `build` script with `tsup src/index.ts --format esm,cjs --dts --target es2022 --out-dir dist`
  - [x] 1.3 Add `exports`, `files`, and `engines` fields to `package.json`
  - [x] 1.4 Add `lint` and `format` scripts to `package.json`
  - [x] 1.5 Update `tsconfig.json`: set `moduleResolution` to `"node16"`, `target` to `"ES2022"`, remove `"bun-types"` from `types`

- [x] 2. Fix `APIClient.buildUrl` URL construction bug
  - [x] 2.1 Strip any leading `v` from `this.version` before constructing the prefix
  - [x] 2.2 Change libpod prefix from `"/libpod"` to `` `/v${ver}/libpod` ``
  - [x] 2.3 Change compat prefix from `` `/v${this.version}/compat` `` to use the stripped `ver` variable consistently

- [x] 3. Add `patch<T>()` method to `APIClient`
  - [x] 3.1 Add `patch<T>` method with the same signature as `put<T>` in `src/api/client.ts`

- [x] 4. Add retry logic to `APIClient`
  - [x] 4.1 Add `retries?: number` (default `0`) to `APIClientOptions`
  - [x] 4.2 Extract a `fetchWithRetry` private method that wraps `fetch` in a loop
  - [x] 4.3 Implement exponential backoff: 100 ms base, doubles per attempt, capped at 2000 ms
  - [x] 4.4 Only catch network-level errors (thrown `Error` before a `Response` is received); let HTTP 4xx/5xx pass through immediately
  - [x] 4.5 After exhausting retries, throw `PodmanError` with attempt count in the message

- [x] 5. Replace `Bun.TOML` with `smol-toml` in `PodmanConfig`
  - [x] 5.1 Add `import { parse as parseToml } from "smol-toml"` to `src/domain/config.ts`
  - [x] 5.2 Replace `Bun.TOML.parse(...)` with `parseToml(...)`
  - [x] 5.3 Wrap the TOML parse call in try/catch; on failure emit `console.warn` and continue

- [x] 6. Fix type-safe mixin pattern
  - [x] 6.1 Remove `declare create` and `declare run` from `ContainersManager`; add concrete `create()` and `run()` methods that delegate to the logic in `containers_create.ts` and `containers_run.ts`
  - [x] 6.2 Remove `build!:` field from `ImagesManager`; add a concrete `build()` method that delegates to the logic in `images_build.ts`
  - [x] 6.3 Remove the `Object.assign(ContainersManager.prototype, ...)` and `Object.assign(ImagesManager.prototype, ...)` calls
  - [x] 6.4 Run `tsc --noEmit` and confirm zero type errors related to mixin declarations

- [x] 7. Add streaming support to `Container.logs`
  - [x] 7.1 Define `LogOptions` interface with `stream`, `stdout`, `stderr`, `follow`, `since`, `until`, `tail` fields
  - [x] 7.2 Add TypeScript overloads: `logs(opts: LogOptions & { stream: true }): Promise<AsyncIterable<string>>` and `logs(opts?: LogOptions): Promise<string>`
  - [x] 7.3 Implement `_streamLogs` private async generator that reads the response body as a stream and yields lines
  - [x] 7.4 Throw `APIError` with the response status code if the streaming response is not ok

- [x] 8. Create `biome.json` linter/formatter config
  - [x] 8.1 Create `podman-client-ts/biome.json` with 2-space indent, double quotes, line width 100, and `recommended` rules enabled

- [-] 9. Write the test suite
  - [x] 9.1 Create `podman-client-ts/src/__tests__/url-construction.test.ts` — unit + property tests for `buildUrl` (libpod/compat, version with/without `v` prefix, default version)
  - [x] 9.2 Create `podman-client-ts/src/__tests__/prepare-filters.test.ts` — unit + property tests for `prepareFilters` (empty, single-value, multi-value, array-of-string)
  - [x] 9.3 Create `podman-client-ts/src/__tests__/podman-config.test.ts` — unit + property tests for `PodmanConfig` (JSON parsing, TOML parsing, graceful TOML failure)
  - [x] 9.4 Create `podman-client-ts/src/__tests__/demux-output.test.ts` — unit + property tests for `demuxOutput` (stdout-only, stderr-only, interleaved)
  - [~] 9.5 Create `podman-client-ts/src/__tests__/containers-manager.test.ts` — unit tests for `ContainersManager.list` and `.get` with mocked `APIClient`
  - [~] 9.6 Create `podman-client-ts/src/__tests__/images-manager.test.ts` — unit tests for `ImagesManager.list` and `.get` with mocked `APIClient`
  - [x] 9.7 Add `fast-check` to `devDependencies` and use it for property-based tests in the files above
  - [~] 9.8 Verify `bun test` runs all tests with zero failures

- [ ] 10. Write `README.md`
  - [~] 10.1 Create `podman-client-ts/README.md` with installation, quick-start, `PodmanClientOptions` docs, architecture overview, and manager listing
