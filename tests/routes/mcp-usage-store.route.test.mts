import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
 * That the MCP counts are a record, and that reading them back says what
 * was written.
 *
 * Run against a real file for the reason this repository already learned
 * the hard way: a query can pass typecheck, lint and the build and still
 * fail on its first row, and only executing the SQL finds it. Tested here
 * rather than beside the counter because the store is `server-only` and
 * unreachable from the plain runner.
 *
 * The path is set before the import, because the store resolves it once
 * when it is first loaded.
 */
process.env.MCP_USAGE_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pokter-mcp-usage-')), 'mcp-usage.db');

const { recordMcpCalls, mcpUsage } = await import('../../src/lib/mcp/usage-store');

const AT = new Date('2026-11-24T09:00:00.000Z');
const day = (offset: number) => new Date(AT.getTime() + offset * 86_400_000);

test('nothing recorded reads as nobody called, not as an error', () => {
  /*
   * The empty answer is the one this exists to be able to give plainly:
   * the registry listing brought no one. It must come back as an empty
   * list rather than a throw, or the first month of silence looks like a
   * broken page.
   */
  assert.deepEqual(mcpUsage(30, AT), []);
});

test('calls are counted per tool and surface, answered apart from failed', () => {
  recordMcpCalls('buyer', [
    { tool: 'search_agents', ok: true },
    { tool: 'search_agents', ok: true },
    { tool: 'get_quote', ok: false },
  ], AT);
  recordMcpCalls('provider', [{ tool: 'find_requests', ok: true }], AT);

  const usage = mcpUsage(30, AT);
  assert.deepEqual(usage.find((u) => u.tool === 'search_agents'), { surface: 'buyer', tool: 'search_agents', answered: 2, failed: 0 });
  assert.deepEqual(usage.find((u) => u.tool === 'get_quote'), { surface: 'buyer', tool: 'get_quote', answered: 0, failed: 1 });
  /* The two servers answer different questions and are never added together. */
  assert.deepEqual(usage.find((u) => u.tool === 'find_requests'), { surface: 'provider', tool: 'find_requests', answered: 1, failed: 0 });
});

test('a second call the next day adds to the tool rather than replacing it', () => {
  recordMcpCalls('buyer', [{ tool: 'search_agents', ok: true }], day(1));
  const row = mcpUsage(30, day(1)).find((u) => u.tool === 'search_agents');
  assert.equal(row?.answered, 3, 'the daily rows should sum across the window, not overwrite');
});

test('the window excludes what fell out of it', () => {
  /*
   * Read from far enough ahead that every row above is older than the
   * window: a counter that quietly ignored its own `days` would report
   * last quarter's traffic as this week's.
   */
  assert.deepEqual(mcpUsage(2, day(40)), []);
});

test('the busiest tool is first, which is the only reason to sort at all', () => {
  recordMcpCalls('buyer', Array.from({ length: 9 }, () => ({ tool: 'get_agent', ok: true })), day(2));
  const usage = mcpUsage(30, day(2));
  assert.equal(usage[0]?.tool, 'get_agent');
  const totals = usage.map((u) => u.answered + u.failed);
  assert.deepEqual(totals, [...totals].sort((a, b) => b - a), 'rows are not in descending order of traffic');
});

test('recording never throws, whatever it is handed', () => {
  /*
   * The counter sits beside the answer an assistant is waiting for. A
   * locked file or a surprising name must cost a count, never the call.
   */
  assert.doesNotThrow(() => recordMcpCalls('buyer', [], AT));
  assert.doesNotThrow(() => recordMcpCalls('buyer', [{ tool: "';DROP TABLE daily_mcp_call;--", ok: true }], AT));
  /* And the table is still there, because the name was bound and not interpolated. */
  assert.ok(mcpUsage(30, AT).length > 0, 'the store stopped answering after an odd tool name');
});
