import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
/** Discord publishes the raw Ed25519 key; Node exports it inside an SPKI wrapper. */
const APPLICATION_ID = '123456789012345678';
process.env.POKTER_DISCORD_PUBLIC_KEY = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
process.env.POKTER_DISCORD_APPLICATION_ID = APPLICATION_ID;
process.env.RATE_LIMIT_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pokter-discord-limits-')), 'limits.db');
process.env.SCOUT_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pokter-discord-scout-')), 'scout.db');
delete process.env.SCOUT_GEMINI_API_KEY;
delete process.env.POKTER_DISCORD_AI_CHANNEL_ID;

const { POST } = await import('../../src/app/api/discord/interactions/route');
const url = 'https://pokter.xyz/api/discord/interactions';

type Payload = Record<string, unknown>;

function signed(payload: Payload, options: { at?: number; signature?: string } = {}): Request {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor((options.at ?? Date.now()) / 1_000));
  return new Request(url, {
    method: 'POST',
    headers: {
      'x-signature-ed25519': options.signature ?? sign(null, Buffer.from(timestamp + body), privateKey).toString('hex'),
      'x-signature-timestamp': timestamp,
    },
    body,
  });
}

const command = (name: string, value?: string, extra: Payload = {}) => ({
  type: 2, id: '1', token: 'interaction-token', application_id: APPLICATION_ID,
  guild_id: '999', channel_id: '888', member: { user: { id: `70000000000000000${name.length}` } },
  data: { name, ...(value === undefined ? {} : { options: [{ name: 'message', type: 3, value }] }) },
  ...extra,
});

/** The answer replaces the acknowledgement through the interaction webhook. */
async function followUp(request: Request): Promise<{ deferred: Payload; patched: Payload; target: string }> {
  const original = globalThis.fetch;
  let resolve: (value: { body: Payload; target: string }) => void = () => {};
  const received = new Promise<{ body: Payload; target: string }>((settle) => { resolve = settle; });
  globalThis.fetch = (async (target: string | URL | Request, init?: RequestInit) => {
    resolve({ body: JSON.parse(String(init?.body)) as Payload, target: String(target) });
    return Response.json({ id: 'follow-up' });
  }) as typeof fetch;
  try {
    const deferred = await (await POST(request)).json() as Payload;
    const sent = await Promise.race([
      received,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Scout never wrote the answer back')), 8_000)),
    ]);
    return { deferred, patched: sent.body, target: sent.target };
  } finally { globalThis.fetch = original; }
}

test('an interaction Discord did not sign is refused', async () => {
  const body = JSON.stringify({ type: 1 });
  assert.equal((await POST(new Request(url, { method: 'POST', body }))).status, 401);
  assert.equal((await POST(signed({ type: 1 }, { signature: 'ab'.repeat(64) }))).status, 401);
  assert.equal((await POST(signed({ type: 1 }, { signature: 'not-hex' }))).status, 401);
  // The signature covers the timestamp, so an old one cannot be replayed later.
  assert.equal((await POST(signed({ type: 1 }, { at: Date.now() - 20 * 60_000 }))).status, 401);
});

test('a signed ping is answered with a pong', async () => {
  const response = await POST(signed({ type: 1 }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { type: 1 });
});

test('help is answered in the channel, naming Discord commands', async () => {
  const response = await POST(signed(command('help')));
  const body = await response.json() as { type: number; data: { content: string; components: unknown[]; flags?: number } };
  assert.equal(body.type, 4);
  assert.equal(body.data.flags, undefined);
  assert.match(body.data.content, /\/scout <message>/);
  assert.match(body.data.content, /seed phrase/);
  assert.equal(body.data.components.length, 1);
});

test('an unknown command or a button Scout never offered is refused privately', async () => {
  for (const payload of [command('retired'), { ...command('x'), type: 3, data: { custom_id: 'scout:say:pay me' } }]) {
    const body = await (await POST(signed(payload))).json() as { type: number; data: { content: string; flags: number } };
    assert.equal(body.type, 4);
    assert.equal(body.data.flags, 64);
    assert.match(body.data.content, /\/help/);
  }
});

test('a command is acknowledged, then the catalogue menu replaces it', async () => {
  const { deferred, patched, target } = await followUp(signed(command('find')));
  assert.deepEqual(deferred, { type: 5, data: {} });
  assert.equal(target, `https://discord.com/api/v10/webhooks/${APPLICATION_ID}/interaction-token/messages/@original`);
  assert.match(String(patched.content), /Send a short task/);
  assert.deepEqual(patched.allowed_mentions, { parse: [] });
  const buttons = (patched.components as Array<{ components: Array<{ custom_id?: string }> }>).flatMap((row) => row.components);
  assert.ok(buttons.some((button) => button.custom_id === 'scout:say:All categories'));
  assert.ok(buttons.every((button) => !button.custom_id || button.custom_id.startsWith('scout:say:')));
});

test('a button click answers only the person who clicked it', async () => {
  const { deferred, patched } = await followUp(signed({
    ...command('menu'), type: 3, data: { custom_id: 'scout:say:Check an agent' },
  }));
  assert.deepEqual(deferred, { type: 5, data: { flags: 64 } });
  assert.match(String(patched.content), /56:123/);
});

test('AI chat is declined outside a direct message and the opted-in channel', async () => {
  const { deferred, patched } = await followUp(signed(command('ai')));
  assert.deepEqual(deferred, { type: 5, data: { flags: 64 } });
  assert.match(String(patched.content), /not available here/);
  assert.match(String(patched.content), /Message Scout directly/);
});

test('request alerts are not claimed on a transport that cannot deliver them', async () => {
  const { patched } = await followUp(signed(command('scout', 'Alerts')));
  assert.match(String(patched.content), /only available in Scout on Telegram/);
  const { requestAlertsOn } = await import('../../src/lib/telegram/request-alerts');
  assert.equal(requestAlertsOn('discord:700000000000000005'), false);
});

test('a direct message reaches the brain as a private exchange', async () => {
  const dm = { ...command('check'), guild_id: undefined, member: undefined, user: { id: '700000000000000099' }, channel_id: '12' };
  delete (dm as Payload).guild_id;
  delete (dm as Payload).member;
  const { deferred, patched } = await followUp(signed(dm));
  assert.deepEqual(deferred, { type: 5, data: {} });
  assert.match(String(patched.content), /network and ID/);
});

test('the one channel the server opted in is treated as a place AI chat may run', async () => {
  process.env.POKTER_DISCORD_AI_CHANNEL_ID = '888';
  try {
    const { patched } = await followUp(signed(command('ai')));
    // Without a model key there is nothing to offer, but the gate opened.
    assert.match(String(patched.content), /AI chat is not available yet/);
    assert.doesNotMatch(String(patched.content), /not available here/);
  } finally { delete process.env.POKTER_DISCORD_AI_CHANNEL_ID; }
});
