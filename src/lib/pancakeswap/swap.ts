import {
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';

/**
 * Acquire the ERC-8183 payment token with BNB the user already holds.
 *
 * Escrow is denominated in `$U`. Without this, the mainnet hire flow asks
 * someone to go and buy United Stables elsewhere and come back, which most
 * people will not finish. The payment rail is unchanged — this only removes
 * the errand.
 *
 * Audit findings POK-017 to POK-022 cover this path.
 */

/**
 * Verified on chain rather than taken from documentation: both hold bytecode
 * on BSC mainnet, and the router's parameter shape was determined by
 * simulating against it. A wrong address here is the defect that broke every
 * testnet hire once already (altana-sdk#84).
 */
export const PANCAKE_V3_SWAP_ROUTER: Address = getAddress(
  '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
);
export const PANCAKE_V3_QUOTER_V2: Address = getAddress(
  '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
);
export const WBNB: Address = getAddress(
  '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
);

/** Only the 0.05% tier currently routes WBNB→U; the rest are quoted anyway. */
const FEE_TIERS = [100, 500, 2500, 10000] as const;

/**
 * How far the input may exceed the quote before the swap reverts.
 *
 * POK-017. One percent, not the 1.5% that is conventional. A hire-sized swap
 * against a multi-million-dollar pool moves the price by nothing measurable,
 * so the tolerance is not absorbing price impact — it exists only to survive
 * BNB moving between the quote and the signature. A wider band would not make
 * the swap more likely to land; it would only raise the ceiling on what a bad
 * fill is allowed to cost.
 */
export const SLIPPAGE_BPS = 100n;

/** POK-019. Long enough for a biometric prompt, short enough to bound staleness. */
export const DEADLINE_SECONDS = 300;

const quoterAbi = [
  {
    name: 'quoteExactOutputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const;

/** Determined by simulation: this router requires `deadline` inside the tuple. */
const routerAbi = [
  {
    name: 'exactOutputSingle',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountOut', type: 'uint256' },
          { name: 'amountInMaximum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'refundETH',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
] as const;

export interface SwapQuote {
  /** Exact `$U` the swap will deliver. */
  amountOut: bigint;
  /** BNB the pool wants right now. */
  amountIn: bigint;
  /** The most BNB that can be taken, after slippage. */
  amountInMaximum: bigint;
  fee: number;
  quotedAt: number;
}

/**
 * The cheapest route to an exact amount of `$U`.
 *
 * POK-020: exact-output. The user needs a specific budget, so the amount of
 * `$U` is fixed and the BNB cost is what varies. An exact-input swap would
 * leave them holding dust and might still fall short of the budget.
 */
export async function quoteBnbForPaymentToken(
  client: PublicClient,
  paymentToken: Address,
  amountOut: bigint,
): Promise<SwapQuote | null> {
  let best: { amountIn: bigint; fee: number } | null = null;

  for (const fee of FEE_TIERS) {
    try {
      const { result } = await client.simulateContract({
        address: PANCAKE_V3_QUOTER_V2,
        abi: quoterAbi,
        functionName: 'quoteExactOutputSingle',
        args: [
          {
            tokenIn: WBNB,
            tokenOut: paymentToken,
            amount: amountOut,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      const amountIn = result[0] as bigint;
      if (amountIn > 0n && (!best || amountIn < best.amountIn)) {
        best = { amountIn, fee };
      }
    } catch {
      // No pool at this tier, or no route through it. Try the next.
    }
  }

  if (!best) return null;

  return {
    amountOut,
    amountIn: best.amountIn,
    amountInMaximum: (best.amountIn * (10_000n + SLIPPAGE_BPS)) / 10_000n,
    fee: best.fee,
    quotedAt: Date.now(),
  };
}

export interface SwapCall {
  to: Address;
  data: Hex;
  value: bigint;
}

/**
 * The calls that perform the swap.
 *
 * Two, and the second matters: `exactOutputSingle` is paid the *maximum*, and
 * the router keeps whatever it did not spend unless told otherwise.
 * `refundETH` returns the difference in the same transaction, so the user is
 * charged the real price rather than the worst-case one.
 */
export function buildSwapCalls(
  quote: SwapQuote,
  paymentToken: Address,
  recipient: Address,
): SwapCall[] {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

  return [
    {
      to: PANCAKE_V3_SWAP_ROUTER,
      value: quote.amountInMaximum,
      data: encodeFunctionData({
        abi: routerAbi,
        functionName: 'exactOutputSingle',
        args: [
          {
            tokenIn: WBNB,
            tokenOut: paymentToken,
            fee: quote.fee,
            recipient,
            deadline,
            amountOut: quote.amountOut,
            amountInMaximum: quote.amountInMaximum,
            sqrtPriceLimitX96: 0n,
          },
        ],
      }),
    },
    {
      to: PANCAKE_V3_SWAP_ROUTER,
      value: 0n,
      data: encodeFunctionData({ abi: routerAbi, functionName: 'refundETH' }),
    },
  ];
}
