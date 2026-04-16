import { describe, expect, test } from "bun:test";
import { APIClient, APIResponse, attachRequestBody } from "../src/api/client";
import { NotFound, APIError } from "../src/errors";

describe("APIClient", () => {
  test("constructor parses baseUrl correctly", () => {
    const client1 = new APIClient({ baseUrl: "http+unix:///run/podman/podman.sock" });
    // @ts-ignore - accessing private for test
    expect(client1.httpBase).toBe("http://localhost");
    // @ts-ignore
    expect(client1.unix).toBe("/run/podman/podman.sock");

    const client2 = new APIClient({ baseUrl: "tcp://localhost:8080" });
    // @ts-ignore
    expect(client2.httpBase).toBe("http://localhost:8080");
    // @ts-ignore
    expect(client2.unix).toBeUndefined();
  });

  test("constructor throws on ssh baseUrl", () => {
    expect(() => new APIClient({ baseUrl: "ssh://remote" })).toThrow(
      "SSH connections require an SSH tunnel",
    );
  });

  test("buildUrl constructs correct paths", () => {
    const client = new APIClient({ baseUrl: "http://localhost:8080", version: "v5.0.0" });

    expect(client.buildUrlPublic("/containers/json", false, { all: true })).toBe(
      "http://localhost:8080/v5.0.0/libpod/containers/json?all=true",
    );

    expect(client.buildUrlPublic("/images/json", true)).toBe(
      "http://localhost:8080/v5.0.0/compat/images/json",
    );

    expect(
      client.buildUrlPublic("/containers/stats", false, {
        containers: ["c1", "c2"],
        stream: false,
      }),
    ).toBe(
      "http://localhost:8080/v5.0.0/libpod/containers/stats?containers=c1&containers=c2&stream=false",
    );
  });

  test("attachRequestBody passes binary through without JSON encoding", () => {
    const headers: Record<string, string> = { "Content-Type": "application/x-tar" };
    const buf = new Uint8Array([1, 2, 3]);
    const body = attachRequestBody(headers, buf);
    expect(body).toBeInstanceOf(Uint8Array);
  });
});

describe("APIResponse", () => {
  test("status and ok properties", () => {
    const res1 = new APIResponse(200, { foo: "bar" });
    expect(res1.status).toBe(200);
    expect(res1.ok).toBe(true);
    expect(res1.data).toEqual({ foo: "bar" });

    const res2 = new APIResponse(404, "not found");
    expect(res2.status).toBe(404);
    expect(res2.ok).toBe(false);
  });

  describe("raiseForStatus", () => {
    test("does nothing for 2xx", () => {
      const res = new APIResponse(200, "ok");
      expect(() => res.raiseForStatus()).not.toThrow();
    });

    test("throws NotFound for 404", () => {
      const res = new APIResponse(404, { message: "no such container" });
      expect(() => res.raiseForStatus()).toThrow(NotFound);
      try {
        res.raiseForStatus();
      } catch (e: any) {
        expect(e.message).toBe("no such container");
        expect(e.explanation).toBe("no such container");
      }
    });

    test("throws APIError for other 4xx/5xx", () => {
      const res = new APIResponse(500, { message: "server error", cause: "database down" });
      expect(() => res.raiseForStatus()).toThrow(APIError);
      try {
        res.raiseForStatus();
      } catch (e: any) {
        expect(e.statusCode).toBe(500);
        expect(e.message).toBe("database down");
        expect(e.explanation).toBe("server error");
      }
    });

    test("handles non-object body", () => {
      const res = new APIResponse(400, "Bad Request");
      expect(() => res.raiseForStatus()).toThrow(APIError);
      try {
        res.raiseForStatus();
      } catch (e: any) {
        expect(e.message).toBe("Bad Request");
      }
    });
  });
});
