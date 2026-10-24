/**
 * The provider MCP endpoint, run as the route it is, against throwaway
 * databases: authentication order, expiry, revocation and what a token
 * Pokter never issued is allowed to write.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'pokter-provider-route-'));
process.env.BUILDER_DB_PATH = join(dir, 'builders.db');
process.env.RATE_LIMIT_DB_PATH = join(dir, 'rate-limit.db');
process.env.PROVIDER_DB_PATH = join(dir, 'provider.db');

const route = await import('../../src/app/api/mcp/provider/route');
const POST = (route as unknown as { POST?: typeof route.POST; default?: { POST: typeof route.POST } }).POST ?? (route as unknown as { default: { POST: (r: Request) => Promise<Response> } }).default.POST;
const store = await import('../../src/lib/builders/store');
const secret = await import('../../src/lib/builders/automation-secret');

const OWNER = '0x00000000000000000000000000000000000000a1';
let ip = 0;
function call(token: string | null, body: unknown = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } }) {
  ip += 1;
  return POST(
    new Request('http://localhost/api/mcp/provider', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ip % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  );
}
function mint(expiresAt: string, scopes: string[] = ['requests:read']) {
  const minted = secret.mintAutomationToken();
  const id = `tok_${Math.random().toString(36).slice(2)}`;
  store.saveAutomationToken({ id, tokenHash: secret.hashAutomationToken(minted.token), ownerAddress: OWNER, label: 'test', hint: minted.token.slice(-4), scopes, createdAt: new Date().toISOString(), expiresAt });
  return { id, token: minted.token };
}
function tokenRows(): number {
  const db = new DatabaseSync(process.env.RATE_LIMIT_DB_PATH!, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    let n = 0;
    for (const { name } of tables) {
      const cols = db.prepare(`PRAGMA table_info(${name})`).all() as Array<{ name: string }>;
      const key = cols.find((c) => /key/i.test(c.name))?.name;
      if (key) n += (db.prepare(`SELECT COUNT(*) AS n FROM ${name} WHERE ${key} LIKE 'mcp-provider:%'`).get() as { n: number }).n;
    }
    return n;
  } finally {
    db.close();
  }
}
const later = () => new Date(Date.now() + 86_400_000).toISOString();

test('no token, or a token Pokter never issued, is refused and writes no per-token row', async () => {
  assert.equal((await call(null)).status, 401);
  const before = tokenRows();
  for (let i = 0; i < 25; i += 1) {
    const fake = secret.mintAutomationToken().token;
    assert.equal((await call(fake)).status, 401);
  }
  assert.equal(tokenRows(), before, 'rotating fake tokens must not grow the rate-limit store');
});

test('an issued token initialises as the provider server, and is the only kind that gets a bucket', async () => {
  const { token } = mint(later());
  const before = tokenRows();
  const response = await call(token);
  assert.equal(tokenRows(), before + 1, 'positive control: the counter does see a real token’s row');
  assert.equal(response.status, 200);
  const body = (await response.json()) as { result?: { serverInfo?: { name?: string } } };
  assert.equal(body.result?.serverInfo?.name, 'pokter-provider');
});

test('an expired token is refused on its next call', async () => {
  const { token } = mint(new Date(Date.now() - 1_000).toISOString());
  assert.equal((await call(token)).status, 401);
});

test('a revoked token is refused on the very next call, and a duplicate revoke is harmless', async () => {
  const { id, token } = mint(later());
  assert.equal((await call(token)).status, 200);
  assert.equal(store.revokeAutomationTokenFor(OWNER, id), true);
  assert.equal((await call(token)).status, 401);
  assert.equal(store.revokeAutomationTokenFor(OWNER, id), false, 'already revoked');
});

test('another wallet cannot revoke a token it does not own', async () => {
  const { id, token } = mint(later());
  assert.equal(store.revokeAutomationTokenFor('0x00000000000000000000000000000000000000b2', id), false);
  assert.equal((await call(token)).status, 200);
});

test('a scope the token lacks is refused inside the call, not granted', async () => {
  const { token } = mint(later(), ['requests:read']);
  const response = await call(token, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'report_earnings', arguments: {} } });
  const body = (await response.json()) as { result?: { isError?: boolean; content?: Array<{ text?: string }> } };
  assert.equal(body.result?.isError, true);
  assert.match(JSON.stringify(body.result), /earnings:read/);
});
