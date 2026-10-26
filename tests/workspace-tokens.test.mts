import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { jobAmountLabel } from '../src/lib/erc8183/job-amount';
import { enabledHireTokens } from '../src/lib/network/tokens';
import { totalLines } from '../src/features/workspace/totals';
import { earnedByNetwork, earnedByToken, earnedLineText } from '../src/lib/builder/earnings';
import { RECEIPT_VERIFIER_SOURCE } from '../src/lib/proof/verifier';
import { buildIntegrationKit } from '../src/lib/integration/kit';
import { kitTokens, moneyWords, tokenListText } from '../src/lib/integration/currencies';

/*
 * The money in the workspace, Studio, proof and the kit, after USDT hiring.
 * Every figure here used to be an eighteen-decimal number labelled $U.
 */

const U56 = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const U97 = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const USDT56 = '0x55d398326f99059fF775485246999027B3197955';
const USDT97 = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const E18 = 10n ** 18n;

const job = (chainId: number, paymentToken: string | null, units: bigint, status = 'COMPLETED') => ({ chainId, paymentToken, budgetRaw: units.toString(), status });

test('budgetOf and escrowedAmount label a job in its own token, and an unknown token as unknown', () => {
  assert.equal(jobAmountLabel(job(56, USDT56, 2n * E18)), '2 USDT');
  assert.equal(jobAmountLabel(job(97, U97, E18 / 10n)), '0.1 $U');
  const unknown = jobAmountLabel(job(56, null, E18));
  assert.match(unknown, /currency not yet read/);
  assert.doesNotMatch(unknown, /\$U/);

  /* The components are client modules that cannot load under node; their source must route through the label. */
  const parts = readFileSync(new URL('../src/features/workspace/parts.tsx', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../src/features/workspace/JobDetail.tsx', import.meta.url), 'utf8');
  const inbox = readFileSync(new URL('../src/features/studio/DeliveryInbox.tsx', import.meta.url), 'utf8');
  assert.match(parts, /export function budgetOf[\s\S]{0,200}jobAmountLabel\(job\)/);
  assert.match(detail, /function escrowedAmount[\s\S]{0,100}jobAmountLabel\(job\)/);
  for (const source of [parts, detail, inbox]) assert.doesNotMatch(source, /formatUnits\([^)]*,\s*18\)/);
  assert.doesNotMatch(inbox, /\} \$U/);
});

test('workspace totals never combine tokens or chains, and count unknown tokens apart', () => {
  const lines = totalLines([
    job(56, U56, E18, 'FUNDED'),
    job(56, U56, E18 / 2n, 'FUNDED'),
    job(56, USDT56, 3n * E18, 'FUNDED'),
    job(97, U97, 5n * E18, 'FUNDED'),
    job(97, USDT97, E18, 'FUNDED'),
    job(56, null, 7n * E18, 'FUNDED'),
  ]);
  assert.deepEqual(lines.map((l) => l.text), ['1.5 $U', '3 USDT', '1 job, currency not yet read', '5 test $U', '1 test USDT']);
  assert.deepEqual(lines.map((l) => l.test), [false, false, false, true, true]);
  /* No line is ever a sum across tokens: 1.5 + 3 = 4.5 appears nowhere. */
  assert.ok(lines.every((l) => !/4\.5/.test(l.text)));
  assert.deepEqual(totalLines([]), []);
});

test('the overview, wallet page and Studio sum through totalLines, not as eighteen-decimal $U', () => {
  const overview = readFileSync(new URL('../src/features/workspace/Overview.tsx', import.meta.url), 'utf8');
  const pages = readFileSync(new URL('../src/features/workspace/Pages.tsx', import.meta.url), 'utf8');
  const data = readFileSync(new URL('../src/features/studio/data.ts', import.meta.url), 'utf8');
  for (const source of [overview, pages, data]) {
    assert.match(source, /totalLines\(/);
    assert.doesNotMatch(source, /formatUnits\(BigInt\([a-z.]*budgetRaw\), 18\)/);
    assert.doesNotMatch(source, /\/ 1e18/);
  }
});

test('earnedByToken splits per chain and token, keeps test money apart, and leaves earnedByNetwork as $U', () => {
  const jobs = [
    job(56, U56, E18),
    job(56, USDT56, 2n * E18),
    job(56, USDT56, 2n * E18),
    job(97, U97, 9n * E18),
    job(56, null, E18),
    job(56, USDT56, 100n * E18, 'FUNDED'),
  ];
  const lines = earnedByToken(jobs);
  assert.deepEqual(lines.map(earnedLineText), ['1 $U', '4 USDT', '1 job, currency not yet read', '9 test $U']);
  assert.deepEqual(lines.map((l) => l.realMoney), [true, true, true, false]);
  /* Only completed jobs; the funded USDT job is not earned. */
  assert.equal(lines.find((l) => l.symbol === 'USDT')?.raw, 4n * E18);
  assert.deepEqual(earnedByNetwork(jobs), { real: E18, test: 9n * E18 });
});

/* A local receipt index and a JSON-RPC that answers getJob and jobPaymentToken for each job. */
async function withChain(jobs: Record<string, { client: string; provider: string; budget: bigint; status: number; token: string }>, receipts: unknown[]) {
  const word = (v: bigint | string) => (typeof v === 'bigint' ? v.toString(16) : v.toLowerCase().replace(/^0x/, '')).padStart(64, '0');
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/api/v1/receipts') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ receipts, teamWallets: [] }));
      return;
    }
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const call = JSON.parse(body);
      const data: string = call.params[0].data;
      const id = BigInt(`0x${data.slice(10)}`).toString();
      const j = jobs[id];
      const result = data.startsWith('0x128e4d73')
        ? `0x${word(j.token)}`
        : `0x${[word(32n), word(BigInt(id)), word(j.client), word(j.provider), word(0n), word(0n), word(j.budget), word(0n), word(BigInt(j.status)), word(0n), word(0n), word(0n)].join('')}`;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const dir = mkdtempSync(join(tmpdir(), 'pokter-verifier-'));
  const script = join(dir, 'verifier.mjs');
  writeFileSync(script, RECEIPT_VERIFIER_SOURCE);
  try {
    const out = await new Promise<{ code: number | null; stdout: string }>((resolve) => {
      const child = spawn(process.execPath, [script, '--base-url', base, '--mainnet-rpc', base, '--testnet-rpc', base]);
      let stdout = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.on('close', (code) => resolve({ code, stdout }));
    });
    return { code: out.code, report: JSON.parse(out.stdout) };
  } finally {
    server.close();
  }
}

test('the verifier reads each job’s token, totals completed value per token, and flags a token mismatch', async () => {
  const client = '0x1111111111111111111111111111111111111111';
  const provider = '0x2222222222222222222222222222222222222222';
  const escrow = '0xEa4DAa3100A767e86FDed867729ae7446476EBA6';
  const receipt = (jobId: string, raw: bigint, token: string | null) => ({ chainId: 56, jobId, escrow, status: 'COMPLETED', provider, budget: { raw: raw.toString(), token }, fundedByPokter: false });
  const { code, report } = await withChain(
    {
      1: { client, provider, budget: E18, status: 3, token: U56 },
      2: { client, provider, budget: 2n * E18, status: 3, token: USDT56 },
      3: { client, provider, budget: 3n * E18, status: 3, token: USDT56 },
      4: { client, provider, budget: 5n * E18, status: 3, token: USDT56 },
    },
    [
      receipt('1', E18, U56),
      receipt('2', 2n * E18, USDT56),
      /* The index does not know this one's token: nothing claimed, nothing to disagree with. */
      receipt('3', 3n * E18, null),
      /* The index calls this USDT job $U: a disagreement. */
      receipt('4', 5n * E18, U56),
    ],
  );
  assert.equal(code, 1);
  assert.equal(report.summary.mismatched, 1);
  assert.equal(report.failures[0].receipt.jobId, '4');
  assert.equal(report.failures[0].checks.paymentToken, false);
  const totals = Object.fromEntries(report.summary.completedByToken.map((t: { chainId: number; token: string; completedValueRaw: string; completed: number }) => [`${t.chainId}:${t.token}`, t]));
  assert.equal(totals[`56:${U56.toLowerCase()}`].completedValueRaw, E18.toString());
  assert.equal(totals[`56:${USDT56.toLowerCase()}`].completedValueRaw, (5n * E18).toString());
  assert.equal(totals[`56:${USDT56.toLowerCase()}`].completed, 2);
  /* No single completed figure across tokens survives. */
  assert.equal(report.summary.byChain[0].completedValueRaw, undefined);
});

test('the kit lists the tokens Pokter funds on each escrow with their decimals, and no fixed scale', () => {
  const ESCROW = { chainId: 56, network: 'BNB Chain', commerce: '0xEa4DAa3100A767e86FDed867729ae7446476EBA6', router: '0x51895229E12F9876011789B04f8698af06cCD6DA', policy: '0x9C01845705b3078Aa2e8cfF7520a6376FD766dE5', paymentToken: U56 };
  const kit = buildIntegrationKit('https://pokter.xyz', [ESCROW]);
  assert.ok(kit.escrows[0].tokens.some((t) => t.address === U56 && t.symbol === '$U' && t.decimals === 18 && t.default));
  const price = kit.quote.fields.find((f) => f.field === 'response.terms.price')!.rule;
  assert.match(price, /own decimals/);
  assert.doesNotMatch(price, /\(18 decimals\)/);
  assert.ok(kit.quote.fields.some((f) => /preferred_currency: \{ chain_id, token \}/.test(f.rule)));

  /* With USDT hiring on, the same list carries it, with the registry's decimals. */
  const on = enabledHireTokens(`56:${USDT56}`);
  const tokens = kitTokens(56, on);
  assert.deepEqual(tokens.map((t) => [t.symbol, t.decimals]), [['$U', 18], ['USDT', 18]]);
  const withUsdt = buildIntegrationKit('https://pokter.xyz', [{ ...ESCROW, tokens }]);
  assert.deepEqual(withUsdt.escrows[0].tokens.map((t) => t.symbol), ['$U', 'USDT']);
  assert.match(tokenListText(56, on), /\$U \(0x[0-9a-fA-F]{40}, 18 decimals\) or USDT \(0x55d398326f99059fF775485246999027B3197955, 18 decimals\)/);
  assert.equal(moneyWords(56, enabledHireTokens('')), '$U');
  assert.equal(moneyWords(56, on), '$U or USDT');
});
