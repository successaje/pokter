import type { Page } from '@playwright/test';
import { decodeFunctionData, encodeFunctionResult, parseAbi, toHex } from 'viem';

/*
 * The chain as a test wants the page to find it: every JSON-RPC request the
 * page sends to a public BNB Chain node is answered here instead, from a
 * fixed clock and a fixed set of escrow jobs. Reads only; nothing reaches a
 * real node, and anything not modelled is refused as a node would refuse it.
 */

const ESCROW_ABI = parseAbi(['function getJob(uint256 jobId) view returns ((uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook, uint256 submittedAt, bytes32 deliverable))']);
const STATUS = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const;
const ZERO = '0x0000000000000000000000000000000000000000';
const NODES = /publicnode\.com|bnbchain\.org|binance\.org|defibit\.io|ninicoin\.io/;

export interface MockJob {
  client: `0x${string}`;
  status: (typeof STATUS)[number];
  expiredAt: number;
  provider?: `0x${string}`;
  description?: string;
  budget?: bigint;
}

export async function mockChain(page: Page, chain: { chainId: number; now: number; jobs?: Record<string, MockJob> }) {
  const asked: string[] = [];
  const answer = (method: string, params: unknown[]): unknown => {
    switch (method) {
      case 'eth_chainId':
        return toHex(chain.chainId);
      case 'eth_blockNumber':
        return '0x100';
      case 'eth_getBlockByNumber':
      case 'eth_getBlockByHash':
        return {
          number: '0x100', hash: `0x${'11'.repeat(32)}`, parentHash: `0x${'22'.repeat(32)}`, timestamp: toHex(chain.now), nonce: '0x0000000000000000',
          gasLimit: '0x1c9c380', gasUsed: '0x0', baseFeePerGas: '0x0', miner: ZERO, difficulty: '0x0', totalDifficulty: '0x0', extraData: '0x', size: '0x0',
          logsBloom: `0x${'0'.repeat(512)}`, transactionsRoot: `0x${'0'.repeat(64)}`, stateRoot: `0x${'0'.repeat(64)}`, receiptsRoot: `0x${'0'.repeat(64)}`, sha3Uncles: `0x${'0'.repeat(64)}`, mixHash: `0x${'0'.repeat(64)}`,
          transactions: [], uncles: [],
        };
      case 'eth_getTransactionReceipt':
      case 'eth_getTransactionByHash':
        return null;
      case 'eth_call': {
        const call = params[0] as { data?: `0x${string}`; input?: `0x${string}` };
        const data = call.data ?? call.input ?? '0x';
        const { functionName, args } = decodeFunctionData({ abi: ESCROW_ABI, data });
        if (functionName !== 'getJob') throw new Error('not modelled');
        const id = (args[0] as bigint).toString();
        const job = chain.jobs?.[id];
        return encodeFunctionResult({
          abi: ESCROW_ABI,
          functionName: 'getJob',
          result: {
            id: BigInt(id), client: job?.client ?? ZERO, provider: job?.provider ?? ZERO, evaluator: ZERO, description: job?.description ?? '', budget: job?.budget ?? 0n,
            expiredAt: BigInt(job?.expiredAt ?? 0), status: job ? STATUS.indexOf(job.status) : 0, hook: ZERO, submittedAt: 0n, deliverable: `0x${'0'.repeat(64)}`,
          },
        });
      }
    }
    throw new Error('not modelled');
  };
  await page.route(NODES, async (route) => {
    const body = route.request().postDataJSON() as { id: number; method: string; params?: unknown[] } | Array<{ id: number; method: string; params?: unknown[] }>;
    const one = (r: { id: number; method: string; params?: unknown[] }) => {
      asked.push(r.method);
      try {
        return { jsonrpc: '2.0', id: r.id, result: answer(r.method, r.params ?? []) };
      } catch {
        return { jsonrpc: '2.0', id: r.id, error: { code: -32601, message: `${r.method} is not modelled by this test` } };
      }
    };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)) });
  });
  return { asked: () => asked.slice() };
}
