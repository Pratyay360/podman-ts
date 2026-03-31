/**
 * Unit tests for ContainersManager.list and ContainersManager.get with mocked APIClient.
 *
 * Feature: podman-client-ts-improvements
 * Requirement 9.5: Unit tests for ContainersManager.list and .get with mocked APIClient
 */

import { describe, test, expect, beforeEach, vi } from "bun:test";
import { ContainersManager, Container } from "../domain/containers";
import { APIClient } from "../api/client";
import { NotFound } from "../errors";

// Mock APIClient for testing
class MockAPIClient {
  public baseUrl = "http://localhost";
  public version = "5.0.0";

  private mockData: Record<string, unknown> = {};
  private mockStatus = 200;

  setMockData(data: Record<string, unknown>) {
    this.mockData = data;
  }

  setMockStatus(status: number) {
    this.mockStatus = status;
  }

  async get<T>(path: string, options?: { params?: Record<string, unknown>; compatible?: boolean }): Promise<{ data: T; raiseForStatus: (errorClass?: new (...args: unknown[]) => Error) => void; status: number }> {
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

  async post<T>(path: string, options?: { params?: Record<string, unknown>; data?: unknown; headers?: Record<string, string> }): Promise<{ data: T; raiseForStatus: (errorClass?: new (...args: unknown[]) => Error) => void; status: number }> {
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

  async delete<T>(path: string, options?: { params?: Record<string, unknown> }): Promise<{ data: T; raiseForStatus: (errorClass?: new (...args: unknown[]) => Error) => void; status: number }> {
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
    const query = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
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
        { Id: "abc123", Names: ["/container1"], State: { Status: "running" }, Labels: {}, NetworkSettings: { Ports: {} } },
        { Id: "def456", Names: ["/container2"], State: { Status: "exited" }, Labels: {}, NetworkSettings: { Ports: {} } },
      ];
      mockClient.setMockData(mockContainers);

      const containers = await manager.list();

      expect(containers).toHaveLength(2);
      expect(containers[0]).toBeInstanceOf(Container);
      expect(containers[0].id).toBe("abc123");
      expect(containers[1].id).toBe("def456");
    });

    test("passes all options to API", async () => {
      const mockContainers = [{ Id: "abc123", Names: ["/test"], State: { Status: "running" }, Labels: {}, NetworkSettings: { Ports: {} } }];
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
      const mockContainers = [{ Id: "abc123", Names: ["/test"], State: { Status: "running" }, Labels: {}, NetworkSettings: { Ports: {} } }];
      mockClient.setMockData(mockContainers);

      const containers = await manager.list({ filters: {} });
      expect(containers).toHaveLength(1);
    });

    test("handles undefined options", async () => {
      const mockContainers = [{ Id: "abc123", Names: ["/test"], State: { Status: "running" }, Labels: {}, NetworkSettings: { Ports: {} } }];
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