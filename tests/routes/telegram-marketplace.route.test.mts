import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.RATE_LIMIT_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pokter-telegram-test-')), 'limits.db');
process.env.POKTER_TELEGRAM_BOT_TOKEN = 'local-test-token';
process.env.POKTER_TELEGRAM_WEBHOOK_SECRET = 'local-test-secret-with-enough-characters';

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
