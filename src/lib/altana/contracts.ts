import type { Address } from 'viem';

/**
 * The protocol integrations a delegated strategy would need to call.
 *
 * Addresses were verified to hold bytecode on both BSC mainnet (56) and testnet
 * (97) — PancakeSwap deploys V3 deterministically, so the addresses match across
 * chains. These are requirements for a future argument-aware adapter, not a
 * session allowlist. Altana currently constrains targets and selectors but not
 * calldata arguments, so exposing the raw contracts would let a session choose
 * recipients, assets and position IDs that the user never approved.
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

/** Required integrations shown as design context; never passed to a session. */
export const CATEGORY_INTEGRATIONS: Record<string, KnownContract[]> = {
  rebalancing: [PANCAKESWAP_V3_POSITION_MANAGER],
  'grid-trading': [PANCAKESWAP_V3_ROUTER],
  yield: [PANCAKESWAP_V3_ROUTER],
  // A monitor reads positions and reports; it needs no write authority at all.
  'health-factor': [],
};

/**
 * The effective boundary today. These statements are stronger than a proposed
 * allowlist because Pokter creates no delegated session at all.
 */
export const DENIED_CAPABILITIES = [
  'Call any contract from your wallet',
  'Move, approve or spend any token',
  'Operate any liquidity position',
  'Create a standing session key',
];
