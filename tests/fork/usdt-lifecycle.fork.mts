/**
 * The USDT job lifecycle against the deployed BNB Testnet escrow, on a local
 * fork. Nothing is broadcast: anvil forks the chain into this machine, the
 * accounts are impersonated, and the fork is thrown away at the end.
 *
 * It drives Pokter's own encoder (`buildTokenHireCalls`) and Pokter's own
 * job-id parser (`jobCreatedFromReceipt`), so what passes here is the code a
 * buyer's wallet would sign, against the contracts that would run it.
 *
 * Run: npx tsx tests/fork/usdt-lifecycle.fork.mts
 * Needs anvil (Foundry). Not part of `npm test`, because it needs the network
 * to fork from.
 */
import { spawn } from 'node:child_process';

import {
  createTestClient, encodeFunctionData, erc20Abi, getAddress, http, keccak256,
  pad, parseAbi, toHex, publicActions, walletActions, type Address, type Hex,
} from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { buildTokenHireCalls, COMMERCE_TOKEN_ABI } from '../../src/lib/erc8183/hire-calls';
import { jobCreatedFromReceipt } from '../../src/lib/wallet/external-receipt';
import { checkPurchaseIntent } from '../../src/lib/hire/purchase-intent';

/* FORK_CHAIN=56 forks BNB Chain mainnet instead: the real escrow, real USDT, still nothing broadcast. */
const CHAIN = process.env.FORK_CHAIN === '56' ? 56 : 97;
const FORK_URL = process.env.FORK_URL ?? (CHAIN === 56 ? 'https://bsc-dataseed.bnbchain.org' : 'https://bsc-testnet-rpc.publicnode.com');
const PORT = 8547;
const RPC = `http://127.0.0.1:${PORT}`;

const A = CHAIN === 56
  ? {
      commerce: getAddress('0xEa4DAa3100A767e86FDed867729ae7446476EBA6'),
      router: getAddress('0x51895229E12F9876011789B04f8698af06cCD6DA'),
      policy: getAddress('0x9C01845705b3078Aa2e8cfF7520a6376FD766dE5'),
      paymentToken: getAddress('0xcE24439F2D9C6a2289F741120FE202248B666666'),
    }
  : {
      commerce: getAddress('0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE'),
      router: getAddress('0xD7d36D66d2F1B608A0F943f722D27e3744f66F25'),
      policy: getAddress('0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA'),
      paymentToken: getAddress('0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565'),
    };
const USDT = getAddress(CHAIN === 56 ? '0x55d398326f99059fF775485246999027B3197955' : '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd');
const BUYER = getAddress('0x00000000000000000000000000000000b0b0b0b0');
/* Pokter Evidence's registered wallet, as the provider of every job here. */
const PROVIDER = getAddress('0x93847647d7eb72a69E162117df6a8697dF53EDda');
const BUDGET = 100_000_000_000_000_000n; // 0.1 USDT, the Evidence agent's price

const COMMERCE = parseAbi([
  'function getJob(uint256) view returns ((uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook, uint256 submittedAt, bytes32 deliverable))',
  'function jobCounter() view returns (uint256)',
  'function submit(uint256 jobId, bytes32 deliverable, bytes optParams)',
  'function claimRefund(uint256 jobId)',
  'function platformFeeBP() view returns (uint256)',
  'function platformTreasury() view returns (address)',
]);
const ROUTER = parseAbi(['function settle(uint256 jobId, bytes evidence)']);
const POLICY = parseAbi([
  'function disputeWindow() view returns (uint64)',
  'function dispute(uint256 jobId)',
  'function voteReject(uint256 jobId)',
  'function addVoter(address voter)',
  'function admin() view returns (address)',
  'function voteQuorum() view returns (uint16)',
  'function isVoter(address) view returns (bool)',
]);
const STATUS = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'];
const TOKEN_BOUND = keccak256(toHex('JobPaymentTokenBound(uint256,address)'));

const results: Array<{ step: string; ok: boolean; detail: string }> = [];
const note = (step: string, ok: boolean, detail = '') => {
  results.push({ step, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${step}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  const anvil = spawn('anvil', ['--fork-url', FORK_URL, '--port', String(PORT), '--chain-id', String(CHAIN), '--auto-impersonate', '--silent'], { stdio: 'ignore' });
  try {
    const client = createTestClient({ chain: CHAIN === 56 ? bsc : bscTestnet, mode: 'anvil', transport: http(RPC) }).extend(publicActions).extend(walletActions);
    for (let i = 0; i < 60; i++) {
      try {
        await client.getBlockNumber();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    const forkBlock = await client.getBlockNumber();
    console.log(`forked ${CHAIN === 56 ? 'BNB Chain mainnet' : 'BNB Testnet'} at block ${forkBlock}`);

    await client.setBalance({ address: BUYER, value: 10n ** 18n });
    await client.setBalance({ address: PROVIDER, value: 10n ** 18n });
    await dealUsdt(client as unknown as Storage, BUYER, 10n ** 18n);
    const balance = (who: Address, token: Address = USDT) => client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [who] });
    const job = async (id: bigint) => client.readContract({ address: A.commerce, abi: COMMERCE, functionName: 'getJob', args: [id] });
    const send = async (from: Address, to: Address, data: Hex) => {
      const hash = await client.sendTransaction({ account: from, to, data, chain: null });
      return client.waitForTransactionReceipt({ hash });
    };
    const reverts = async (from: Address, to: Address, data: Hex) => {
      try {
        await client.call({ account: from, to, data });
        return null;
      } catch (error) {
        return (error as Error).message.split('\n')[0];
      }
    };
    const windowSeconds = Number(await client.readContract({ address: A.policy, abi: POLICY, functionName: 'disputeWindow' }));
    const feeBp = await client.readContract({ address: A.commerce, abi: COMMERCE, functionName: 'platformFeeBP' }).catch(() => 0n);
    console.log(`dispute window ${windowSeconds}s, platform fee ${feeBp} bp`);

    /** Create, register and budget a USDT job with Pokter's encoder, the way the browser path does when calls are sent one by one. */
    const createUsdtJob = async (deliverySeconds: number) => {
      const now = BigInt((await client.getBlock()).timestamp);
      const expiredAt = now + BigInt(deliverySeconds + windowSeconds);
      const counter = await client.readContract({ address: A.commerce, abi: COMMERCE, functionName: 'jobCounter' });
      const predicted = buildTokenHireCalls({ chainId: CHAIN, addresses: A, jobId: counter + 1n, provider: PROVIDER, description: 'usdt fork rehearsal', budget: BUDGET, expiredAt, token: USDT, usdt: true });
      const created = await send(BUYER, predicted[0].to, predicted[0].data);
      const jobId = jobCreatedFromReceipt(created, A.commerce, BUYER, PROVIDER);
      const bound = created.logs.find((l) => l.topics[0] === TOKEN_BOUND);
      const calls = buildTokenHireCalls({ chainId: CHAIN, addresses: A, jobId, provider: PROVIDER, description: 'usdt fork rehearsal', budget: BUDGET, expiredAt, token: USDT, usdt: true });
      await send(BUYER, calls[1].to, calls[1].data);
      await send(BUYER, calls[2].to, calls[2].data);
      /* The token is an indexed topic or the data word, whichever the event declares. */
      const word = bound ? (bound.topics[2] ?? (bound.data.length >= 66 ? bound.data.slice(0, 66) : null)) : null;
      return { jobId, calls, expiredAt, boundToken: word ? getAddress(`0x${word.slice(-40)}`) : null, boundTopic: bound?.topics };
    };
    const fund = async (calls: { to: Address; data: Hex }[]) => {
      await send(BUYER, calls[3].to, calls[3].data);
      return send(BUYER, calls[4].to, calls[4].data);
    };

    // 1. Funding, and the job is bound to USDT.
    {
      const before = await balance(BUYER);
      const escrowBefore = await balance(A.commerce);
      const { jobId, calls, boundToken, boundTopic } = await createUsdtJob(3600);
      note('JobCreated parses with Pokter’s existing decoder', jobId > 0n, `job ${jobId}`);
      const boundAddress = boundToken ?? (boundTopic && boundTopic[2] ? getAddress(`0x${boundTopic[2].slice(-40)}`) : null);
      note('the creation receipt carries JobPaymentTokenBound for USDT', boundAddress === USDT || (boundTopic?.some((t) => t.toLowerCase().endsWith(USDT.slice(2).toLowerCase())) ?? false), String(boundAddress));
      await fund(calls);
      const funded = await job(jobId);
      const bound = await client.readContract({ address: A.commerce, abi: COMMERCE_TOKEN_ABI, functionName: 'jobPaymentToken', args: [jobId] });
      note('funded job is FUNDED with the exact budget', STATUS[funded.status] === 'FUNDED' && funded.budget === BUDGET, `${STATUS[funded.status]} ${funded.budget}`);
      note('jobPaymentToken is USDT', getAddress(bound) === USDT);
      note('exactly the budget left the buyer in USDT', before - (await balance(BUYER)) === BUDGET);
      note('the escrow holds it in USDT', (await balance(A.commerce)) - escrowBefore === BUDGET);
      note('no $U was touched', (await balance(BUYER, A.paymentToken)) === 0n);
      const allowance = await client.readContract({ address: USDT, abi: erc20Abi, functionName: 'allowance', args: [BUYER, A.commerce] });
      note('no USDT allowance is left behind', allowance === 0n, String(allowance));

      // 2. Delivery and release.
      const deliverable = keccak256(toHex('deliverable'));
      await send(PROVIDER, A.commerce, encodeFunctionData({ abi: COMMERCE, functionName: 'submit', args: [jobId, deliverable, '0x'] }));
      note('the provider submits', STATUS[(await job(jobId)).status] === 'SUBMITTED');
      const early = await reverts(BUYER, A.router, encodeFunctionData({ abi: ROUTER, functionName: 'settle', args: [jobId, '0x'] }));
      note('release is refused inside the review window', early !== null, early ?? 'it did not revert');
      await client.increaseTime({ seconds: windowSeconds + 5 });
      await client.mine({ blocks: 1 });
      const providerBefore = await balance(PROVIDER);
      await send(BUYER, A.router, encodeFunctionData({ abi: ROUTER, functionName: 'settle', args: [jobId, '0x'] }));
      const paid = (await balance(PROVIDER)) - providerBefore;
      const fee = (BUDGET * BigInt(feeBp)) / 10_000n;
      note('release pays the provider in USDT', STATUS[(await job(jobId)).status] === 'COMPLETED' && paid === BUDGET - fee, `paid ${paid}, fee ${fee}`);
    }

    // 3. Dispute, rejected by the voters, refunded in USDT.
    {
      const { jobId, calls } = await createUsdtJob(3600);
      await fund(calls);
      await send(PROVIDER, A.commerce, encodeFunctionData({ abi: COMMERCE, functionName: 'submit', args: [jobId, keccak256(toHex('bad')), '0x'] }));
      await send(BUYER, A.policy, encodeFunctionData({ abi: POLICY, functionName: 'dispute', args: [jobId] }));
      note('the buyer disputes inside the window', true);
      const admin = await client.readContract({ address: A.policy, abi: POLICY, functionName: 'admin' });
      const quorum = Number(await client.readContract({ address: A.policy, abi: POLICY, functionName: 'voteQuorum' }));
      const voters = Array.from({ length: Math.max(quorum, 1) }, (_, i) => getAddress(pad(toHex(0xa11 + i), { size: 20 })));
      await client.setBalance({ address: admin, value: 10n ** 18n });
      for (const v of voters) {
        await client.setBalance({ address: v, value: 10n ** 18n });
        if (!(await client.readContract({ address: A.policy, abi: POLICY, functionName: 'isVoter', args: [v] }))) {
          await send(admin, A.policy, encodeFunctionData({ abi: POLICY, functionName: 'addVoter', args: [v] }));
        }
      }
      const before = await balance(BUYER);
      for (const v of voters) await send(v, A.policy, encodeFunctionData({ abi: POLICY, functionName: 'voteReject', args: [jobId] }));
      let status = STATUS[(await job(jobId)).status];
      let refunded = (await balance(BUYER)) - before;
      note('the votes alone leave the job SUBMITTED; the router applies the verdict', status === 'SUBMITTED', status);
      /* The verdict is applied through the router, the same call that releases an undisputed job. */
      await send(BUYER, A.router, encodeFunctionData({ abi: ROUTER, functionName: 'settle', args: [jobId, '0x'] }));
      status = STATUS[(await job(jobId)).status];
      refunded = (await balance(BUYER)) - before;
      if (status === 'REJECTED' && refunded === 0n) {
        await send(BUYER, A.commerce, encodeFunctionData({ abi: COMMERCE, functionName: 'claimRefund', args: [jobId] })).catch(() => null);
        status = STATUS[(await job(jobId)).status];
        refunded = (await balance(BUYER)) - before;
      }
      note('a quorum of rejections refunds the buyer in USDT', status === 'REJECTED' && refunded === BUDGET, `${status}, refunded ${refunded} (quorum ${quorum})`);
    }

    // 4. Never delivered, expired, reclaimed in USDT.
    {
      const { jobId, calls, expiredAt } = await createUsdtJob(600);
      await fund(calls);
      const early = await reverts(BUYER, A.commerce, encodeFunctionData({ abi: COMMERCE, functionName: 'claimRefund', args: [jobId] }));
      note('a reclaim before expiry is refused', early !== null, early ?? 'it did not revert');
      const now = BigInt((await client.getBlock()).timestamp);
      await client.increaseTime({ seconds: Number(expiredAt - now) + 5 });
      await client.mine({ blocks: 1 });
      const before = await balance(BUYER);
      await send(BUYER, A.commerce, encodeFunctionData({ abi: COMMERCE, functionName: 'claimRefund', args: [jobId] }));
      note('after expiry the buyer reclaims the full amount in USDT', (await balance(BUYER)) - before === BUDGET && STATUS[(await job(jobId)).status] === 'EXPIRED');
    }

    // 5. A partial failure: created and budgeted, funding fails, nothing moved; the retry funds the same job.
    {
      const counterBefore = await client.readContract({ address: A.commerce, abi: COMMERCE, functionName: 'jobCounter' });
      const { jobId, calls } = await createUsdtJob(3600);
      const before = await balance(BUYER);
      await send(BUYER, USDT, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [A.commerce, BUDGET - 1n] }));
      const short = await reverts(BUYER, calls[4].to, calls[4].data);
      note('funding with less than the budget approved reverts', short !== null, short ?? 'it did not revert');
      note('and the job stays OPEN with nothing taken', STATUS[(await job(jobId)).status] === 'OPEN' && (await balance(BUYER)) === before);
      await send(BUYER, USDT, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [A.commerce, 0n] }));
      await fund(calls);
      const counterAfter = await client.readContract({ address: A.commerce, abi: COMMERCE, functionName: 'jobCounter' });
      note('the retry funds the same job, and no second job exists', STATUS[(await job(jobId)).status] === 'FUNDED' && counterAfter === counterBefore + 1n, `counter ${counterBefore} → ${counterAfter}`);
      const again = await reverts(BUYER, calls[4].to, calls[4].data);
      note('a repeated fund of a funded job is refused, so a double click cannot pay twice', again !== null, again ?? 'it did not revert');
    }

    // 6. Money the escrow does not accept never makes a job.
    {
      const now = BigInt((await client.getBlock()).timestamp);
      const data = encodeFunctionData({ abi: COMMERCE_TOKEN_ABI, functionName: 'createJobWithToken', args: [PROVIDER, A.router, now + 7200n, 'x', A.router, getAddress('0x000000000000000000000000000000000000bEEF')] });
      const why = await reverts(BUYER, A.commerce, data);
      note('createJobWithToken refuses an unsupported token', why !== null, why ?? 'it did not revert');
    }

    // 7. The signed-quote guard, against fork time: a lapsed quote stops the hire before anything is sent.
    {
      const nowMs = Number((await client.getBlock()).timestamp) * 1000;
      const lapsed = checkPurchaseIntent(
        { provider: PROVIDER, task: 't', amountRaw: BUDGET.toString(), currency: USDT, chainId: CHAIN, verifyingContract: A.commerce, expiresAt: Math.floor(nowMs / 1000) + 10, negotiationHash: '0x' },
        { provider: PROVIDER, task: 't', chainId: CHAIN, commerce: A.commerce, paymentToken: USDT, amountRaw: BUDGET.toString() },
        nowMs,
      );
      note('a quote expiring inside the funding margin stops the hire', !lapsed.ok);
    }
  } finally {
    anvil.kill();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed on the fork; nothing was broadcast.`);
  if (failed.length) process.exitCode = 1;
}

/** Give an account USDT on the fork by writing its balance slot, found by probing. */
type Storage = {
  getStorageAt: (args: { address: Address; slot: Hex }) => Promise<Hex | undefined>;
  setStorageAt: (args: { address: Address; index: Hex; value: Hex }) => Promise<void>;
  readContract: (args: { address: Address; abi: typeof erc20Abi; functionName: 'balanceOf'; args: readonly [Address] }) => Promise<bigint>;
};
async function dealUsdt(client: Storage, who: Address, amount: bigint) {
  for (let slot = 0n; slot < 20n; slot++) {
    const key = keccak256(`0x${pad(who, { size: 32 }).slice(2)}${pad(toHex(slot), { size: 32 }).slice(2)}` as Hex);
    const old = await client.getStorageAt({ address: USDT, slot: key });
    await client.setStorageAt({ address: USDT, index: key, value: pad(toHex(amount), { size: 32 }) });
    const got = await client.readContract({ address: USDT, abi: erc20Abi, functionName: 'balanceOf', args: [who] });
    if (got === amount) return;
    await client.setStorageAt({ address: USDT, index: key, value: old ?? pad('0x0', { size: 32 }) });
  }
  throw new Error('could not find the USDT balance slot');
}

await main();
