/**
 * A dependency-free Node.js evaluator that anybody can inspect before running.
 * It prepares an ERC-8004 feedback payload but never opens or signs with a wallet.
 */
export const EVALUATOR_STARTER_FILENAME = 'pokter-evaluator-starter.mjs';

export const EVALUATOR_STARTER_SOURCE = `#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

const REGISTRIES = {
  56: {
    identity: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    reputation: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  },
  97: {
    identity: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    reputation: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
  },
};
const MAX_RESPONSE_BYTES = 256 * 1024;

const HELP = \`Usage:
  node pokter-evaluator-starter.mjs --chain 56 --agent 372022 \\\\
    --endpoint https://agent.example/.well-known/agent-card.json \\\\
    --protocol a2a --samples 10 --interval-ms 60000 \\\\
    --vantage "Lagos, residential ISP"

Required:
  --chain       56 or 97
  --agent       ERC-8004 token id
  --endpoint    Public HTTPS A2A card or MCP endpoint
  --protocol    a2a or mcp
  --vantage     Honest description of where these requests originate

Optional:
  --samples       2..1000 (default 10)
  --interval-ms   Delay between probes (default 0)
  --timeout-ms    Per-request timeout (default 10000)
  --label         Public evaluator label (display only)
  --out           Output JSON path

This script never signs or broadcasts a transaction.\`;

function argumentsOf(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(\`Unexpected argument: \${key}\`);
    if (key === '--help') return { help: true };
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(\`Missing value for \${key}\`);
    values[key.slice(2)] = value;
    index += 1;
  }
  return values;
}

function integer(value, label, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(\`\${label} must be an integer from \${minimum} to \${maximum}.\`);
  }
  return parsed;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function asObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}

async function readJson(response) {
  const announced = Number(response.headers.get('content-length') ?? 0);
  if (announced > MAX_RESPONSE_BYTES) throw new Error('Response is larger than 256 KiB');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body was empty');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Response is larger than 256 KiB');
    }
    chunks.push(value);
  }
  const text = new TextDecoder().decode(chunks.length === 1 ? chunks[0] : Buffer.concat(chunks));
  const payload = response.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\\n').find((line) => line.startsWith('data:'))?.slice(5).trim()
    : text;
  if (!payload) throw new Error('Response body was empty');
  return JSON.parse(payload);
}

async function probe(endpoint, protocol, timeoutMs) {
  const started = Date.now();
  try {
    const response = await fetch(endpoint, protocol === 'mcp' ? {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'independent-evaluator', method: 'tools/list', params: {} }),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    } : {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) return { ok: false, status: response.status, latencyMs, at: new Date().toISOString() };
    const body = asObject(await readJson(response));
    const result = asObject(body?.result);
    const valid = protocol === 'mcp'
      ? body?.jsonrpc === '2.0' && Array.isArray(result?.tools)
      : typeof body?.name === 'string' && typeof body?.url === 'string' &&
        typeof body?.protocolVersion === 'string' && Array.isArray(body?.skills);
    return { ok: valid, status: response.status, latencyMs, at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, status: null, latencyMs: null, at: new Date().toISOString(), error: error instanceof Error ? error.message : 'Request failed' };
  }
}

const args = argumentsOf(process.argv.slice(2));
if (args.help) {
  console.log(HELP);
  process.exit(0);
}

const chainId = integer(args.chain, '--chain', 1, 100000);
const registry = REGISTRIES[chainId];
if (!registry) throw new Error('--chain must be 56 or 97.');
const agentId = integer(args.agent, '--agent', 0, Number.MAX_SAFE_INTEGER);
const samples = integer(args.samples ?? '10', '--samples', 2, 1000);
const intervalMs = integer(args['interval-ms'] ?? '0', '--interval-ms', 0, 86_400_000);
const timeoutMs = integer(args['timeout-ms'] ?? '10000', '--timeout-ms', 1000, 60_000);
const protocol = args.protocol;
if (protocol !== 'a2a' && protocol !== 'mcp') throw new Error('--protocol must be a2a or mcp.');
if (!args.vantage?.trim()) throw new Error('--vantage is required. Describe the probe location honestly.');
if (!args.endpoint) throw new Error('--endpoint is required.');
const endpoint = new URL(args.endpoint);
if (endpoint.protocol !== 'https:') throw new Error('--endpoint must use HTTPS.');

const startedAt = new Date();
const observations = [];
for (let index = 0; index < samples; index += 1) {
  observations.push(await probe(endpoint.href, protocol, timeoutMs));
  if (index + 1 < samples && intervalMs > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
const completedAt = new Date();
const answered = observations.filter((item) => item.ok).length;
const successfulLatencies = observations.filter((item) => item.ok && item.latencyMs !== null).map((item) => item.latencyMs);
const value = String(Math.round((answered / samples) * 10_000));
const valueDecimals = 2;
const elapsedDays = (completedAt.getTime() - startedAt.getTime()) / 86_400_000;
const label = args.label?.trim() || 'Independent evaluator';

const attestation = {
  agentRegistry: \`eip155:\${chainId}:\${registry.identity}\`,
  agentId,
  createdAt: completedAt.toISOString(),
  value,
  valueDecimals,
  tag1: 'uptime',
  tag2: \`\${Number(elapsedDays.toFixed(4))}d\`,
  endpoint: endpoint.href,
  reasoning: \`\${answered} of \${samples} protocol-valid capability handshakes succeeded.\`,
  method: {
    measuredBy: label,
    protocol,
    probes: samples,
    answered,
    windowDays: Number(elapsedDays.toFixed(8)),
    medianMs: median(successfulLatencies),
    vantage: args.vantage.trim(),
    knownDefects: [
      'A single vantage point cannot detect region-specific availability.',
      'Reachability from this evaluator is not global availability.',
      'A valid capability handshake proves protocol reachability, not task correctness.',
      intervalMs === 0 ? 'Samples were taken consecutively rather than across a sustained schedule.' : \`Samples were spaced \${intervalMs}ms apart.\`,
    ],
  },
};

const feedbackUri = \`data:application/json;base64,\${Buffer.from(JSON.stringify(attestation)).toString('base64')}\`;
const zeroHash = \`0x\${'0'.repeat(64)}\`;
const publication = {
  chainId,
  contract: registry.reputation,
  functionName: 'giveFeedback',
  abi: 'giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)',
  args: [String(agentId), value, valueDecimals, attestation.tag1, attestation.tag2, endpoint.href, feedbackUri, zeroHash],
  note: 'Review every field, then submit this call from the evaluator wallet. The transaction sender—not method.measuredBy—is the evaluator identity.',
};
const output = { attestation, publication, observations };
const outputPath = args.out || \`evaluator-attestation-\${chainId}-\${agentId}.json\`;
await writeFile(outputPath, \`\${JSON.stringify(output, null, 2)}\\n\`, { flag: 'wx' });
console.log(\`Wrote \${outputPath}. No transaction was signed or broadcast.\`);
console.log(\`Result: \${answered}/\${samples} valid handshakes (\${(answered / samples * 100).toFixed(2)}%).\`);
console.log('Inspect publication.args before submitting giveFeedback from the evaluator wallet.');
`;
