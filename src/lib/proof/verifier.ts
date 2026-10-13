/**
 * Dependency-free receipt verifier. It treats Pokter's ledger as an index and
 * the escrow contracts as the authority, then reports every disagreement.
 */
export const RECEIPT_VERIFIER_FILENAME = 'pokter-receipt-verifier.mjs';

export const RECEIPT_VERIFIER_SOURCE = `#!/usr/bin/env node
const DEFAULT_BASE_URL = 'https://pokter.xyz';
const GET_JOB_SELECTOR = 'bf22c457';
const STATUS = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'];
const DEFAULT_RPCS = {
  56: 'https://bsc-dataseed.bnbchain.org',
  97: 'https://bsc-testnet-dataseed.bnbchain.org',
};

const HELP = \`Usage:
  node pokter-receipt-verifier.mjs [--base-url https://pokter.xyz]
    [--mainnet-rpc URL] [--testnet-rpc URL] [--concurrency 6]

Downloads Pokter's receipt index, reads each job from its ERC-8183 escrow,
and recomputes status, provider, budget and funding provenance. It never signs
or broadcasts a transaction. Exit code 1 means at least one row disagreed.\`;

function argumentsOf(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--help') return { help: true };
    if (!key.startsWith('--')) throw new Error(\`Unexpected argument: \${key}\`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(\`Missing value for \${key}\`);
    values[key.slice(2)] = value;
    index += 1;
  }
  return values;
}

function rpcUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error(\`\${label} must use HTTPS.\`);
  }
  return url.href;
}

function word(hex, index) {
  const start = 2 + index * 64;
  const value = hex.slice(start, start + 64);
  if (value.length !== 64) throw new Error('RPC returned a truncated getJob result.');
  return value;
}

function address(hex, index) {
  return \`0x\${word(hex, index).slice(24)}\`.toLowerCase();
}

function decodeJob(hex) {
  if (!/^0x[0-9a-f]+$/i.test(hex)) throw new Error('RPC returned invalid hex.');
  const base = BigInt(\`0x\${word(hex, 0)}\`) === 32n ? 1 : 0;
  const statusIndex = Number(BigInt(\`0x\${word(hex, base + 7)}\`));
  return {
    client: address(hex, base + 1),
    provider: address(hex, base + 2),
    budgetRaw: BigInt(\`0x\${word(hex, base + 5)}\`).toString(),
    status: STATUS[statusIndex] ?? \`UNKNOWN_\${statusIndex}\`,
  };
}

async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(\`RPC HTTP \${response.status}\`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || 'RPC error');
  return body.result;
}

async function verify(receipt, team, rpcs) {
  try {
    const id = BigInt(receipt.jobId).toString(16).padStart(64, '0');
    const result = await rpc(rpcs[receipt.chainId], 'eth_call', [{
      to: receipt.escrow,
      data: \`0x\${GET_JOB_SELECTOR}\${id}\`,
    }, 'latest']);
    const chain = decodeJob(result);
    const derivedTeam = team.has(chain.client);
    const checks = {
      status: chain.status === receipt.status,
      provider: chain.provider === String(receipt.provider).toLowerCase(),
      budget: chain.budgetRaw === receipt.budget.raw,
      fundingProvenance: derivedTeam === receipt.fundedByPokter,
    };
    return { receipt, chain, derivedTeam, checks, ok: Object.values(checks).every(Boolean) };
  } catch (error) {
    return { receipt, ok: false, error: error instanceof Error ? error.message : 'Verification failed' };
  }
}

async function mapConcurrent(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

function summarize(rows) {
  const valid = rows.filter((row) => row.ok);
  const byChain = [56, 97].map((chainId) => {
    const chain = valid.filter((row) => row.receipt.chainId === chainId);
    const completed = chain.filter((row) => row.chain.status === 'COMPLETED');
    return {
      chainId,
      verified: chain.length,
      completed: completed.length,
      completedValueRaw: completed.reduce((sum, row) => sum + BigInt(row.chain.budgetRaw), 0n).toString(),
      outsideTeam: chain.filter((row) => !row.derivedTeam).length,
      team: chain.filter((row) => row.derivedTeam).length,
    };
  });
  return { indexed: rows.length, verified: valid.length, mismatched: rows.length - valid.length, byChain };
}

const args = argumentsOf(process.argv.slice(2));
if (args.help) { console.log(HELP); process.exit(0); }
const baseUrl = new URL(args['base-url'] || DEFAULT_BASE_URL);
const concurrency = Number(args.concurrency || 6);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) throw new Error('--concurrency must be 1..20.');
const rpcs = {
  56: rpcUrl(args['mainnet-rpc'] || DEFAULT_RPCS[56], '--mainnet-rpc'),
  97: rpcUrl(args['testnet-rpc'] || DEFAULT_RPCS[97], '--testnet-rpc'),
};
const response = await fetch(new URL('/api/v1/receipts', baseUrl), { signal: AbortSignal.timeout(20_000) });
if (!response.ok) throw new Error(\`Receipt index returned HTTP \${response.status}.\`);
const ledger = await response.json();
if (!Array.isArray(ledger.receipts) || !Array.isArray(ledger.teamWallets)) throw new Error('Receipt index schema was not recognised.');
const team = new Set(ledger.teamWallets.map((wallet) => String(wallet.address ?? wallet).toLowerCase()));
const rows = await mapConcurrent(ledger.receipts, concurrency, (receipt) => verify(receipt, team, rpcs));
const report = { observedAt: new Date().toISOString(), source: response.url, summary: summarize(rows), failures: rows.filter((row) => !row.ok) };
console.log(JSON.stringify(report, null, 2));
if (report.summary.mismatched > 0) process.exitCode = 1;
`;

export function receiptVerifierResponse(): Response {
  return new Response(RECEIPT_VERIFIER_SOURCE, {
    headers: {
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
      'content-disposition': `attachment; filename="${RECEIPT_VERIFIER_FILENAME}"`,
      'content-type': 'text/javascript; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}
