import type { Address } from 'viem';

/**
 * The contracts an agent may be allowed to call.
 *
 * Addresses were verified to hold bytecode on both BSC mainnet (56) and testnet
 * (97) — PancakeSwap deploys V3 deterministically, so the addresses match across
 * chains. `verifyAllowlist` re-checks at runtime rather than trusting this file,
 * because an allowlist entry pointing at nothing is worse than no allowlist: it
 * looks like a constraint while constraining nothing.
 */
export interface KnownContract {
  address: Address;
  /** Shown to the user in the permission review. */
  label: string;
  /** What allowing this actually lets the agent do, in plain language. */
  capability: string;
  /** Function signatures the agent may call. Empty means any method. */
  methods: string[];
}

export const PANCAKESWAP_V3_ROUTER: KnownContract = {
  address: '0x9a489505a00cE272eAa5e07Dba6491314CaE3796',
  label: 'PancakeSwap V3 Router',
  capability: 'Swap tokens through PancakeSwap V3 pools.',
  methods: [
    'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))',
  ],
};

export const PANCAKESWAP_V3_POSITION_MANAGER: KnownContract = {
  address: '0x427bF5b37357632377eCbEC9de3626C71A5396c1',
  label: 'PancakeSwap V3 Position Manager',
  capability:
    'Adjust concentrated-liquidity positions: mint, increase, decrease, collect fees.',
  methods: [
    'mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))',
    'increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))',
    'decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))',
    'collect((uint256,address,uint128,uint128))',
  ],
};

/** Preset allowlists per category, so the UI never asks a user to assemble one. */
export const CATEGORY_CONTRACTS: Record<string, KnownContract[]> = {
  rebalancing: [PANCAKESWAP_V3_POSITION_MANAGER],
  'grid-trading': [PANCAKESWAP_V3_ROUTER],
  yield: [PANCAKESWAP_V3_ROUTER],
  // A monitor reads positions and reports; it needs no write authority at all.
  'health-factor': [],
};

/**
 * What an agent explicitly cannot do under any Pokter-issued session.
 *
 * These are consequences of the allowlist rather than separate switches: any
 * target not named above reverts at validation time in the Altana account
 * contract. They are listed so the user sees the boundary, not just the
 * permission.
 */
export const DENIED_CAPABILITIES = [
  'Call any contract outside the list above',
  'Transfer your tokens to an arbitrary address',
  'Withdraw from protocols unrelated to this strategy',
  'Extend its own permissions or expiry',
];
