/**
 * Unit + property tests for demuxOutput.
 *
 * Feature: podman-client-ts-improvements
 * Property 4: demuxOutput stdout/stderr partition
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { demuxOutput } from "../api/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a single multiplexed frame: 8-byte header + payload. */
function makeFrame(streamType: 1 | 2, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(8 + payload.length);
  frame[0] = streamType;
  // bytes 1-3: reserved (zero)
  const size = payload.length;
  frame[4] = (size >>> 24) & 0xff;
  frame[5] = (size >>> 16) & 0xff;
  frame[6] = (size >>> 8) & 0xff;
  frame[7] = size & 0xff;
  frame.set(payload, 8);
  return frame;
}

/** Concatenate multiple Uint8Arrays into one. */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe("demuxOutput — stdout-only", () => {
  test("single stdout frame", () => {
    const payload = enc.encode("hello stdout");
    const data = makeFrame(1, payload);
    const { stdout, stderr } = demuxOutput(data);
    expect(dec.decode(stdout)).toBe("hello stdout");
    expect(stderr.length).toBe(0);
  });

  test("multiple stdout frames are concatenated", () => {
    const data = concat(
      makeFrame(1, enc.encode("foo")),
      makeFrame(1, enc.encode("bar")),
    );
    const { stdout, stderr } = demuxOutput(data);
    expect(dec.decode(stdout)).toBe("foobar");
    expect(stderr.length).toBe(0);
  });
});

describe("demuxOutput — stderr-only", () => {
  test("single stderr frame", () => {
    const payload = enc.encode("error message");
    const data = makeFrame(2, payload);
    const { stdout, stderr } = demuxOutput(data);
    expect(stdout.length).toBe(0);
    expect(dec.decode(stderr)).toBe("error message");
  });

  test("multiple stderr frames are concatenated", () => {
    const data = concat(
      makeFrame(2, enc.encode("err1")),
      makeFrame(2, enc.encode("err2")),
    );
    const { stdout, stderr } = demuxOutput(data);
    expect(stdout.length).toBe(0);
    expect(dec.decode(stderr)).toBe("err1err2");
  });
});

describe("demuxOutput — interleaved stdout + stderr", () => {
  test("stdout and stderr frames are routed to correct channels", () => {
    const data = concat(
      makeFrame(1, enc.encode("out1")),
      makeFrame(2, enc.encode("err1")),
      makeFrame(1, enc.encode("out2")),
      makeFrame(2, enc.encode("err2")),
    );
    const { stdout, stderr } = demuxOutput(data);
    expect(dec.decode(stdout)).toBe("out1out2");
    expect(dec.decode(stderr)).toBe("err1err2");
  });

  test("empty input returns empty stdout and stderr", () => {
    const { stdout, stderr } = demuxOutput(new Uint8Array(0));
    expect(stdout.length).toBe(0);
    expect(stderr.length).toBe(0);
  });

  test("truncated header is ignored gracefully", () => {
    // Only 4 bytes — less than the 8-byte header
    const { stdout, stderr } = demuxOutput(new Uint8Array([1, 0, 0, 0]));
    expect(stdout.length).toBe(0);
    expect(stderr.length).toBe(0);
  });

  test("frame with payload size larger than remaining data is skipped", () => {
    // Header claims 100 bytes but only 3 bytes follow
    const frame = new Uint8Array(8 + 3);
    frame[0] = 1;
    frame[7] = 100; // payload size = 100
    frame.set(enc.encode("abc"), 8);
    const { stdout, stderr } = demuxOutput(frame);
    expect(stdout.length).toBe(0);
    expect(stderr.length).toBe(0);
  });
});

// ─── Property 4: demuxOutput stdout/stderr partition ─────────────────────────

describe("Property 4 — demuxOutput partitions bytes correctly", () => {
  // Feature: podman-client-ts-improvements, Property 4: demuxOutput stdout/stderr partition

  /** Arbitrary for a single frame: { type: 1|2, bytes: Uint8Array } */
  const frameArb = fc
    .tuple(
      fc.constantFrom(1 as const, 2 as const),
      fc.uint8Array({ minLength: 0, maxLength: 64 }),
    )
    .map(([type, bytes]) => ({ type, bytes }));

  test("property: total bytes are preserved and routed to correct channel", () => {
    fc.assert(
      fc.property(fc.array(frameArb, { minLength: 0, maxLength: 20 }), (frames) => {
        const data = concat(...frames.map((f) => makeFrame(f.type, f.bytes)));
        const { stdout, stderr } = demuxOutput(data);

        const expectedStdoutLen = frames
          .filter((f) => f.type === 1)
          .reduce((n, f) => n + f.bytes.length, 0);
        const expectedStderrLen = frames
          .filter((f) => f.type === 2)
          .reduce((n, f) => n + f.bytes.length, 0);

        expect(stdout.length).toBe(expectedStdoutLen);
        expect(stderr.length).toBe(expectedStderrLen);
        expect(stdout.length + stderr.length).toBe(expectedStdoutLen + expectedStderrLen);
      }),
    );
  });

  test("property: stdout bytes match the concatenation of all type-1 payloads in order", () => {
    fc.assert(
      fc.property(fc.array(frameArb, { minLength: 1, maxLength: 20 }), (frames) => {
        const data = concat(...frames.map((f) => makeFrame(f.type, f.bytes)));
        const { stdout } = demuxOutput(data);

        const expectedStdout = concat(...frames.filter((f) => f.type === 1).map((f) => f.bytes));
        expect(stdout).toEqual(expectedStdout);
      }),
    );
  });

  test("property: stderr bytes match the concatenation of all type-2 payloads in order", () => {
    fc.assert(
      fc.property(fc.array(frameArb, { minLength: 1, maxLength: 20 }), (frames) => {
        const data = concat(...frames.map((f) => makeFrame(f.type, f.bytes)));
        const { stderr } = demuxOutput(data);

        const expectedStderr = concat(...frames.filter((f) => f.type === 2).map((f) => f.bytes));
        expect(stderr).toEqual(expectedStderr);
      }),
    );
  });
});
