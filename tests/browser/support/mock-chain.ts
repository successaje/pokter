import type { Page } from '@playwright/test';
import { decodeFunctionData, encodeFunctionResult, parseAbi, toHex, type Hex } from 'viem';

/*
 * The chain as a test wants the page to find it: every JSON-RPC request the
 * page sends to a public BNB Chain node is answered here instead, from a
 * fixed clock, a fixed set of escrow jobs and fixed balances. Reads only;
 * nothing reaches a real node, and anything not modelled is refused as a
 * node would refuse it.
 */

const ESCROW_ABI = parseAbi([
  'function getJob(uint256 jobId) view returns ((uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook, uint256 submittedAt, bytes32 deliverable))',
  'function jobCounter() view returns (uint256)',
  'function disputeWindow() view returns (uint64)',
]);
const TOKEN_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
]);
const MULTICALL_ABI = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calls) payable returns (Result[] returnData)',
  'function getCurrentBlockTimestamp() view returns (uint256 timestamp)',
]);
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

/** An ERC-20 the page may read, by address. Every account holds `balance` of it. */
export interface MockToken {
  balance: bigint;
  decimals?: number;
  symbol?: string;
}

export interface MockChainState {
  chainId: number;
  /** The head block's timestamp, in seconds. */
  now: number;
  jobs?: Record<string, MockJob>;
  /** What `eth_getBalance` answers for any account, in wei. Unset: refused. */
  native?: bigint;
  /** ERC-20s by address (any case). A token not listed is not modelled. */
  tokens?: Record<string, MockToken>;
  /** The escrow's `jobCounter()`. Unset: refused. */
  jobCounter?: bigint;
  /** The policy's `disputeWindow()`, in seconds. Unset: refused. */
  disputeWindow?: number;
}

class NotModelled extends Error {}

export async function mockChain(page: Page, chain: MockChainState) {
  const asked: string[] = [];
  const tokens = new Map(Object.entries(chain.tokens ?? {}).map(([address, token]) => [address.toLowerCase(), token]));

  /** One contract call's return data. Throws `NotModelled` for anything this chain does not know. */
  const call = (to: string, data: Hex): Hex => {
    const token = tokens.get(to.toLowerCase());
    if (token) {
      const { functionName } = decodeFunctionData({ abi: TOKEN_ABI, data });
      switch (functionName) {
        case 'balanceOf':
          return encodeFunctionResult({ abi: TOKEN_ABI, functionName, result: token.balance });
        case 'allowance':
          return encodeFunctionResult({ abi: TOKEN_ABI, functionName, result: 0n });
        case 'decimals':
          return encodeFunctionResult({ abi: TOKEN_ABI, functionName, result: token.decimals ?? 18 });
        case 'symbol':
          return encodeFunctionResult({ abi: TOKEN_ABI, functionName, result: token.symbol ?? 'TOKEN' });
        case 'supportsInterface':
          return encodeFunctionResult({ abi: TOKEN_ABI, functionName, result: false });
      }
    }
    let decoded;
    try {
      decoded = decodeFunctionData({ abi: [...ESCROW_ABI, ...MULTICALL_ABI], data });
    } catch {
      throw new NotModelled();
    }
    switch (decoded.functionName) {
      case 'getJob': {
        const id = (decoded.args[0] as bigint).toString();
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
      case 'jobCounter':
        if (chain.jobCounter === undefined) break;
        return encodeFunctionResult({ abi: ESCROW_ABI, functionName: 'jobCounter', result: chain.jobCounter });
      case 'disputeWindow':
        if (chain.disputeWindow === undefined) break;
        return encodeFunctionResult({ abi: ESCROW_ABI, functionName: 'disputeWindow', result: BigInt(chain.disputeWindow) });
      case 'getCurrentBlockTimestamp':
        return encodeFunctionResult({ abi: MULTICALL_ABI, functionName: 'getCurrentBlockTimestamp', result: BigInt(chain.now) });
      case 'aggregate3': {
        // Multicall3: each inner call answered on its own, a failure where this chain does not model it.
        const results = (decoded.args[0] as ReadonlyArray<{ target: `0x${string}`; allowFailure: boolean; callData: Hex }>).map((inner) => {
          try {
            return { success: true, returnData: call(inner.target, inner.callData) };
          } catch {
            if (!inner.allowFailure) throw new NotModelled();
            return { success: false, returnData: '0x' as Hex };
          }
        });
        return encodeFunctionResult({ abi: MULTICALL_ABI, functionName: 'aggregate3', result: results });
      }
    }
    throw new NotModelled();
  };

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
      case 'eth_getBalance':
        if (chain.native === undefined) break;
        return toHex(chain.native);
      case 'eth_call': {
        const tx = params[0] as { to?: string; data?: Hex; input?: Hex };
        return call(tx.to ?? ZERO, tx.data ?? tx.input ?? '0x');
      }
    }
    throw new NotModelled();
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
