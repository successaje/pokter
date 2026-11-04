import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.SCOUT_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pokter-scout-store-test-')), 'scout.db');

const { forgetChat, readChat, saveChat } = await import('../../src/lib/telegram/chat-store');
const { generateScoutAnswer } = await import('../../src/lib/telegram/scout-gemini');
const { scoutKnowledgeFor } = await import('../../src/lib/telegram/scout-knowledge');

test('Scout selects Pokter documentation for the question and links to real guides', () => {
  const request = scoutKnowledgeFor('How do buyers post a request and builders propose?');
  assert.match(request.context, /A request describes work but is not a funded hire/);
  assert.ok(request.links.some((link) => link.path === '/guides/find-jobs'));
  assert.ok(request.context.length <= 3200);
});

test('Scout keeps a short local window for one day and /forget removes it', () => {
  const now = Date.UTC(2026, 10, 4);
  saveChat(101, { turns: Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' as const : 'user' as const, content: `turn ${i}` })), evidence: 'observed', buttons: [], aiEnabled: true, lastAgentCategory: 'research' }, now);
  assert.equal(readChat(101, now + 1_000).turns.length, 6);
  assert.equal(readChat(101, now + 1_000).lastAgentCategory, 'research');
  assert.equal(readChat(101, now + 24 * 60 * 60 * 1000 + 1).turns.length, 0);
  saveChat(101, { turns: [{ role: 'user', content: 'new task' }], evidence: '', buttons: [], aiEnabled: true }, now);
  forgetChat(101);
  assert.equal(readChat(101, now).turns.length, 0);
});

test('Scout refuses model-written links and keeps API storage disabled', async () => {
  const originalFetch = globalThis.fetch;
  let sentStore: unknown;
  let sentDocs: unknown;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { store: unknown; input: string };
    sentStore = body.store;
    sentDocs = (JSON.parse(body.input) as { pokter_docs?: string }).pokter_docs;
    return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Open https://example.com/fake-agent' }] }] });
  }) as typeof fetch;
  try {
    await assert.rejects(generateScoutAnswer({ message: 'which one?', turns: [], evidence: 'No verified links', docs: 'Official Pokter guide facts', apiKey: 'test' }), /unverified link/);
    assert.equal(sentStore, false);
    assert.equal(sentDocs, 'Official Pokter guide facts');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
