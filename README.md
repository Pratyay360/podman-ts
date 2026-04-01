# podman-ts

TypeScript bindings for the Podman RESTful API (libpod). This library provides a high-level, type-safe interface for managing containers, images, pods, networks, and more, using Podman's REST API.

## Installation

```bash
# npm
npm install podman-ts

# bun
bun add podman-ts
```

## Quick Start

```typescript
import { PodmanClient } from "podman-ts";

// Connect to the default local Podman socket
const client = new PodmanClient();

// List all containers
const containers = await client.containers.list({ all: true });
for (const container of containers) {
  console.log(`${container.id} - ${container.name} (${container.status})`);
}

// Pull an image
const image = await client.images.pull("docker.io/library/nginx:latest");
console.log(`Pulled: ${image.tags.join(", ")}`);

// Start a container
const container = await client.containers.create({
  image: "nginx",
  name: "my-nginx",
  portMappings: [{ container_port: 80, host_port: 8080 }],
});
await container.start();

// Get logs
const logs = await container.logs();
console.log(logs);

// Clean up
await container.stop();
await container.remove();
```

## PodmanClient Options

The `PodmanClient` can be configured with several options:

```typescript
const client = new PodmanClient({
  baseUrl: "http+unix:///run/user/1000/podman/podman.sock", // Direct URL
  connection: "my-remote-machine", // Named connection from containers.conf
  version: "5.0.0", // API version override
  timeout: 5000,    // Request timeout in ms
});
```

### Automatic Connection Discovery

By default, `PodmanClient` attempts to find the Podman service in the following order:
1. `baseUrl` if provided in options.
2. `connection` name if provided in options (searches `containers.conf` and `podman-connections.json`).
3. `CONTAINER_HOST` environment variable.
4. `DOCKER_HOST` environment variable.
5. Default local Unix socket path (e.g., `/run/podman/podman.sock` for root or `/run/user/ID/podman/podman.sock` for rootless).

You can also use the shorthand factory:
```typescript
import { fromEnv } from "podman-ts";
const client = fromEnv();
```

## Resource Managers

The client provides access to various managers for different resource types:

### Containers (`client.containers`)
- `list(options?)`: List containers.
- `get(id)`: Get a container instance.
- `create(opts)`: Create a new container.
- `run(image, command?, options?)`: Create and start a container, returning logs or the container instance.
- `exists(id)`: Check if a container exists.
- `prune(filters?)`: Delete stopped containers.

#### Container Instance Methods
- `start()`, `stop()`, `restart()`, `kill(signal?)`
- `pause()`, `unpause()`
- `remove(options?)`
- `inspect()`, `logs(options?)`, `top()`, `diff()`
- `wait(options?)`: Wait for container to reach a state.
- `rename(name)`
- `commit(options?)`: Create an image from the container.

### Images (`client.images`)
- `list(options?)`: List local images.
- `get(name)`: Get an image instance.
- `pull(repo, options?)`: Pull an image from a registry.
- `push(repo, options?)`: Push an image to a registry.
- `build(options)`: Build an image from a Dockerfile/context.
- `search(term, options?)`: Search for images on registries.
- `exists(name)`: Check if image exists locally.
- `prune(options?)`: Remove unused images.

#### Image Instance Methods
- `inspect()`, `history()`, `tag(repo, tag?)`, `remove()`

### Pods (`client.pods`)
- `list()`, `get(id)`, `create(opts)`, `exists(id)`, `remove(id)`, `prune()`
- Pod instance methods: `start()`, `stop()`, `restart()`, `pause()`, `unpause()`, `inspect()`

### Other Managers
- `client.networks`: Manage container networks.
- `client.volumes`: Manage persistent volumes.
- `client.secrets`: Manage Podman secrets.
- `client.manifests`: Manage manifest lists.
- `client.system`: System-level operations (`info()`, `df()`, `version()`, `ping()`, `login()`).
- `client.events`: historical `list()` and real-time `stream()` of Podman events.

## Advanced Usage

### Streaming Logs and Events

Many methods support streaming via `AsyncIterable`:

```typescript
// Stream container logs
const logStream = await container.logs({ stream: true, follow: true });
for await (const chunk of logStream) {
  process.stdout.write(chunk);
}

// Stream system events
for await (const event of client.events.stream()) {
  console.log(`${event.Status} ${event.Type} ${event.Action}`);
}
```

### Error Handling

The library provides specific error classes for better error handling:

```typescript
import { NotFound, ImageNotFound, APIError } from "podman-ts";

try {
  await client.images.get("non-existent-image");
} catch (err) {
  if (err instanceof ImageNotFound) {
    // Handle missing image
  } else if (err instanceof APIError) {
    console.error(`API Error ${err.statusCode}: ${err.message}`);
  }
}
```

### Docker Compatibility

For easier migration from `dockerode` or other Docker clients, an alias is provided:

```typescript
import { DockerClient } from "podman-ts";
const client = new DockerClient();
```

## License

Apache-2.0
