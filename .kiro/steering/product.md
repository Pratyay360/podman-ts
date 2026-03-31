# podman-py

podman-py is a Python library of bindings for the [Podman](https://github.com/containers/podman) RESTful API (libpod). It provides a high-level, Docker SDK-compatible interface for managing containers, images, networks, volumes, pods, secrets, manifests, and quadlets via the Podman service.

The primary entry point is `PodmanClient`, which connects to a Podman service over a Unix domain socket, SSH, or TCP. The library is intentionally designed to be a drop-in replacement for the Docker SDK for Python (`docker` package), with `DockerClient` and `from_env` aliases provided for compatibility.

Target audience: Python developers who want to programmatically manage Podman resources.
