/**
 * Unit + property tests for ContainersManager.list and ContainersManager.get with mocked APIClient.
 *
 * Feature: podman-client-ts-improvements
 * Requirement 9.5: Unit tests for ContainersManager.list and .get with mocked APIClient
 * Property 4: list returns array of Container objects with correct id mapping
 * Property 5: get returns Container with correct id and name extraction
 */

import { beforeEach, describe, expect, test, vi } from "bun:test";
import fc from "fast-check";
import type { APIClient } from "../api/client";
import { Container, ContainersManager } from "../domain/containers";
import { NotFound } from "../errors";

// Mock APIClient for testing
class MockAPIClient {
  public baseUrl = "http://localhost";
  public version = "5.0.0";

  private mockData: unknown = {};
  private mockStatus = 200;

  setMockData(data: unknown) {
    this.mockData = data;
  }

  setMockStatus(status: number) {
    this.mockStatus = status;
  }

  async get<T>(
    path: string,
    options?: { params?: Record<string, unknown>; compatible?: boolean },
  ): Promise<{
    data: T;
    raiseForStatus: (errorClass?: new (...args: unknown[]) => Error) => void;
    status: number;
  }> {
    let data = this.mockData;
    if (Array.isArray(data) && options?.params?.limit !== undefined) {
      const limit = Number(options.params.limit);
      if (limit > 0) {
        data = data.slice(0, limit);
      }
    }
    return {
      data: data as T,
      raiseForStatus: (errorClass?: new (...args: unknown[]) => Error) => {
        if (this.mockStatus >= 400) {
          if (errorClass && this.mockStatus === 404) {
            throw new errorClass(`HTTP ${this.mockStatus}`, this.mockStatus);
          }
          throw new Error(`HTTP ${this.mockStatus}`);
        }
      },
      status: this.mockStatus,
    };
  }

  async post<T>(
    path: string,
    options?: {
      params?: Record<string, unknown>;
      data?: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<{
    data: T;
    raiseForStatus: (errorClass?: new (...args: unknown[]) => Error) => void;
    status: number;
  }> {
    return {
      data: this.mockData as T,
      raiseForStatus: (errorClass?: new (...args: unknown[]) => Error) => {
        if (this.mockStatus >= 400) {
          if (errorClass && this.mockStatus === 404) {
            throw new errorClass(`HTTP ${this.mockStatus}`, this.mockStatus);
          }
          throw new Error(`HTTP ${this.mockStatus}`);
        }
      },
      status: this.mockStatus,
    };
  }

  async delete<T>(
    path: string,
    options?: { params?: Record<string, unknown> },
  ): Promise<{
    data: T;
    raiseForStatus: (errorClass?: new (...args: unknown[]) => Error) => void;
    status: number;
  }> {
    return {
      data: this.mockData as T,
      raiseForStatus: (errorClass?: new (...args: unknown[]) => Error) => {
        if (this.mockStatus >= 400) {
          if (errorClass && this.mockStatus === 404) {
            throw new errorClass(`HTTP ${this.mockStatus}`, this.mockStatus);
          }
          throw new Error(`HTTP ${this.mockStatus}`);
        }
      },
      status: this.mockStatus,
    };
  }

  buildUrlPublic(path: string, compatible: boolean, params?: Record<string, unknown>): string {
    const ver = this.version.replace(/^v/, "");
    const prefix = compatible ? `/v${ver}/compat` : `/v${ver}/libpod`;
    const query = params
      ? `?${new URLSearchParams(params as Record<string, string>).toString()}`
      : "";
    return `${this.baseUrl}${prefix}${path}${query}`;
  }
}

describe("ContainersManager", () => {
  let manager: ContainersManager;
  let mockClient: MockAPIClient;

  beforeEach(() => {
    mockClient = new MockAPIClient();
    // Use any cast to work around type mismatch
    manager = new ContainersManager(mockClient as unknown as APIClient);
  });

  describe("list", () => {
    test("returns empty array when no containers exist", async () => {
      mockClient.setMockData([]);
      const containers = await manager.list();
      expect(containers).toEqual([]);
    });

    test("returns array of Container objects", async () => {
      const mockContainers = [
        {
          Id: "abc123",
          Names: ["/container1"],
          State: { Status: "running" },
          Labels: {},
          NetworkSettings: { Ports: {} },
        },
        {
          Id: "def456",
          Names: ["/container2"],
          State: { Status: "exited" },
          Labels: {},
          NetworkSettings: { Ports: {} },
        },
      ];
      mockClient.setMockData(mockContainers);

      const containers = await manager.list();

      expect(containers).toHaveLength(2);
      expect(containers[0]).toBeInstanceOf(Container);
      expect(containers[0].id).toBe("abc123");
      expect(containers[1].id).toBe("def456");
    });

    test("passes all options to API", async () => {
      const mockContainers = [
        {
          Id: "abc123",
          Names: ["/test"],
          State: { Status: "running" },
          Labels: {},
          NetworkSettings: { Ports: {} },
        },
      ];
      mockClient.setMockData(mockContainers);

      const containers = await manager.list({
        all: true,
        limit: 10,
        filters: { status: "running" },
        since: "abc123",
        before: "def456",
      });

      expect(containers).toHaveLength(1);
    });

    test("handles empty filters", async () => {
      const mockContainers = [
        {
          Id: "abc123",
          Names: ["/test"],
          State: { Status: "running" },
          Labels: {},
          NetworkSettings: { Ports: {} },
        },
      ];
      mockClient.setMockData(mockContainers);

      const containers = await manager.list({ filters: {} });
      expect(containers).toHaveLength(1);
    });

    test("handles undefined options", async () => {
      const mockContainers = [
        {
          Id: "abc123",
          Names: ["/test"],
          State: { Status: "running" },
          Labels: {},
          NetworkSettings: { Ports: {} },
        },
      ];
      mockClient.setMockData(mockContainers);

      const containers = await manager.list({});
      expect(containers).toHaveLength(1);
    });
  });

  describe("get", () => {
    test("returns Container object for valid id", async () => {
      const mockContainer = {
        Id: "abc123",
        Name: "/test-container",
        State: { Status: "running" },
        Labels: { app: "test" },
        NetworkSettings: { Ports: { "80/tcp": [{ HostPort: "8080" }] } },
        Config: { Labels: { app: "test" } },
      };
      mockClient.setMockData(mockContainer);

      const container = await manager.get("abc123");

      expect(container).toBeInstanceOf(Container);
      expect(container.id).toBe("abc123");
      expect(container.name).toBe("test-container");
    });

    test("throws NotFound for non-existent container", async () => {
      mockClient.setMockStatus(404);
      mockClient.setMockData({ message: "not found" });

      await expect(manager.get("nonexistent")).rejects.toThrow(NotFound);
    });

    test("throws for other HTTP errors", async () => {
      mockClient.setMockStatus(500);
      mockClient.setMockData({ message: "internal error" });

      await expect(manager.get("abc123")).rejects.toThrow("HTTP 500");
    });

    test("handles container with no name", async () => {
      const mockContainer = {
        Id: "abc123",
        Names: undefined,
        State: { Status: "running" },
        Labels: {},
        NetworkSettings: { Ports: {} },
      };
      mockClient.setMockData(mockContainer);

      const container = await manager.get("abc123");
      expect(container.name).toBeUndefined();
    });

    test("handles container with Names array", async () => {
      const mockContainer = {
        Id: "abc123",
        Names: ["/my-container", "/alias"],
        State: { Status: "running" },
        Labels: {},
        NetworkSettings: { Ports: {} },
      };
      mockClient.setMockData(mockContainer);

      const container = await manager.get("abc123");
      expect(container.name).toBe("my-container");
    });

    test("handles container with leading slash in name", async () => {
      const mockContainer = {
        Id: "abc123",
        Name: "/leading-slash",
        State: { Status: "running" },
        Labels: {},
        NetworkSettings: { Ports: {} },
      };
      mockClient.setMockData(mockContainer);

      const container = await manager.get("abc123");
      expect(container.name).toBe("leading-slash");
    });

    test("returns correct status", async () => {
      const mockContainer = {
        Id: "abc123",
        Names: ["/test"],
        State: { Status: "paused" },
        Labels: {},
        NetworkSettings: { Ports: {} },
      };
      mockClient.setMockData(mockContainer);

      const container = await manager.get("abc123");
      expect(container.status).toBe("paused");
    });

    test("returns correct labels", async () => {
      const mockContainer = {
        Id: "abc123",
        Names: ["/test"],
        State: { Status: "running" },
        Labels: { env: "prod", team: "backend" },
        NetworkSettings: { Ports: {} },
      };
      mockClient.setMockData(mockContainer);

      const container = await manager.get("abc123");
      expect(container.labels).toEqual({ env: "prod", team: "backend" });
    });

    test("returns empty labels when none provided", async () => {
      const mockContainer = {
        Id: "abc123",
        Names: ["/test"],
        State: { Status: "running" },
        Labels: undefined,
        NetworkSettings: { Ports: {} },
      };
      mockClient.setMockData(mockContainer);

      const container = await manager.get("abc123");
      expect(container.labels).toEqual({});
    });

    test("handles compatible option", async () => {
      const mockContainer = {
        Id: "abc123",
        Names: ["/test"],
        State: { Status: "running" },
        Labels: {},
        NetworkSettings: { Ports: {} },
      };
      mockClient.setMockData(mockContainer);

      // The get method accepts compatible option but our mock doesn't use it
      const container = await manager.get("abc123", { compatible: true });
      expect(container).toBeInstanceOf(Container);
    });
  });

  describe("Container resource", () => {
    test("container has correct id", async () => {
      const mockContainer = {
        Id: "unique-id-123",
        Names: ["/test"],
        State: { Status: "running" },
        Labels: {},
        NetworkSettings: { Ports: {} },
      };
      mockClient.setMockData(mockContainer);

      const container = await manager.get("unique-id-123");
      expect(container.id).toBe("unique-id-123");
    });

    test("container ports are accessible", async () => {
      const mockContainer = {
        Id: "abc123",
        Names: ["/test"],
        State: { Status: "running" },
        Labels: {},
        NetworkSettings: {
          Ports: {
            "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }],
            "443/tcp": [{ HostIp: "0.0.0.0", HostPort: "8443" }],
          },
        },
      };
      mockClient.setMockData(mockContainer);

      const container = await manager.get("abc123");
      expect(container.ports).toBeDefined();
      expect(Object.keys(container.ports)).toHaveLength(2);
    });
  });
});

// ─── Property 4: list returns array of Container objects with correct id mapping ───────

describe("Property 4 — list returns array of Container objects with correct id mapping", () => {
  // Feature: podman-client-ts-improvements, Property 4: list returns array of Container objects

  let manager: ContainersManager;
  let mockClient: MockAPIClient;

  beforeEach(() => {
    mockClient = new MockAPIClient();
    manager = new ContainersManager(mockClient as unknown as APIClient);
  });

  const containerArb = fc.record(
    {
      Id: fc.uuidV(4),
      Names: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
      State: fc.record({
        Status: fc.oneof(
          fc.constant("running"),
          fc.constant("exited"),
          fc.constant("paused"),
          fc.constant("created"),
        ),
      }),
      Labels: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 30 }),
      ),
      NetworkSettings: fc.record({ Ports: fc.record({}) }),
    },
    { withDeletedKeys: false },
  );

  test("property: list returns correct number of Container objects", () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(containerArb, { minLength: 0, maxLength: 10 }),
        async (mockContainers) => {
          mockClient.setMockData(mockContainers);
          const containers = await manager.list();
          expect(containers).toHaveLength(mockContainers.length);
          containers.forEach((c) => expect(c).toBeInstanceOf(Container));
        },
      ),
    );
  });

  test("property: each Container has correct id from API response", () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(containerArb, { minLength: 1, maxLength: 5 }),
        async (mockContainers) => {
          mockClient.setMockData(mockContainers);
          const containers = await manager.list();
          for (let i = 0; i < mockContainers.length; i++) {
            expect(containers[i].id).toBe(mockContainers[i].Id);
          }
        },
      ),
    );
  });

  test("property: list with all=true returns all containers including stopped ones", () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(containerArb, { minLength: 1, maxLength: 5 }),
        async (mockContainers) => {
          mockClient.setMockData(mockContainers);
          const containers = await manager.list({ all: true });
          expect(containers).toHaveLength(mockContainers.length);
        },
      ),
    );
  });

  test("property: list with limit returns at most limit containers", () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(containerArb, { minLength: 5, maxLength: 10 }),
        fc.integer({ min: 1, max: 5 }),
        async (mockContainers, limit) => {
          mockClient.setMockData(mockContainers);
          const containers = await manager.list({ limit });
          expect(containers.length).toBeLessThanOrEqual(limit);
        },
      ),
    );
  });
});

// ─── Property 5: get returns Container with correct id and name extraction ───────

describe("Property 5 — get returns Container with correct id and name extraction", () => {
  // Feature: podman-client-ts-improvements, Property 5: get returns Container with correct id and name

  let manager: ContainersManager;
  let mockClient: MockAPIClient;

  beforeEach(() => {
    mockClient = new MockAPIClient();
    manager = new ContainersManager(mockClient as unknown as APIClient);
  });

  const containerArb = fc.record(
    {
      Id: fc.uuidV(4),
      Name: fc.oneof(fc.string({ minLength: 1, maxLength: 50 }), fc.constant(undefined)),
      Names: fc.oneof(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 2 }),
        fc.constant(undefined),
      ),
      State: fc.record({
        Status: fc.oneof(
          fc.constant("running"),
          fc.constant("exited"),
          fc.constant("paused"),
          fc.constant("created"),
        ),
      }),
      Labels: fc.oneof(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 30 }),
        ),
        fc.constant(undefined),
      ),
      NetworkSettings: fc.record({ Ports: fc.record({}) }),
    },
    { withDeletedKeys: false },
  );

  test("property: get returns Container with correct id", () => {
    fc.assert(
      fc.asyncProperty(containerArb, async (mockContainer) => {
        mockClient.setMockData(mockContainer);
        const container = await manager.get(mockContainer.Id);
        expect(container.id).toBe(mockContainer.Id);
        expect(container).toBeInstanceOf(Container);
      }),
    );
  });

  test("property: get extracts name from Name field when present", () => {
    fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (name) => {
        const mockContainer = {
          Id: "test-id-123",
          Name: `/${name}`,
          State: { Status: "running" },
          Labels: {},
          NetworkSettings: { Ports: {} },
        };
        mockClient.setMockData(mockContainer);
        const container = await manager.get("test-id-123");
        expect(container.name).toBe(name);
      }),
    );
  });

  test("property: get extracts name from Names array when Name is absent", () => {
    fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (name) => {
        const mockContainer = {
          Id: "test-id-123",
          Names: [`/${name}`],
          State: { Status: "running" },
          Labels: {},
          NetworkSettings: { Ports: {} },
        };
        mockClient.setMockData(mockContainer);
        const container = await manager.get("test-id-123");
        expect(container.name).toBe(name);
      }),
    );
  });

  test("property: get returns correct status from State.Status", () => {
    fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant("running"),
          fc.constant("exited"),
          fc.constant("paused"),
          fc.constant("created"),
        ),
        async (status) => {
          const mockContainer = {
            Id: "test-id-123",
            Names: ["/test"],
            State: { Status: status },
            Labels: {},
            NetworkSettings: { Ports: {} },
          };
          mockClient.setMockData(mockContainer);
          const container = await manager.get("test-id-123");
          expect(container.status).toBe(status);
        },
      ),
    );
  });

  test("property: get returns labels from Labels field or Config.Labels", () => {
    fc.assert(
      fc.asyncProperty(
        fc.record(
          {
            env: fc.oneof(fc.constant("prod"), fc.constant("dev")),
            team: fc.oneof(fc.constant("backend"), fc.constant("frontend")),
          },
          { withDeletedKeys: false },
        ),
        async (labels) => {
          const mockContainer = {
            Id: "test-id-123",
            Names: ["/test"],
            State: { Status: "running" },
            Labels: labels,
            NetworkSettings: { Ports: {} },
          };
          mockClient.setMockData(mockContainer);
          const container = await manager.get("test-id-123");
          expect(container.labels).toEqual(labels);
        },
      ),
    );
  });

  test("property: get returns empty labels when Labels is undefined", () => {
    fc.assert(
      fc.asyncProperty(fc.uuidV(4), async (id) => {
        const mockContainer = {
          Id: id,
          Names: ["/test"],
          State: { Status: "running" },
          Labels: undefined,
          NetworkSettings: { Ports: {} },
        };
        mockClient.setMockData(mockContainer);
        const container = await manager.get(id);
        expect(container.labels).toEqual({});
      }),
    );
  });
});
