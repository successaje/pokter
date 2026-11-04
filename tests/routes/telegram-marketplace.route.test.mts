import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.RATE_LIMIT_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pokter-telegram-test-')), 'limits.db');
process.env.POKTER_TELEGRAM_BOT_TOKEN = 'local-test-token';
process.env.POKTER_TELEGRAM_WEBHOOK_SECRET = 'local-test-secret-with-enough-characters';
process.env.SCOUT_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pokter-scout-chat-test-')), 'scout.db');

const { POST } = await import('../../src/app/api/telegram/marketplace/route');
const url = 'https://pokter.xyz/api/telegram/marketplace';
const message = (text: string, type = 'private') => JSON.stringify({ update_id: 1, message: { text, chat: { id: 42, type } } });
const request = (body: string, secret?: string) => new Request(url, {
  method: 'POST',
  headers: secret ? { 'x-telegram-bot-api-secret-token': secret } : {},
  body,
});

test('webhook rejects requests without the separate public-bot secret', async () => {
  assert.equal((await POST(request(message('/start')))).status, 401);
  assert.equal((await POST(request(message('/start'), 'wrong'))).status, 401);
});

test('webhook answers commands but ignores ordinary group messages', async () => {
  const secret = process.env.POKTER_TELEGRAM_WEBHOOK_SECRET;
  const reply = await POST(request(message('/start'), secret));
  assert.equal(reply.status, 200);
  const body = await reply.json() as { method: string; chat_id: number; reply_markup: { keyboard: unknown[][] } };
  assert.equal(body.method, 'sendMessage');
  assert.equal(body.chat_id, 42);
  assert.ok(body.reply_markup.keyboard.length > 0);
  const find = await POST(request(message('Find an agent'), secret));
  const findBody = await find.json() as { text: string; reply_markup: { keyboard: Array<Array<{ text: string }>> } };
  assert.match(findBody.text, /Send a short task/);
  assert.ok(findBody.reply_markup.keyboard.flat().some((button) => button.text === 'Grid Trading'));
  const check = await POST(request(message('Check an agent'), secret));
  assert.match((await check.json() as { text: string }).text, /56:123/);
  const group = await POST(request(message('ordinary conversation', 'supergroup'), secret));
  assert.deepEqual(await group.json(), { ok: true });
  const groupStart = await POST(request(message('/start', 'supergroup'), secret));
  assert.match((await groupStart.json() as { text: string }).text, /Message me privately/);
});

test('webhook rejects malformed and oversized updates', async () => {
  const secret = process.env.POKTER_TELEGRAM_WEBHOOK_SECRET;
  assert.equal((await POST(request('{', secret))).status, 400);
  assert.equal((await POST(request('a'.repeat(16_385), secret))).status, 413);
});

test('private Scout chat uses a bounded stateless model request, remembers a follow-up, and forgets it', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SCOUT_OPENAI_API_KEY = 'test-only-key';
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const answer = calls.length === 1 ? 'Pokter helps you compare agents with observed evidence.' : 'Payment and wallet approval happen on Pokter, not here.';
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: answer }] }] });
  }) as typeof fetch;
  try {
    const secret = process.env.POKTER_TELEGRAM_WEBHOOK_SECRET;
    const first = await POST(request(message('What is Pokter?'), secret));
    assert.match((await first.json() as { text: string }).text, /compare agents/);
    const second = await POST(request(message('And can I pay here?'), secret));
    assert.match((await second.json() as { text: string }).text, /on Pokter/);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
    assert.equal(calls[0].body.store, false);
    assert.equal(calls[0].body.model, 'gpt-6-luna');
    const secondInput = calls[1].body.input as Array<{ role: string; content: string }>;
    assert.ok(secondInput.some((item) => item.role === 'assistant' && item.content.includes('compare agents')));
    const forget = await POST(request(message('/forget'), secret));
    assert.match((await forget.json() as { text: string }).text, /cleared/);
    await POST(request(message('What is Pokter?'), secret));
    const thirdInput = calls[2].body.input as Array<{ role: string; content: string }>;
    assert.equal(thirdInput.some((item) => item.role === 'assistant'), false);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.SCOUT_OPENAI_API_KEY;
  }
});
