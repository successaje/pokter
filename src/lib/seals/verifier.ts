/**
 * Dependency-free seal verifier.
 *
 * It recomputes every hash from the exact published bytes, reads the
 * anchoring transaction off the chain, and reports any seal whose
 * document, hash or block timestamp disagree — then prints what Pokter
 * changed between its oldest and newest seal.
 *
 * keccak256 is implemented inline rather than imported. Node ships
 * SHA3-256, which is a different function: same permutation, different
 * padding, different digest. Pulling a package instead would mean a
 * reader checking whether Pokter can be trusted had to first trust
 * somebody else's npm tarball, which rather gives the game away.
 */
export const SEAL_VERIFIER_FILENAME = 'pokter-seal-verifier.mjs';

export const SEAL_VERIFIER_SOURCE = `#!/usr/bin/env node
const DEFAULT_BASE_URL = 'https://pokter.xyz';
const DEFAULT_RPCS = {
  56: 'https://bsc-dataseed.bnbchain.org',
  97: 'https://bsc-testnet-dataseed.bnbchain.org',
};

const HELP = \`Usage:
  node pokter-seal-verifier.mjs [--base-url https://pokter.xyz]
    [--mainnet-rpc URL] [--testnet-rpc URL] [--limit 30]

Downloads Pokter's seals, recomputes each hash from the exact published
bytes, and checks it against the calldata and block of its anchoring
transaction. Prints what changed between the oldest and newest seal.
Never signs or broadcasts anything. Exit code 1 means a seal failed.\`;

/* ---- keccak256 (Keccak-f[1600], rate 136, padding 0x01..0x80) ---- */

const MASK = (1n << 64n) - 1n;
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROTC = [1n,3n,6n,10n,15n,21n,28n,36n,45n,55n,2n,14n,27n,41n,56n,8n,25n,43n,62n,18n,39n,61n,20n,44n];
const PILN = [10,7,11,17,18,3,5,16,8,21,24,4,15,23,19,13,12,2,20,14,22,9,6,1];

const rotl = (x, n) => ((x << n) | (x >> (64n - n))) & MASK;

function keccakF(A) {
  const bc = new Array(5);
  for (let round = 0; round < 24; round += 1) {
    for (let i = 0; i < 5; i += 1) bc[i] = A[i] ^ A[i + 5] ^ A[i + 10] ^ A[i + 15] ^ A[i + 20];
    for (let i = 0; i < 5; i += 1) {
      const t = bc[(i + 4) % 5] ^ rotl(bc[(i + 1) % 5], 1n);
      for (let j = 0; j < 25; j += 5) A[j + i] ^= t;
    }
    let t = A[1];
    for (let i = 0; i < 24; i += 1) {
      const j = PILN[i];
      const tmp = A[j];
      A[j] = rotl(t, ROTC[i]);
      t = tmp;
    }
    for (let j = 0; j < 25; j += 5) {
      for (let i = 0; i < 5; i += 1) bc[i] = A[j + i];
      for (let i = 0; i < 5; i += 1) A[j + i] ^= (~bc[(i + 1) % 5] & MASK) & bc[(i + 2) % 5];
    }
    A[0] ^= RC[round];
  }
}

function keccak256(bytes) {
  const RATE = 136;
  const A = new Array(25).fill(0n);
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / RATE) * RATE);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  for (let offset = 0; offset < padded.length; offset += RATE) {
    for (let lane = 0; lane < RATE / 8; lane += 1) {
      let value = 0n;
      for (let byte = 7; byte >= 0; byte -= 1) {
        value = (value << 8n) | BigInt(padded[offset + lane * 8 + byte]);
      }
      A[lane] ^= value;
    }
    keccakF(A);
  }

  let out = '0x';
  for (let lane = 0; lane < 4; lane += 1) {
    let value = A[lane];
    for (let byte = 0; byte < 8; byte += 1) {
      out += (value & 0xffn).toString(16).padStart(2, '0');
      value >>= 8n;
    }
  }
  return out;
}

/* ---- the check ---- */

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

async function verify(seal, rpcs) {
  const problems = [];
  const response = await fetch(seal.document, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    return { hash: seal.hash, ok: false, problems: [\`document HTTP \${response.status}\`] };
  }
  /* The bytes as served. Parsing and re-serialising here would hash a
     different document and blame Pokter for it. */
  const text = await response.text();
  const recomputed = keccak256(new TextEncoder().encode(text));
  if (recomputed.toLowerCase() !== seal.hash.toLowerCase()) {
    problems.push(\`document hashes to \${recomputed}, not \${seal.hash}\`);
  }

  if (!seal.anchor) {
    problems.push('no anchoring transaction, so nothing fixes when this was published');
    return { hash: seal.hash, ok: false, problems, claims: seal.claims };
  }

  const url = rpcs[seal.anchor.chainId];
  if (!url) {
    problems.push(\`no RPC configured for chain \${seal.anchor.chainId}\`);
    return { hash: seal.hash, ok: false, problems, claims: seal.claims };
  }

  const tx = await rpc(url, 'eth_getTransactionByHash', [seal.anchor.transactionHash]);
  if (!tx) {
    problems.push('anchoring transaction not found on chain');
  } else {
    if (String(tx.input).toLowerCase() !== seal.hash.toLowerCase()) {
      problems.push(\`transaction carries \${tx.input}, not the seal hash\`);
    }
    const block = await rpc(url, 'eth_getBlockByNumber', [tx.blockNumber, false]);
    const onChain = new Date(Number(BigInt(block.timestamp)) * 1000).toISOString();
    const claimed = new Date(seal.anchor.blockTime).toISOString();
    if (onChain !== claimed) {
      problems.push(\`block says \${onChain}, the index says \${claimed}\`);
    }
    /* The seal must be written down no later than the block that fixes
       it; a document dated after its own anchor was edited afterwards. */
    if (new Date(seal.sealedAt).getTime() > new Date(onChain).getTime() + 3_600_000) {
      problems.push(\`sealedAt \${seal.sealedAt} is more than an hour after its own anchor\`);
    }
  }

  return { hash: seal.hash, ok: problems.length === 0, problems, claims: seal.claims, sealedAt: seal.sealedAt };
}

function diff(earlier, later) {
  const key = (c) => \`\${c.chainId}:\${c.tokenId}\`;
  const before = new Map(earlier.claims.map((c) => [key(c), c]));
  const changed = [];
  for (const now of later.claims) {
    const then = before.get(key(now));
    if (!then) continue;
    for (const field of Object.keys(now)) {
      if (field === 'chainId' || field === 'tokenId') continue;
      const a = JSON.stringify(then[field] ?? null);
      const b = JSON.stringify(now[field] ?? null);
      if (a !== b) changed.push({ agent: key(now), field, before: then[field], after: now[field] });
    }
  }
  return changed;
}

const args = argumentsOf(process.argv.slice(2));
if (args.help) { console.log(HELP); process.exit(0); }
const baseUrl = new URL(args['base-url'] || DEFAULT_BASE_URL);
const limit = Number(args.limit || 30);
const rpcs = {
  56: rpcUrl(args['mainnet-rpc'] || DEFAULT_RPCS[56], '--mainnet-rpc'),
  97: rpcUrl(args['testnet-rpc'] || DEFAULT_RPCS[97], '--testnet-rpc'),
};

const indexUrl = new URL('/api/v1/seals', baseUrl);
indexUrl.searchParams.set('limit', String(limit));
const index = await fetch(indexUrl, { signal: AbortSignal.timeout(20_000) }).then((r) => r.json());
if (!Array.isArray(index.seals)) throw new Error('Seal index schema was not recognised.');

const rows = [];
for (const seal of index.seals) rows.push(await verify(seal, rpcs));

const failed = rows.filter((row) => !row.ok);
const report = {
  observedAt: new Date().toISOString(),
  source: indexUrl.href,
  summary: { seals: rows.length, verified: rows.length - failed.length, failed: failed.length },
  failures: failed,
};

/* What actually changed, which is the reason to keep seals at all. */
const anchored = index.seals.filter((s) => s.anchor);
if (anchored.length >= 2) {
  const oldest = anchored[anchored.length - 1];
  const newest = anchored[0];
  const [a, b] = await Promise.all([
    fetch(oldest.document).then((r) => r.json()),
    fetch(newest.document).then((r) => r.json()),
  ]);
  const changes = diff(a, b);
  report.revisions = {
    from: { hash: oldest.hash, sealedAt: oldest.sealedAt },
    to: { hash: newest.hash, sealedAt: newest.sealedAt },
    changed: changes.length,
    sample: changes.slice(0, 20),
  };
}

console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) process.exitCode = 1;
`;

export function sealVerifierResponse(): Response {
  return new Response(SEAL_VERIFIER_SOURCE, {
    headers: {
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
      'content-disposition': `attachment; filename="${SEAL_VERIFIER_FILENAME}"`,
      'content-type': 'text/javascript; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}
