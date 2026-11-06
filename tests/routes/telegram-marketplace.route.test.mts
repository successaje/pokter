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
const callback = (fromId = 42) => JSON.stringify({ update_id: 2, callback_query: {
  id: 'local-callback', data: 'scout:enable_ai', from: { id: fromId }, message: { chat: { id: 42, type: 'private' } },
} });
const alertCallback = (data: string, fromId = 42) => JSON.stringify({ update_id: 3, callback_query: {
  id: 'local-alert-callback', data, from: { id: fromId }, message: { chat: { id: 42, type: 'private' } },
} });
const request = (body: string, secret?: string) => new Request(url, {
  method: 'POST',
  headers: secret ? { 'x-telegram-bot-api-secret-token': secret } : {},
  body,
});

test('an active follow-up keeps the previous agent category', async () => {
  const { scoutActiveCategory, scoutCategoryFor } = await import('../../src/lib/telegram/scout');
  assert.equal(scoutCategoryFor('I need to research tokens before investing'), 'research');
  assert.equal(scoutActiveCategory('Get me active ones, these are dry', 'research'), 'research');
  assert.equal(scoutActiveCategory('Show me something else', 'research'), undefined);
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

test('public request alerts need a private opt-in and can be turned off', async () => {
  const secret = process.env.POKTER_TELEGRAM_WEBHOOK_SECRET;
  const { queuePublicRequestAlert, requestAlertsOn } = await import('../../src/lib/telegram/request-alerts');
  const before = await POST(request(message('/alerts'), secret));
  assert.match((await before.json() as { text: string }).text, /alerts are off/);
  assert.deepEqual(await (await POST(request(alertCallback('scout:alerts:on', 99), secret))).json(), { ok: true });
  assert.equal(requestAlertsOn(42), false);
  const on = await POST(request(alertCallback('scout:alerts:on'), secret));
  assert.match((await on.json() as { text: string }).text, /alerts are on/);
  assert.equal(requestAlertsOn(42), true);
  const future = new Date(Date.now() + 86400000).toISOString();
  const open = { id: 'new-request', title: 'Research a pool', chainId: 97, state: 'open', closesAt: future, targetBuilder: null } as Parameters<typeof queuePublicRequestAlert>[0];
  assert.equal(queuePublicRequestAlert(open), 1);
  assert.equal(queuePublicRequestAlert(open), 0);
  assert.equal(queuePublicRequestAlert({ ...open, id: 'directed', targetBuilder: '0x0000000000000000000000000000000000000001' }), 0);
  assert.equal(queuePublicRequestAlert({ ...open, id: 'expired', closesAt: '2020-01-01T00:00:00Z' }), 0);
  const off = await POST(request(alertCallback('scout:alerts:off'), secret));
  assert.match((await off.json() as { text: string }).text, /alerts are off/);
  assert.equal(requestAlertsOn(42), false);
  assert.equal(queuePublicRequestAlert({ ...open, id: 'after-opt-out' }), 0);
});

test('private Scout chat requires opt-in, remembers a follow-up, and forgets it', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SCOUT_GEMINI_API_KEY = 'test-only-key';
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/answerCallbackQuery')) return Response.json({ ok: true });
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const answer = calls.length === 1 ? 'Pokter helps you compare agents with observed evidence.' : 'Payment and wallet approval happen on Pokter, not here.';
    return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: answer }] }] });
  }) as typeof fetch;
  try {
    const secret = process.env.POKTER_TELEGRAM_WEBHOOK_SECRET;
    const consent = await POST(request(message('/ai'), secret));
    const consentBody = await consent.json() as { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data?: string }>> } };
    assert.match(consentBody.text, /may use submitted content/);
    assert.equal(consentBody.reply_markup.inline_keyboard[0][0].callback_data, 'scout:enable_ai');
    assert.equal(calls.length, 0);
    assert.deepEqual(await (await POST(request(callback(99), secret))).json(), { ok: true });
    const enabled = await POST(request(callback(), secret));
    assert.match((await enabled.json() as { text: string }).text, /AI chat is on/);
    const { saveChat } = await import('../../src/lib/telegram/chat-store');
    saveChat(42, { turns: [], evidence: 'Agent A answered 8 of 10 Pokter checks; Agent B answered 2 of 10.', buttons: [], aiEnabled: true });
    const first = await POST(request(message('Which one?'), secret));
    assert.match((await first.json() as { text: string }).text, /compare agents/);
    const second = await POST(request(message('Why that one?'), secret));
    assert.match((await second.json() as { text: string }).text, /on Pokter/);
    assert.equal(calls.length, 2);
    const payment = await POST(request(message('And can I pay here?'), secret));
    assert.match((await payment.json() as { text: string }).text, /Scout cannot take payment/);
    const greeting = await POST(request(message('How are you?'), secret));
    const greetingBody = await greeting.json() as { text: string; reply_markup: { inline_keyboard: Array<Array<{ url: string }>> } };
    assert.match(greetingBody.text, /I’m well/);
    assert.equal(greetingBody.reply_markup.inline_keyboard.length, 1);
    const product = await POST(request(message('What are the things i can do on pokter?'), secret));
    assert.match((await product.json() as { text: string }).text, /browse builder-published services/);
    const workspace = await POST(request(message('Can you help manage and monitor my jobs and hires? I want to build AI agents on Pokter.'), secret));
    const workspaceBody = await workspace.json() as { text: string; reply_markup: { inline_keyboard: Array<Array<{ url: string }>> } };
    assert.match(workspaceBody.text, /cannot see or monitor your private jobs/);
    assert.ok(workspaceBody.reply_markup.inline_keyboard.some((row) => row[0].url.endsWith('/workspace/jobs')));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(calls[0].body.store, false);
    assert.equal(calls[0].body.model, 'gemini-3.5-flash-lite');
    const secondInput = JSON.parse(String(calls[1].body.input)) as { recent_turns: Array<{ role: string; content: string }> };
    assert.ok(secondInput.recent_turns.some((item) => item.role === 'assistant' && item.content.includes('compare agents')));
    const forget = await POST(request(message('/forget'), secret));
    assert.match((await forget.json() as { text: string }).text, /cleared/);
    const { readChat } = await import('../../src/lib/telegram/chat-store');
    assert.equal(readChat(42).aiEnabled, false);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.SCOUT_GEMINI_API_KEY;
  }
});
