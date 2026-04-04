import { describe, expect, test } from "bun:test";
import {
  PodmanError,
  APIError,
  NotFound,
  ImageNotFound,
  BuildError,
  ContainerError,
  InvalidArgument,
  StreamParseError,
} from "../src/errors";

describe("errors", () => {
  test("PodmanError", () => {
    const err = new PodmanError("something went wrong");
    expect(err.message).toBe("something went wrong");
    expect(err.name).toBe("PodmanError");
    expect(err instanceof Error).toBe(true);
  });

  describe("APIError", () => {
    test("isClientError", () => {
      expect(new APIError("msg", 400).isClientError()).toBe(true);
      expect(new APIError("msg", 499).isClientError()).toBe(true);
      expect(new APIError("msg", 399).isClientError()).toBe(false);
      expect(new APIError("msg", 500).isClientError()).toBe(false);
    });

    test("isServerError", () => {
      expect(new APIError("msg", 500).isServerError()).toBe(true);
      expect(new APIError("msg", 599).isServerError()).toBe(true);
      expect(new APIError("msg", 499).isServerError()).toBe(false);
      expect(new APIError("msg", 600).isServerError()).toBe(false);
    });

    test("toString", () => {
      const e1 = new APIError("not found", 404);
      expect(e1.toString()).toBe("404 Client Error: not found");

      const e2 = new APIError("internal error", 500, "db down");
      expect(e2.toString()).toBe("500 Server Error: internal error (db down)");

      const e3 = new APIError("some error", 300);
      expect(e3.toString()).toBe("some error");
    });
  });

  test("NotFound", () => {
    const err = new NotFound("not found", "no such container");
    expect(err.statusCode).toBe(404);
    expect(err.explanation).toBe("no such container");
    expect(err.name).toBe("NotFound");
    expect(err.isClientError()).toBe(true);
  });

  test("ImageNotFound", () => {
    const err = new ImageNotFound("image not found");
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe("ImageNotFound");
  });

  test("BuildError", () => {
    const log = ["step 1", "step 2 failed"];
    const err = new BuildError("build failed", log);
    expect(err.message).toBe("build failed");
    expect(err.buildLog).toEqual(log);
  });

  test("ContainerError", () => {
    const err = new ContainerError("exited", 137);
    expect(err.message).toBe("exited");
    expect(err.exitStatus).toBe(137);
  });

  test("InvalidArgument", () => {
    const err = new InvalidArgument("bad arg");
    expect(err.message).toBe("bad arg");
  });

  test("StreamParseError", () => {
    const cause = new Error("invalid json");
    const err = new StreamParseError(cause);
    expect(err.message).toContain("Stream parse error");
    expect(err.message).toContain("invalid json");
  });
});
