/**
 * The audit an unfriendly reader would run.
 *
 * Pokter's receipt index publishes a `fundedByPokter` flag and a team wallet
 * list, and invites anyone to check them. This runs that check: every indexed
 * job is re-read from its escrow, and the buyer and seller the contract names
 * are compared against what Pokter claims about the job.
 *
 * It exists because the claim it checks is the only competitive advantage
 * Pokter can prove — hires from wallets the marketplace does not control —
 * and that claim is worth exactly as much as the classification behind it.
 * Its first run found three jobs counted as outside demand whose buyer and
 * seller were the same wallet, which anyone could have found the same way.
 *
 * Exit code 1 means the published record overstates something.
 */
import { TEAM_WALLETS } from '@/lib/team/wallets';

const BASE = process.env.AUDIT_BASE_URL ?? 'https://pokter.xyz';
const RPC: Record<number, string> = {
  56: process.env.AUDIT_MAINNET_RPC ?? 'https://bsc-dataseed.bnbchain.org',
  97: process.env.AUDIT_TESTNET_RPC ?? 'https://bsc-testnet-dataseed.bnbchain.org',
};
const GET_JOB = '0xbf22c457';

interface Receipt {
  chainId: number; jobId: string; escrow: string; status: string;
  provider: string; fundedByPokter: boolean;
}

const word = (hex: string, i: number) => hex.slice(2 + i * 64, 2 + i * 64 + 64);
const addr = (hex: string, i: number) => `0x${word(hex, i).slice(24)}`.toLowerCase();

async function readJob(receipt: Receipt) {
  const id = BigInt(receipt.jobId).toString(16).padStart(64, '0');
  const response = await fetch(RPC[receipt.chainId], {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: receipt.escrow, data: `${GET_JOB}${id}` }, 'latest'] }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message ?? 'RPC error');
  const hex: string = body.result;
  /* Some deployments return the struct behind an offset word. */
  const base = BigInt(`0x${word(hex, 0)}`) === 32n ? 1 : 0;
  return { client: addr(hex, base + 1), provider: addr(hex, base + 2) };
}

const index = await fetch(new URL('/api/v1/receipts', BASE), { signal: AbortSignal.timeout(20_000) }).then((r) => r.json());
const published = new Set<string>(index.teamWallets.map((w: { address?: string } | string) => String(typeof w === 'string' ? w : w.address).toLowerCase()));
const declared = new Set(TEAM_WALLETS.map((w) => w.address.toLowerCase()));

const problems: string[] = [];

/* A wallet this repo calls Pokter's but the site does not publish would make
   the published figures unverifiable, so it is a failure even though no
   individual job is misclassified. */
for (const wallet of declared) {
  if (!published.has(wallet)) problems.push(`Team wallet ${wallet} is declared in the repo but missing from the published index.`);
}

const rows = [] as Array<Receipt & { client: string; onchainProvider: string }>;
for (const receipt of index.receipts as Receipt[]) {
  const chain = await readJob(receipt);
  rows.push({ ...receipt, client: chain.client, onchainProvider: chain.provider });
}

for (const row of rows) {
  const job = `${row.chainId}/${row.jobId}`;
  const teamFunded = published.has(row.client);
  if (teamFunded !== row.fundedByPokter) {
    problems.push(`${job}: funder ${row.client} ${teamFunded ? 'is' : 'is not'} a declared team wallet, but the index says fundedByPokter=${row.fundedByPokter}.`);
  }
  if (row.onchainProvider !== row.provider.toLowerCase()) {
    problems.push(`${job}: the index names provider ${row.provider} and the escrow names ${row.onchainProvider}.`);
  }
  if (row.client === row.onchainProvider && !row.fundedByPokter) {
    problems.push(`${job}: buyer and seller are the same wallet (${row.client}), so it must not count as outside demand.`);
  }
}

const outside = rows.filter((row) => !row.fundedByPokter && row.client !== row.onchainProvider);
const armsLength = outside.filter((row) => !published.has(row.onchainProvider));

console.log(JSON.stringify({
  observedAt: new Date().toISOString(),
  source: `${BASE}/api/v1/receipts`,
  indexed: rows.length,
  teamFunded: rows.filter((row) => row.fundedByPokter).length,
  selfHires: rows.filter((row) => row.client === row.onchainProvider).length,
  outsideDemand: { jobs: outside.length, wallets: new Set(outside.map((row) => row.client)).size },
  /* Outside money and a seller Pokter does not operate. The only figure here
     that says both the demand and the delivery were somebody else's. */
  armsLength: { jobs: armsLength.length, wallets: new Set(armsLength.map((row) => row.client)).size },
  deliveredByPokterWallet: rows.filter((row) => published.has(row.onchainProvider) && ['SUBMITTED', 'COMPLETED'].includes(row.status)).length,
  problems,
}, null, 2));

if (problems.length > 0) process.exitCode = 1;
