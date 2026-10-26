/**
 * Confirms a rehearsal hire against chain state, read-only.
 *
 * After each stage of the wallet rehearsal (docs/release/hire-tokens.md,
 * section 9), this reads the job from the escrow itself and compares it with
 * what was agreed and with what Pokter says about it:
 *
 * - the escrow: client, provider, status, budget (raw), `jobPaymentToken`,
 *   `expiredAt`;
 * - the expectation: the token address and raw amount the agent signed;
 * - Pokter's job route (`/api/jobs/<id>`) and receipt (`/api/v1/receipts`):
 *   the same job id, token and raw amount, never relabelled.
 *
 * Nothing is signed, sent or approved.
 *
 *   ORIGIN=https://pokter-staging.fly.dev npx tsx scripts/rehearsal-verify.mts \
 *     --chain 97 --job <id> --currency <token address> --amount <raw> --buyer <address> --provider <address> \
 *     [--status FUNDED|SUBMITTED|COMPLETED|REJECTED|EXPIRED]
 */
import { createPublicClient, erc20Abi, getAddress, http, parseAbi, type Address } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const chainId = Number(arg('chain'));
const jobId = arg('job');
const token = arg('currency');
const amount = arg('amount');
const buyer = arg('buyer');
const provider = arg('provider');
const status = arg('status');
const origin = process.env.ORIGIN;
if ((chainId !== 56 && chainId !== 97) || !jobId || !/^\d+$/.test(jobId) || !token || !amount || !/^\d+$/.test(amount) || !buyer || !provider) {
  console.error('Usage: rehearsal-verify.mts --chain 56|97 --job <id> --currency <token address> --amount <raw> --buyer <address> --provider <address> [--status NAME]');
  process.exit(2);
}

/* The deployed escrows, as `erc8183Addresses` lists them (the SDK cannot load in this runner). */
const COMMERCE: Record<number, Address> = {
  56: '0xEa4DAa3100A767e86FDed867729ae7446476EBA6',
  97: '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE',
};
const STATUS = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'];
const abi = parseAbi([
  'function jobPaymentToken(uint256) view returns (address)',
  'function getJob(uint256) view returns ((uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook, uint256 submittedAt, bytes32 deliverable))',
]);
const read = createPublicClient({ chain: chainId === 56 ? bsc : bscTestnet, transport: http(chainId === 56 ? 'https://bsc-rpc.publicnode.com' : 'https://bsc-testnet-rpc.publicnode.com') });

const results: Array<{ check: string; ok: boolean; detail: string }> = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ check: name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const same = (a: string | null | undefined, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

const commerce = COMMERCE[chainId];
const job = await read.readContract({ address: commerce, abi, functionName: 'getJob', args: [BigInt(jobId)] });
const bound = await read.readContract({ address: commerce, abi, functionName: 'jobPaymentToken', args: [BigInt(jobId)] });
const head = await read.getBlock({ blockTag: 'latest' });
console.log(`chain ${chainId}, escrow ${commerce}, job ${jobId}, at block ${head.number}`);

check('the job exists and belongs to the buyer', same(job.client, buyer), job.client);
check('its provider is the agent that signed', same(job.provider, provider), job.provider);
check('the escrow binds it to the signed token', same(bound, token), bound);
check('its budget is exactly the signed amount', job.budget.toString() === amount, `${job.budget} base units`);
check(`status${status ? ` is ${status}` : ''}`, status ? STATUS[job.status] === status : true, STATUS[job.status] ?? String(job.status));
check('its deadline is in the future while funded', STATUS[job.status] !== 'FUNDED' || job.expiredAt > head.timestamp, new Date(Number(job.expiredAt) * 1000).toISOString());
const symbol = await read.readContract({ address: getAddress(token), abi: erc20Abi, functionName: 'symbol' }).catch(() => '?');
const escrowHeld = await read.readContract({ address: getAddress(token), abi: erc20Abi, functionName: 'balanceOf', args: [commerce] });
console.log(`  token ${symbol} ${getAddress(token)}; the escrow holds ${escrowHeld} base units of it across all jobs`);
const allowance = await read.readContract({ address: getAddress(token), abi: erc20Abi, functionName: 'allowance', args: [getAddress(buyer), commerce] });
check('no allowance is left behind once funded', STATUS[job.status] === 'OPEN' || allowance === 0n, `${allowance}`);

if (origin) {
  const view = (await fetch(new URL(`/api/jobs/${jobId}?chain=${chainId}`, origin)).then((r) => r.json()).catch(() => null)) as Record<string, unknown> | null;
  const record = (view?.job ?? view) as Record<string, unknown> | null;
  check('Pokter’s job route names the same token', same(record?.paymentToken as string | undefined, token), String(record?.paymentToken));
  check('… and the same raw amount', String(record?.budgetRaw) === amount, String(record?.budgetRaw));
  check('… and the same status as the escrow', record?.status === STATUS[job.status], String(record?.status));
  const receipts = (await fetch(new URL(`/api/v1/receipts?chain=${chainId}`, origin)).then((r) => r.json()).catch(() => null)) as { receipts?: Array<Record<string, unknown>> } | Array<Record<string, unknown>> | null;
  const list = Array.isArray(receipts) ? receipts : receipts?.receipts ?? [];
  const receipt = list.find((r) => String(r.jobId) === jobId && Number(r.chainId ?? chainId) === chainId);
  if (receipt) {
    const budget = receipt.budget as { raw?: string; token?: string | null; symbol?: string | null } | undefined;
    check('the receipt names the same job, token and raw amount', String(budget?.raw) === amount && same(budget?.token ?? null, token), `${budget?.raw} ${budget?.symbol} ${budget?.token}`);
  } else {
    check('a receipt is published for the job', false, 'not in /api/v1/receipts yet (receipts list settled jobs)');
  }
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} check(s) failed.` : `\nAll ${results.length} checks passed. Nothing was signed or sent.`);
process.exit(failed.length ? 1 : 0);
