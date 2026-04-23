# podman-ts

TypeScript/Bun bindings for the Podman RESTful API (libpod). This library provides a high-level, type-safe interface for managing containers, images, pods, networks, volumes, secrets, manifests, quadlets, and more.

> **Runtime:** The library uses Bun-native APIs (`Bun.spawn`, `Bun.file`, Unix-socket `fetch`). Install and run with [Bun](https://bun.sh) (`bun >=1.0`). `package.json` also declares Node `>= 18` for tooling compatibility; execution is intended under Bun.

## Installation

```bash
npm install @pratyay360/podman-ts
# or
bun add @pratyay360/podman-ts
```

## Quick start

```typescript
import { PodmanClient } from "@pratyay360/podman-ts";

const client = new PodmanClient();

const containers = await client.containers.list({ all: true });
for (const container of containers) {
  console.log(`${container.id} - ${container.name} (${container.status})`);
}

const image = await client.images.pull("docker.io/library/nginx:latest");
console.log(`Pulled: ${image.tags.join(", ")}`);

const container = await client.containers.create({
  image: "nginx",
  name: "my-nginx",
  portMappings: [{ container_port: 80, host_port: 8080 }],
});
await container.start();

const logs = await container.logs();
console.log(logs);

await container.stop();
await container.remove();
```

## `PodmanClient` options

```typescript
const client = new PodmanClient({
  baseUrl: "http+unix:///run/user/1000/podman/podman.sock",
  connection: "my-remote-machine",
  version: "5.0.0",
  timeout: 5000,
});
```

| Option       | Description                                                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`    | Full service URL (`http+unix://…`, `http://…`, `tcp://…` mapped to HTTP). `ssh://` / `http+ssh://` are not supported directly; use a tunnel and connect via `tcp://` or a Unix socket. |
| `connection` | Named service from `containers.conf` / Podman connection config (via `PodmanConfig`).                                                                                                  |
| `version`    | API version segment for paths. Default: `v5.0.0` (see `APIClient` in `src/api/client.ts`).                                                                                             |
| `timeout`    | Request timeout in milliseconds.                                                                                                                                                       |

The client exposes **`client.api`** (`APIClient`) for arbitrary libpod/compat requests. Convenience getters return promises: **`client.ping`**, **`client.version`**, **`client.info`**, **`client.df`**. Call **`client.close()`** (or use `using` / `Symbol.dispose`) when you want a disposal hook; today it is a no-op.

### Default connection (no `baseUrl`)

If **`baseUrl`** is omitted:

1. If **`connection`** is set, that named service URL is used.
2. Otherwise, **`PodmanConfig`** is read: if the **active service** is a Podman **machine**, its URL is used.
3. Otherwise the **local Unix socket** is used (`/run/podman/podman.sock` as root, or `$XDG_RUNTIME_DIR/podman/podman.sock` for rootless).

Environment variables **`CONTAINER_HOST`** and **`DOCKER_HOST`** are **not** read by `new PodmanClient()`.

### Environment-based URL

Use the factory so **`CONTAINER_HOST`** or **`DOCKER_HOST`** wins over the default socket:

```typescript
import { fromEnv, PodmanClient } from "@pratyay360/podman-ts";

const client = fromEnv();
// same as:
const same = PodmanClient.fromEnv();
```

## API coverage

Podman’s HTTP surface is large (see the project’s `swagger-latest.yaml` for the full spec). **This package implements a curated subset** focused on common container workflows. For operations that are not wrapped yet, use **`client.api`** (`get`, `post`, `put`, `patch`, `delete`, `head`) with libpod paths (default prefix `/v{version}/libpod`) or **`compatible: true`** for `/v{version}/compat` (e.g. registry **`/auth`** for `system.login`).

## Resource managers

### Containers — `client.containers`

| Method                           | Description                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `list(options?)`                 | List containers (`all`, `limit`, `filters`, `since`, `before`).                                               |
| `get(id, options?)`              | Load a container; optional `{ compatible?: boolean }`.                                                        |
| `create(opts)`                   | Create a container; returns a **`Container`** instance.                                                       |
| `run(image, command?, options?)` | Create, start, wait (unless `detach`), optionally return logs or throw **`ContainerError`** on non-zero exit. |
| `exists(id)`                     | Whether the container exists.                                                                                 |
| `remove(id, options?)`           | Remove by id (`force`, `volumes`).                                                                            |
| `prune(filters?)`                | Remove stopped containers.                                                                                    |

**`Container` instance:** `start`, `stop`, `restart`, `kill`, `pause`, `unpause`, `wait`, `remove`, `rename`, `inspect` (GET json), `logs` (string or `AsyncIterable` when `stream: true`), `top`, `diff`, `commit`, `reload`.

### Images — `client.images`

| Method                       | Description                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `list(options?)`             | List images (`name` maps to `reference` filter, `all`, `filters`).                                |
| `get(name)`                  | Inspect by name/id.                                                                               |
| `pull(repository, options?)` | Pull (`tag`, `allTags`, `quiet`, `tlsVerify`).                                                    |
| `push(repository, options?)` | Push (`tag`, `tlsVerify`).                                                                        |
| `build(options)`             | POST tarball context to `/build`; requires `path` to context dir; uses `tar` via **`Bun.spawn`**. |
| `search(term, options?)`     | Search registries.                                                                                |
| `exists(name)`               | Whether the image exists.                                                                         |
| `remove(name, options?)`     | Remove by reference.                                                                              |
| `prune(options?)`            | Prune unused images.                                                                              |

**`Image` instance:** `history`, `tag`, `remove`, `reload`. Use **`get()`** / **`reload()`** for fresh inspect data (there is no separate `inspect()` on the instance).

### Pods — `client.pods`

| Method                   | Description                                |
| ------------------------ | ------------------------------------------ |
| `create(name, options?)` | Create pod (`name` plus JSON body fields). |
| `list(options?)`         | List pods (`filters`).                     |
| `get(id)`                | Inspect pod.                               |
| `exists(id)`             | Whether the pod exists.                    |
| `remove(id, options?)`   | Remove (`force`).                          |
| `prune(filters?)`        | Prune pods.                                |
| `stats(options?)`        | Pod stats (`all`).                         |

**`Pod` instance:** `start`, `stop`, `restart`, `kill`, `pause`, `unpause`, `remove`, `top`, `reload`. There is no `inspect()` method; use **`reload()`** or **`pods.get()`**.

### Networks — `client.networks`

| Method                   | Description                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `create(name, options?)` | Create (`driver`, `dnsEnabled`, `networkDnsServers`, `enableIpv6`, `internal`, `labels`, `options`). |
| `list(options?)`         | List (`filters`).                                                                                    |
| `get(key)`               | Inspect.                                                                                             |
| `exists(key)`            | Whether the network exists.                                                                          |
| `remove(name, options?)` | Delete (`force`).                                                                                    |
| `prune(filters?)`        | Prune.                                                                                               |

**`Network` instance:** `connect`, `disconnect`, `remove`, `reload`.

### Volumes — `client.volumes`

| Method                    | Description                                |
| ------------------------- | ------------------------------------------ |
| `create(name?, options?)` | Create (`driver`, `driverOpts`, `labels`). |
| `list(options?)`          | List (`filters`).                          |
| `get(volumeId)`           | Load model from inspect.                   |
| `exists(key)`             | Whether the volume exists.                 |
| `remove(name, options?)`  | Remove (`force`).                          |
| `prune(filters?)`         | Prune.                                     |

**`Volume` instance:** `inspect`, `remove`, `reload`.

### Secrets — `client.secrets`

| Method                         | Description                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `create(name, data, options?)` | Create (`labels`, `driver`); `data` is string or `Buffer` (sent base64 for binary). |
| `list(options?)`               | List (`filters`).                                                                   |
| `get(secretId)`                | Inspect.                                                                            |
| `exists(key)`                  | Whether the secret exists (GET json).                                               |
| `remove(secretId, options?)`   | Delete (`all`).                                                                     |

**`Secret` instance:** `remove`.

### Manifests — `client.manifests`

| Method                        | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| `create(name, images?, all?)` | Create manifest list.                                         |
| `get(key)`                    | Inspect.                                                      |
| `exists(key)`                 | Whether the manifest exists.                                  |
| `list()`                      | **Throws** — the service does not expose list in this client. |
| `removeManifest(name)`        | Delete manifest by name.                                      |

**`Manifest` instance:** `add`, `push`, `remove` (by digest), `reload`.

### Quadlets — `client.quadlets`

| Method                     | Description                                                         |
| -------------------------- | ------------------------------------------------------------------- |
| `list(options?)`           | List quadlets (`filters`).                                          |
| `get(name)`                | Resolve by filtering list.                                          |
| `install(files, options?)` | POST tarball or `FormData` (`replace`, `reloadSystemd`).            |
| `getContents(name)`        | Raw unit file contents.                                             |
| `delete(name?, options?)`  | Delete one or **`all: true`** (`force`, `ignore`, `reloadSystemd`). |
| `exists(name)`             | Whether the quadlet exists.                                         |

**`Quadlet` instance:** `getContents`, `delete`.

### System — `client.system`

| Method                      | Description                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `ping()`                    | `HEAD /_ping`.                                                                               |
| `info()`                    | GET `/info`.                                                                                 |
| `version(options?)`         | GET `/version`; can strip `APIVersion` when `apiVersion: false`.                             |
| `df()`                      | Disk usage summary.                                                                          |
| `login(username, options?)` | POST **`/auth`** with **`compatible: true`** (`password`, `email`, `registry`, `tlsVerify`). |

### Events — `client.events`

| Method           | Description                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `list(options?)` | Async generator over `/events` with `stream: true`. Yields lines as strings, or parsed objects if `decode: true` (`since`, `until`, `filters`). |

There is no separate **`stream()`** method; use **`for await … of client.events.list()`**.

## Advanced usage

### Streaming logs

```typescript
const logStream = await container.logs({ stream: true, follow: true });
for await (const chunk of logStream) {
  process.stdout.write(chunk + "\n");
}
```

### Streaming events

```typescript
for await (const line of client.events.list({ decode: true })) {
  const event = line as Record<string, unknown>;
  console.log(event);
}
```

### Error handling

```typescript
import { NotFound, ImageNotFound, APIError } from "@pratyay360/podman-ts";

try {
  await client.images.get("non-existent-image");
} catch (err) {
  if (err instanceof ImageNotFound) {
    // missing image
  } else if (err instanceof APIError) {
    console.error(`${err.statusCode}: ${err.message}`);
  }
}
```

Exported error classes include **`PodmanError`**, **`APIError`**, **`NotFound`**, **`ImageNotFound`**, **`BuildError`**, **`ContainerError`**, **`InvalidArgument`**, **`StreamParseError`**.

### Docker-compatible alias

```typescript
import { DockerClient } from "@pratyay360/podman-ts";
const client = new DockerClient();
```

### Extra exports

For custom tooling you can import **`APIClient`**, **`APIResponse`**, helpers (**`prepareFilters`**, **`prepareBody`**, **`encodeAuthHeader`**, …), **`PodmanConfig`**, **`IPAMConfig` / `IPAMPool`**, **`jsonStream` / `lineStream`**, base **`Manager` / `PodmanResource`**, and version constants (**`VERSION`**, **`API_VERSION`**, **`COMPATIBLE_VERSION`**) from the package entry (`src/index.ts`).

## Development

```bash
bun install
bun run lint
bun run typecheck
bun test
bun run build
```

## Release automation


## License

Apache-2.0
