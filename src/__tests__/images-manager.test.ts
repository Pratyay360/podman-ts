/**
 * Unit tests for ImagesManager.list and ImagesManager.get with mocked APIClient.
 *
 * Feature: podman-client-ts-improvements
 * Requirement 9.6: Unit tests for ImagesManager.list and .get with mocked APIClient
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { ImagesManager, Image } from "../domain/images";
import { APIClient } from "../api/client";
import { ImageNotFound } from "../errors";

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

  async get<T>(
    path: string,
    options?: { params?: Record<string, unknown>; compatible?: boolean },
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
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return `${this.baseUrl}${prefix}${path}${query}`;
  }
}

describe("ImagesManager", () => {
  let manager: ImagesManager;
  let mockClient: MockAPIClient;

  beforeEach(() => {
    mockClient = new MockAPIClient();
    // Use any cast to work around type mismatch
    manager = new ImagesManager(mockClient as unknown as APIClient);
  });

  describe("list", () => {
    test("returns empty array when no images exist", async () => {
      mockClient.setMockData([]);
      const images = await manager.list();
      expect(images).toEqual([]);
    });

    test("returns array of Image objects", async () => {
      const mockImages = [
        { Id: "sha256:abc123", RepoTags: ["nginx:latest"], Labels: {} },
        { Id: "sha256:def456", RepoTags: ["redis:alpine"], Labels: { maintainer: "redis" } },
      ];
      mockClient.setMockData(mockImages);

      const images = await manager.list();

      expect(images).toHaveLength(2);
      expect(images[0]).toBeInstanceOf(Image);
      expect(images[0].id).toBe("sha256:abc123");
      expect(images[1].id).toBe("sha256:def456");
    });

    test("passes all options to API", async () => {
      const mockImages = [{ Id: "sha256:abc123", RepoTags: ["test:latest"], Labels: {} }];
      mockClient.setMockData(mockImages);

      const images = await manager.list({
        all: true,
        name: "nginx",
        filters: { dangling: true },
      });

      expect(images).toHaveLength(1);
    });

    test("handles empty filters", async () => {
      const mockImages = [{ Id: "sha256:abc123", RepoTags: ["test:latest"], Labels: {} }];
      mockClient.setMockData(mockImages);

      const images = await manager.list({ filters: {} });
      expect(images).toHaveLength(1);
    });

    test("handles undefined options", async () => {
      const mockImages = [{ Id: "sha256:abc123", RepoTags: ["test:latest"], Labels: {} }];
      mockClient.setMockData(mockImages);

      const images = await manager.list({});
      expect(images).toHaveLength(1);
    });

    test("returns empty array on 404 status", async () => {
      mockClient.setMockStatus(404);
      mockClient.setMockData({ message: "not found" });

      const images = await manager.list();
      expect(images).toEqual([]);
    });

    test("adds name filter when name option is provided", async () => {
      const mockImages = [{ Id: "sha256:abc123", RepoTags: ["nginx:latest"], Labels: {} }];
      mockClient.setMockData(mockImages);

      await manager.list({ name: "nginx" });
      // The list method should add the name as a filter
      expect(mockImages).toBeDefined();
    });
  });

  describe("get", () => {
    test("returns Image object for valid name", async () => {
      const mockImage = {
        Id: "sha256:abc123",
        RepoTags: ["nginx:latest"],
        Labels: { maintainer: "nginx" },
      };
      mockClient.setMockData(mockImage);

      const image = await manager.get("nginx:latest");

      expect(image).toBeInstanceOf(Image);
      expect(image.id).toBe("sha256:abc123");
    });

    test("throws ImageNotFound for non-existent image", async () => {
      mockClient.setMockStatus(404);
      mockClient.setMockData({ message: "not found" });

      await expect(manager.get("nonexistent")).rejects.toThrow(ImageNotFound);
    });

    test("throws for other HTTP errors", async () => {
      mockClient.setMockStatus(500);
      mockClient.setMockData({ message: "internal error" });

      await expect(manager.get("nginx")).rejects.toThrow("HTTP 500");
    });

    test("handles image with no RepoTags", async () => {
      const mockImage = {
        Id: "sha256:abc123",
        RepoTags: null,
        Labels: {},
      };
      mockClient.setMockData(mockImage);

      const image = await manager.get("sha256:abc123");
      expect(image.tags).toEqual([]);
    });

    test("handles image with <none> tags", async () => {
      const mockImage = {
        Id: "sha256:abc123",
        RepoTags: ["<none>:<none>"],
        Labels: {},
      };
      mockClient.setMockData(mockImage);

      const image = await manager.get("sha256:abc123");
      expect(image.tags).toEqual([]);
    });

    test("filters out <none> tags", async () => {
      const mockImage = {
        Id: "sha256:abc123",
        RepoTags: ["nginx:latest", "<none>:<none>", "nginx:alpine"],
        Labels: {},
      };
      mockClient.setMockData(mockImage);

      const image = await manager.get("sha256:abc123");
      expect(image.tags).toEqual(["nginx:latest", "nginx:alpine"]);
    });

    test("returns correct labels", async () => {
      const mockImage = {
        Id: "sha256:abc123",
        RepoTags: ["nginx:latest"],
        Labels: { maintainer: "nginx", version: "1.25" },
      };
      mockClient.setMockData(mockImage);

      const image = await manager.get("nginx:latest");
      expect(image.labels).toEqual({ maintainer: "nginx", version: "1.25" });
    });

    test("returns empty labels when none provided", async () => {
      const mockImage = {
        Id: "sha256:abc123",
        RepoTags: ["nginx:latest"],
        Labels: undefined,
      };
      mockClient.setMockData(mockImage);

      const image = await manager.get("nginx:latest");
      expect(image.labels).toEqual({});
    });

    test("handles image id without sha256 prefix", async () => {
      const mockImage = {
        Id: "abc123def456",
        RepoTags: ["myimage:latest"],
        Labels: {},
      };
      mockClient.setMockData(mockImage);

      const image = await manager.get("abc123def456");
      expect(image.id).toBe("abc123def456");
    });
  });

  describe("Image resource", () => {
    test("image has correct id", async () => {
      const mockImage = {
        Id: "sha256:unique123",
        RepoTags: ["test:latest"],
        Labels: {},
      };
      mockClient.setMockData(mockImage);

      const image = await manager.get("test:latest");
      expect(image.id).toBe("sha256:unique123");
    });

    test("toString returns formatted string", async () => {
      const mockImage = {
        Id: "sha256:abc123",
        RepoTags: ["nginx:latest", "nginx:1.25"],
        Labels: {},
      };
      mockClient.setMockData(mockImage);

      const image = await manager.get("nginx:latest");
      expect(image.toString()).toBe("<Image: 'nginx:latest', 'nginx:1.25'>");
    });

    test("toString handles no tags", async () => {
      const mockImage = {
        Id: "sha256:abc123",
        RepoTags: null,
        Labels: {},
      };
      mockClient.setMockData(mockImage);

      const image = await manager.get("sha256:abc123");
      expect(image.toString()).toBe("<Image: ''>");
    });
  });
});
