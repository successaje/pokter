import assert from 'node:assert/strict';
import test from 'node:test';

import { readRpcResponse, takeEvents } from '../src/lib/protocol/stream';

const LIMITS = { maxBytes: 64 * 1024 };

function sse(chunks: string[], { hold = false } = {}): { response: Response; cancelled: () => boolean } {
  let cancelled = false;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      // An open stream: nothing more arrives and it never closes.
      if (!hold) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { response: new Response(body, { headers: { 'content-type': 'text/event-stream' } }), cancelled: () => cancelled };
}

test('heartbeats, progress and other ids are skipped; the awaited response is returned', async () => {
  const { response } = sse([
    ': keep-alive\n\n',
    'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1}}\n\n',
    'data: {"jsonrpc":"2.0","id":"other","result":{}}\n\n',
    'data: {"jsonrpc":"2.0","id":"pokter","result":{"tools":[]}}\n\n',
  ]);
  assert.deepEqual(await readRpcResponse(response, { ...LIMITS, expectId: 'pokter' }), { jsonrpc: '2.0', id: 'pokter', result: { tools: [] } });
});

test('an open stream is read only until the answer, then cancelled', async () => {
  const stream = sse(['data: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n'], { hold: true });
  const message = await readRpcResponse(stream.response, { ...LIMITS, expectId: 1 });
  assert.deepEqual(message, { jsonrpc: '2.0', id: 1, result: { ok: true } });
  assert.equal(stream.cancelled(), true);
});

test('multi-line data and events split across chunks are joined', async () => {
  const { response } = sse(['data: {"jsonrpc":"2.0",\r\ndata: "id":7,', '\r\ndata: "result":{"n":1}}\r\n\r\n']);
  assert.deepEqual(await readRpcResponse(response, { ...LIMITS, expectId: 7 }), { jsonrpc: '2.0', id: 7, result: { n: 1 } });
});

test('a stream that ends without the response, or runs over the limit, fails plainly', async () => {
  await assert.rejects(readRpcResponse(sse(['data: {"jsonrpc":"2.0","id":2,"result":{}}\n\n']).response, { ...LIMITS, expectId: 1 }), /ended without a response/);
  const big = sse([`data: ${'x'.repeat(2048)}\n\n`]);
  await assert.rejects(readRpcResponse(big.response, { maxBytes: 1024, expectId: 1 }), /larger than 1 KiB/);
});

test('plain JSON is returned as it is, and a batch yields the matching entry', async () => {
  const card = new Response('[{"name":"a"}]', { headers: { 'content-type': 'application/json' } });
  assert.deepEqual(await readRpcResponse(card, LIMITS), [{ name: 'a' }]);
  const batch = new Response('[{"jsonrpc":"2.0","id":1,"result":1},{"jsonrpc":"2.0","id":2,"result":2}]', { headers: { 'content-type': 'application/json' } });
  assert.deepEqual(await readRpcResponse(batch, { ...LIMITS, expectId: 2 }), { jsonrpc: '2.0', id: 2, result: 2 });
});

test('a final event without its blank line still counts', () => {
  assert.deepEqual(takeEvents('data: 1\n\ndata: 2').events, ['1']);
});
