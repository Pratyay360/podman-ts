# Tech Stack

## Language & Runtime
- Python >= 3.9
- Supports CPython 3.9, 3.10, 3.11, 3.12, 3.13

## Core Dependencies
- `requests >= 2.24` — HTTP client for API calls
- `urllib3` — underlying transport
- `tomli >= 1.2.3` — TOML parsing (Python < 3.11 only)
- `rich >= 12.5.1` — optional progress bar support

## Build System
- `setuptools` with `pyproject.toml` + `setup.cfg`
- Version sourced dynamically from `podman/version.py`

## Testing
- `pytest` — test runner
- `requests-mock` — HTTP mocking for unit tests
- `coverage` — code coverage (minimum 85% required, enforced at 80% in CI)
- `tox` — test environment management

## Linting & Formatting
- `ruff` — linting and formatting (replaces black + flake8 + pylint)
  - Line length: 100
  - Quote style: preserve
- `mypy` — static type checking
- `pre-commit` — git hook integration

## Common Commands

```bash
# Run unit tests with coverage report
tox -e coverage

# Run all tests (default env)
tox

# Run a specific test file or test case
tox -e py -- podman/tests/unit/test_container.py
tox -e py -- podman/tests/integration/test_containers.py -k test_name

# Run against a specific Python version
tox -e py312 -- podman/tests/unit/test_container.py

# Lint (check only, no changes)
tox -e lint
# or: ruff check --diff

# Format (check only, no changes)
tox -e format
# or: ruff format --diff

# Type checking
tox -e mypy

# Run pre-commit checks on all files
pre-commit run -a

# Use a custom podman binary for tests
PODMAN_BINARY=/path/to/podman tox -e py -- ...

# Run tests marked for upcoming podman features
tox -e py -- --pnext -m pnext ...
```

## Environment Variables
- `PODMAN_LOG_LEVEL` — log level for tests (default: `INFO`)
- `PODMAN_BINARY` — path to podman binary used in integration tests (default: `podman`)
- `DEBUG` — debug flag (default: `0`)
- `CONTAINER_HOST` / `DOCKER_HOST` — Podman service URL for `from_env()`
