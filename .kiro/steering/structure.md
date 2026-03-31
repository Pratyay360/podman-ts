# Project Structure

```
podman/                        # Main package
  __init__.py                  # Exports PodmanClient, from_env, __version__
  client.py                    # PodmanClient — top-level user-facing client
  version.py                   # Package version
  tlsconfig.py                 # TLS configuration helper

  api/                         # Low-level HTTP transport layer
    client.py                  # APIClient (extends requests.Session)
    adapter_utils.py           # Shared adapter utilities
    ssh.py                     # SSHAdapter for http+ssh:// connections
    uds.py                     # UDSAdapter for http+unix:// connections
    http_utils.py              # HTTP helpers
    parse_utils.py             # Response parsing utilities
    path_utils.py              # Path/URL utilities
    output_utils.py            # Output formatting
    tar_utils.py               # Tar archive helpers
    api_versions.py            # API version constants

  domain/                      # High-level domain model layer
    manager.py                 # Abstract base classes: PodmanResource, Manager
    containers.py              # Container resource
    containers_manager.py      # ContainersManager
    containers_create.py       # CreateMixin for container creation
    containers_run.py          # RunMixin for container run
    images.py                  # Image resource
    images_manager.py          # ImagesManager
    images_build.py            # Build support
    networks.py                # Network resource
    networks_manager.py        # NetworksManager
    pods.py                    # Pod resource
    pods_manager.py            # PodsManager
    volumes.py                 # Volume resource
    secrets.py                 # SecretsManager
    manifests.py               # ManifestsManager
    quadlets.py                # Quadlet resource
    events.py                  # EventsManager
    system.py                  # SystemManager
    config.py                  # PodmanConfig (reads containers.conf)
    ipam.py                    # IPAM helpers
    json_stream.py             # JSON streaming support
    registry_data.py           # Registry data model

  errors/
    exceptions.py              # APIError, NotFound, PodmanError, etc.

  tests/
    unit/                      # Unit tests (mocked HTTP via requests-mock)
    integration/               # Integration tests (require live Podman service)
    conftest.py                # pytest fixtures and custom markers (--pnext)
    utils.py                   # Shared test utilities, PODMAN_VERSION, OS_RELEASE

contrib/examples/              # Usage examples
docs/                          # Sphinx documentation source
rpm/                           # RPM spec for packaging
plans/ / tests/                # FMF test plans (for CI gating)
```

## Architecture Patterns

- Two-layer design: `api/` handles raw HTTP, `domain/` provides the resource model.
- `APIClient` (in `api/client.py`) extends `requests.Session` and routes all calls through `_request()`, which builds URLs from a `path_prefix` (`/v{version}/libpod/`) or `compatible_prefix` for Docker-compat endpoints.
- Each domain resource (e.g. `Container`, `Image`) extends `PodmanResource`. Each manager (e.g. `ContainersManager`) extends `Manager` and must implement `get()`, `list()`, and `exists()`.
- Managers are exposed as `cached_property` attributes on `PodmanClient` (e.g. `client.containers`, `client.images`).
- Docker SDK compatibility is maintained via aliases (`DockerClient = PodmanClient`) and a `compatible=True` kwarg that switches URL prefixes.

## Coding Conventions

- Docstrings: Google style, with a "Keyword Arguments" section for `**kwargs`.
- Type hints required; use `collections.abc` types (not `typing`) for Python 3.9+ compatibility.
- Spaces, not tabs. Line length: 100.
- All new code must pass `ruff check` and `ruff format`.
- Unit tests use `unittest.TestCase` + `requests_mock.Mocker`. Integration tests live in `tests/integration/`.
- Version-specific test skips use `@pytest.mark.skipif` with `PODMAN_VERSION` / `OS_RELEASE` from `podman/tests/utils.py`.
- Tests for unreleased podman features use `@pytest.mark.pnext`.
