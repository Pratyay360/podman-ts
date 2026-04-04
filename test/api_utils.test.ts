import { describe, expect, test } from "bun:test";
import {
  prepareFilters,
  prepareBody,
  encodeAuthHeader,
  parseRepository,
  prepareTimestamp,
  demuxOutput,
} from "../src/api/utils";

describe("api/utils", () => {
  describe("prepareFilters", () => {
    test("returns undefined for null or undefined", () => {
      expect(prepareFilters(null)).toBeUndefined();
      expect(prepareFilters(undefined)).toBeUndefined();
    });

    test("handles object filters", () => {
      const filters = {
        name: "test-container",
        label: ["l1", "l2"],
        status: ["running", "paused"],
        bool: true,
        num: 123,
      };
      const result = prepareFilters(filters);
      const parsed = JSON.parse(result!);
      expect(parsed).toEqual({
        name: ["test-container"],
        label: ["l1", "l2"],
        status: ["running", "paused"],
        bool: ["true"],
        num: ["123"],
      });
    });

    test("handles array filters (key=value strings)", () => {
      const filters = ["name=test", "label=foo=bar", "invalid"];
      const result = prepareFilters(filters);
      const parsed = JSON.parse(result!);
      expect(parsed).toEqual({
        name: ["test"],
        label: ["foo=bar"],
      });
    });

    test("skips null or undefined values in object filters", () => {
      const filters = {
        name: "test",
        other: null,
        another: undefined,
      };
      const result = prepareFilters(filters);
      const parsed = JSON.parse(result!);
      expect(parsed).toEqual({
        name: ["test"],
      });
    });

    test("returns undefined for empty input", () => {
      expect(prepareFilters({})).toBeUndefined();
      expect(prepareFilters([])).toBeUndefined();
    });
  });

  describe("prepareBody", () => {
    test("removes null, undefined, and empty arrays", () => {
      const body = {
        a: 1,
        b: null,
        c: undefined,
        d: [],
        e: {
          f: null,
          g: [],
          h: 2,
        },
        i: [1, 2, 3],
      };
      const result = prepareBody(body);
      expect(JSON.parse(result)).toEqual({
        a: 1,
        e: { h: 2 },
        i: [1, 2, 3],
      });
    });

    test("handles deeply nested objects", () => {
      const body = {
        meta: {
          labels: {
            foo: "bar",
            empty: null,
          },
          tags: [],
        },
      };
      const result = prepareBody(body);
      expect(JSON.parse(result)).toEqual({
        meta: {
          labels: {
            foo: "bar",
          },
        },
      });
    });
  });

  describe("encodeAuthHeader", () => {
    test("encodes to base64", () => {
      const auth = { username: "user", password: "pwd" };
      const result = encodeAuthHeader(auth);
      const decoded = JSON.parse(atob(result));
      expect(decoded).toEqual(auth);
    });
  });

  describe("parseRepository", () => {
    test("parses repo and tag", () => {
      expect(parseRepository("nginx:latest")).toEqual(["nginx", "latest"]);
      expect(parseRepository("myrepo:1.2.3")).toEqual(["myrepo", "1.2.3"]);
    });

    test("returns undefined tag for no tag", () => {
      expect(parseRepository("nginx")).toEqual(["nginx", undefined]);
    });

    test("handles repository names with host and port", () => {
      expect(parseRepository("localhost:5000/my-image:latest")).toEqual([
        "localhost:5000/my-image",
        "latest",
      ]);
      expect(parseRepository("localhost:5000/my-image")).toEqual([
        "localhost:5000/my-image",
        undefined,
      ]);
    });
  });

  describe("prepareTimestamp", () => {
    test("handles Date objects", () => {
      const date = new Date("2024-01-01T00:00:00Z");
      expect(prepareTimestamp(date)).toBe(date.getTime() / 1000);
    });

    test("handles numbers", () => {
      expect(prepareTimestamp(123456789)).toBe(123456789);
    });

    test("returns undefined for null or undefined", () => {
      expect(prepareTimestamp(null)).toBeUndefined();
      expect(prepareTimestamp(undefined)).toBeUndefined();
    });
  });

  describe("demuxOutput", () => {
    test("demuxes stdout and stderr", () => {
      // Create a mock stream: type 1 (stdout), length 5, payload "hello"
      // type 2 (stderr), length 5, payload "world"
      const hello = new TextEncoder().encode("hello");
      const world = new TextEncoder().encode("world");
      
      const data = new Uint8Array(8 + 5 + 8 + 5);
      
      // stdout header
      data[0] = 1;
      data[7] = 5;
      data.set(hello, 8);
      
      // stderr header
      data[8 + 5] = 2;
      data[8 + 5 + 7] = 5;
      data.set(world, 8 + 5 + 8);
      
      const { stdout, stderr } = demuxOutput(data);
      expect(new TextDecoder().decode(stdout)).toBe("hello");
      expect(new TextDecoder().decode(stderr)).toBe("world");
    });

    test("handles fragmented or multiple chunks of same stream", () => {
        const hello = new TextEncoder().encode("hello");
        const space = new TextEncoder().encode(" ");
        const world = new TextEncoder().encode("world");
        
        const data = new Uint8Array((8 + 5) + (8 + 1) + (8 + 5));
        
        // stdout "hello"
        data[0] = 1; data[7] = 5; data.set(hello, 8);
        // stdout " "
        let off = 8 + 5;
        data[off] = 1; data[off + 7] = 1; data.set(space, off + 8);
        // stdout "world"
        off += 8 + 1;
        data[off] = 1; data[off + 7] = 5; data.set(world, off + 8);
        
        const { stdout } = demuxOutput(data);
        expect(new TextDecoder().decode(stdout)).toBe("hello world");
    });

    test("stops on incomplete header", () => {
        const data = new Uint8Array([1, 0, 0, 0, 0, 0, 0]); // only 7 bytes
        const { stdout, stderr } = demuxOutput(data);
        expect(stdout.length).toBe(0);
        expect(stderr.length).toBe(0);
    });

    test("stops on incomplete payload", () => {
        const data = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 10, 1, 2, 3]); // header says 10 bytes, only 3 provided
        const { stdout, stderr } = demuxOutput(data);
        expect(stdout.length).toBe(0);
        expect(stderr.length).toBe(0);
    });
  });
});
