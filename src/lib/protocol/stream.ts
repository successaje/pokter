/**
 * Reading a JSON-RPC response from a body that may be plain JSON or a
 * server-sent event stream, within byte and time limits.
 *
 * The old reader read the stream to its end and parsed the first `data:`
 * line. A server that keeps the stream open (MCP's Streamable HTTP may,
 * and A2A streaming does) held the read until the timeout; a heartbeat or
 * progress event sent first was parsed as the answer; and an event whose
 * JSON spans several `data:` lines was cut at the first.
 *
 * This reads events as they arrive, joins multi-line data, skips comments,
 * heartbeats and messages for other ids, and stops at the response it was
 * waiting for, cancelling the rest of the stream.
 */

export interface StreamLimits {
  /** The JSON-RPC id being answered. Without one, the first response (result or error) is taken. */
  expectId?: string | number | null;
  maxBytes: number;
}

function isResponseFor(message: unknown, expectId: StreamLimits['expectId']): boolean {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return false;
  const m = message as Record<string, unknown>;
  // A request or notification carries a method; a response carries result or error.
  if ('method' in m || !('result' in m || 'error' in m)) return false;
  return expectId === undefined || expectId === null || m.id === expectId;
}

/** The response for `expectId` in a parsed JSON body: the body itself, or one entry of a batch. */
export function pickResponse(parsed: unknown, expectId: StreamLimits['expectId']): unknown {
  // Without an id this is plain JSON (a card, a deliverable), returned as it is.
  if (Array.isArray(parsed) && expectId !== undefined && expectId !== null) {
    const match = parsed.find((entry) => isResponseFor(entry, expectId));
    if (match === undefined) throw new Error('No response for this request in the batch');
    return match;
  }
  return parsed;
}

/**
 * The data of each complete event in `buffer`, and what is left over.
 * Events end at a blank line; `data:` lines join with "\n"; `:` lines are
 * comments (heartbeats) and carry nothing.
 */
export function takeEvents(buffer: string): { events: string[]; rest: string } {
  const normalised = buffer.replace(/\r\n?/g, '\n');
  const blocks = normalised.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: string[] = [];
  for (const block of blocks) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''));
    if (data.length > 0) events.push(data.join('\n'));
  }
  return { events, rest };
}

/** Reads `response` until the awaited JSON-RPC response arrives, or the limits are hit. */
export async function readRpcResponse(response: Response, { expectId, maxBytes }: StreamLimits): Promise<unknown> {
  const announced = Number(response.headers.get('content-length') ?? 0);
  if (announced > maxBytes) throw new Error(`Response is larger than ${Math.round(maxBytes / 1024)} KiB`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body was empty');
  const streaming = response.headers.get('content-type')?.includes('text/event-stream') ?? false;
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        size += value.byteLength;
        if (size > maxBytes) throw new Error(`Response is larger than ${Math.round(maxBytes / 1024)} KiB`);
        text += decoder.decode(value, { stream: !done });
      }
      if (streaming) {
        // At the end of the stream, a final event without its blank line still counts.
        const { events, rest } = takeEvents(done ? `${text}\n\n` : text);
        text = rest;
        for (const data of events) {
          let message: unknown;
          try {
            message = JSON.parse(data);
          } catch {
            continue; // Not JSON: a keep-alive or a progress line.
          }
          const candidates = Array.isArray(message) ? message : [message];
          const match = candidates.find((entry) => isResponseFor(entry, expectId));
          if (match !== undefined) return match;
        }
      }
      if (done) break;
    }
  } finally {
    // Stop the rest of an open stream once the answer is in, or on any failure.
    await reader.cancel().catch(() => undefined);
  }

  if (streaming) throw new Error('The event stream ended without a response to this request');
  const body = text.trim();
  if (!body) throw new Error('Response body was empty');
  return pickResponse(JSON.parse(body), expectId);
}
