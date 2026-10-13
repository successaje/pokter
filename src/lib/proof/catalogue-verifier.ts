/** A dependency-free verifier for identities returned by public discovery. */
export const CATALOGUE_VERIFIER_FILENAME = 'pokter-catalogue-verifier.mjs';

export const CATALOGUE_VERIFIER_SOURCE = `#!/usr/bin/env node
const DEFAULT_BASE_URL = 'https://pokter.xyz';
const OWNER_OF_SELECTOR = '6352211e';
const REGISTRIES = {
  56: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  97: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
};
const DEFAULT_RPCS = {
  56: 'https://bsc-dataseed.bnbchain.org',
  97: 'https://bsc-testnet-dataseed.bnbchain.org',
};

const HELP = \`Usage:
  node pokter-catalogue-verifier.mjs [--base-url https://pokter.xyz]
    [--mainnet-rpc URL] [--testnet-rpc URL] [--concurrency 8]

Downloads every page of Pokter's public discovery API and checks each identity
and owner directly against its ERC-8004 registry. Declared descriptions and
Pokter measurements are counted, not promoted into on-chain facts. No wallet
is opened and no transaction is broadcast.\`;

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

function safeUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error(\`\${label} must use HTTPS.\`);
  return url.href;
}

async function json(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(\`\${url} returned HTTP \${response.status}.\`);
  return { body: await response.json(), url: response.url };
}

async function rpc(url, to, data) {
  const { body } = await json(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  if (body.error) throw new Error(body.error.message || 'RPC error');
  if (!/^0x[0-9a-f]{64}$/i.test(body.result)) throw new Error('ownerOf returned malformed data.');
  return \`0x\${body.result.slice(-40)}\`.toLowerCase();
}

async function allAgents(baseUrl) {
  const items = [];
  let total = Infinity;
  for (let offset = 0; offset < total; offset += 100) {
    const url = new URL('/api/v1/agents', baseUrl);
    url.searchParams.set('limit', '100');
    url.searchParams.set('offset', String(offset));
    const { body } = await json(url);
    if (!Array.isArray(body.items) || !Number.isInteger(body.total)) throw new Error('Discovery API schema was not recognised.');
    total = body.total;
    items.push(...body.items);
    if (body.items.length === 0 && items.length < total) throw new Error('Discovery pagination ended before its declared total.');
  }
  if (items.length !== total) throw new Error(\`Discovery declared \${total} agents but returned \${items.length}.\`);
  return items;
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

async function verify(agent, rpcs) {
  const key = \`\${agent.chainId}:\${agent.tokenId}\`;
  try {
    const registry = REGISTRIES[agent.chainId];
    const claimedOwner = agent.owner?.value;
    if (!registry || !rpcs[agent.chainId]) throw new Error('Unsupported registry network.');
    if (!/^\\d+$/.test(String(agent.tokenId))) throw new Error('Invalid token id.');
    if (!/^0x[0-9a-f]{40}$/i.test(String(claimedOwner))) throw new Error('Discovery did not publish a valid owner.');
    const token = BigInt(agent.tokenId).toString(16).padStart(64, '0');
    const owner = await rpc(rpcs[agent.chainId], registry, \`0x\${OWNER_OF_SELECTOR}\${token}\`);
    return { key, ok: owner === claimedOwner.toLowerCase(), claimedOwner, owner };
  } catch (error) {
    return { key, ok: false, error: error instanceof Error ? error.message : 'Verification failed' };
  }
}

const args = argumentsOf(process.argv.slice(2));
if (args.help) { console.log(HELP); process.exit(0); }
const baseUrl = safeUrl(args['base-url'] || DEFAULT_BASE_URL, '--base-url');
const concurrency = Number(args.concurrency || 8);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) throw new Error('--concurrency must be 1..20.');
const rpcs = {
  56: safeUrl(args['mainnet-rpc'] || DEFAULT_RPCS[56], '--mainnet-rpc'),
  97: safeUrl(args['testnet-rpc'] || DEFAULT_RPCS[97], '--testnet-rpc'),
};
const agents = await allAgents(baseUrl);
const keys = agents.map((agent) => \`\${agent.chainId}:\${agent.tokenId}\`);
const duplicateKeys = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
const rows = await mapConcurrent(agents, concurrency, (agent) => verify(agent, rpcs));
const failures = rows.filter((row) => !row.ok);
const report = {
  observedAt: new Date().toISOString(),
  source: new URL('/api/v1/agents', baseUrl).href,
  summary: {
    returned: agents.length,
    identitiesVerified: rows.length - failures.length,
    mismatched: failures.length,
    duplicateKeys,
    byChain: [56, 97].map((chainId) => ({ chainId, returned: agents.filter((agent) => agent.chainId === chainId).length })),
    claims: {
      declaredDescriptions: agents.filter((agent) => agent.description?.provenance === 'declared').length,
      pokterMeasuredAvailability: agents.filter((agent) => agent.availability?.provenance === 'pokter-measured').length,
      signedPrices: agents.filter((agent) => agent.price?.value !== null).length,
    },
  },
  note: 'Identity and owner are checked on-chain. Descriptions remain operator declarations; availability remains Pokter-measured; signed-price validity is exposed by the API but is not reverified by this script.',
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0 || duplicateKeys.length > 0) process.exitCode = 1;
`;

export function catalogueVerifierResponse(): Response {
  return new Response(CATALOGUE_VERIFIER_SOURCE, {
    headers: {
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
      'content-disposition': `attachment; filename="${CATALOGUE_VERIFIER_FILENAME}"`,
      'content-type': 'text/javascript; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}
