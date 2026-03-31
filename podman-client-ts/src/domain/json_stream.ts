/** JSON stream parsing utilities. */

import { StreamParseError } from "../errors";

/** Yield decoded JSON objects from an async iterable of text chunks. */
export async function* jsonStream(
  stream: AsyncIterable<string> | Iterable<string>
): AsyncGenerator<unknown> {
  let buffer = "";

  for await (const chunk of stream) {
    buffer += chunk;
    while (true) {
      buffer = buffer.trimStart();
      if (!buffer) break;
      try {
        // Try to parse from the start of the buffer
        const result = tryParseJson(buffer);
        if (result === null) break;
        yield result.value;
        buffer = buffer.slice(result.consumed).trimStart();
      } catch (e) {
        break;
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer.trim());
    } catch (e) {
      throw new StreamParseError(`Failed to parse JSON stream: ${e}`);
    }
  }
}

interface ParseResult {
  value: unknown;
  consumed: number;
}

function tryParseJson(text: string): ParseResult | null {
  // Walk through the string trying to find a complete JSON value
  for (let end = 1; end <= text.length; end++) {
    try {
      const value = JSON.parse(text.slice(0, end));
      return { value, consumed: end };
    } catch {
      // keep trying
    }
  }
  return null;
}

/** Split a text stream on newlines and yield each line. */
export async function* lineStream(
  stream: AsyncIterable<string>
): AsyncGenerator<string> {
  let buffer = "";
  for await (const chunk of stream) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line) yield line;
    }
  }
  if (buffer.trim()) yield buffer;
}
