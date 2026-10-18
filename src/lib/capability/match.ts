/**
 * Whether an agent was seen doing its job on chain.
 *
 * Most agents on Pokter advise: they answer a brief and move nothing, and
 * for them this check does not apply, so it is asked only of agents whose
 * own description says they act. What counts as acting depends on the job:
 * a yield agent supplying to or redeeming from Venus, a rebalancer or grid
 * trader swapping on PancakeSwap. Matched on the contract called and the
 * method, from the agent wallet's own successful transactions.
 *
 * "Not seen" is never "cannot": an agent may act through an executor,
 * a smart account or a vault, so the reading names the wallet it read.
 */

export type Declared = 'acts' | 'advises' | 'undeclared';

const ADVISES = /\b(read-only|read only|advisory|executes? no (transactions?|trades?)|(it|agent) (never|does not|doesn't) (place|move|sign|execute|trade|send)\w*|does not place|designs the|without (executing|moving funds))\b/i;
const ACTS = /\b((it|agent|bot) (executes|deposits|supplies|redeems|rebalances|trades|swaps|places)|executes the (rebalance|trade|swap|order)s?|keeps? \w+(?: \w+)? supplied|auto-?compound\w*|auto-?rebalanc\w*|rebalances (the|your|its) (allocation|portfolio|wallet|holdings|positions?)|every move is an on-?chain|manages? (funds|capital|a vault))\b/i;

/**
 * What the agent says about itself. Free text, so it only shapes the wording
 * when nothing is seen; it never decides whether a wallet is read. Acting
 * wins when both appear, because a description that says it acts and also
 * that "noise never moves funds" is describing a guard on its actions.
 */
export function declaredAction(text: string | null | undefined): Declared {
  const t = text ?? '';
  if (ACTS.test(t)) return 'acts';
  if (ADVISES.test(t)) return 'advises';
  return 'undeclared';
}

/** Method selectors of a Venus market's lending calls (keccak of the signature; see the test). */
export const VENUS_ACTION_SELECTORS: Readonly<Record<string, string>> = {
  '0x1249c58b': 'mint()',
  '0xa0712d68': 'mint(uint256)',
  '0xdb006a75': 'redeem(uint256)',
  '0x852a12e3': 'redeemUnderlying(uint256)',
  '0xc5ebeaec': 'borrow(uint256)',
  '0x0e752702': 'repayBorrow(uint256)',
  '0x4e4d9fea': 'repayBorrow()',
};

/** PancakeSwap routers and the v3 position manager, each checked to hold code on its chain. */
export const PANCAKE: Readonly<Record<number, { routers: readonly string[]; positionManager: string }>> = {
  56: {
    routers: ['0x10ed43c718714eb63d5aa57b78b54704e256024e', '0x13f4ea83d0bd40e75c8222255bc855a974568dd4', '0x1a0a18ac4becddbd6389559687d1a73d8927e416', '0x1b81d678ffb9c0263b24a97847620c99d213eb14'],
    positionManager: '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364',
  },
  97: {
    routers: ['0xd99d1c33f9fc3444f8101754abc46c52416550d1', '0x9a489505a00ce272eaa5e07dba6491314cae3796', '0x1b81d678ffb9c0263b24a97847620c99d213eb14'],
    positionManager: '0x427bf5b37357632377ecbec9de3626c71a5396c1',
  },
};

export interface ChainTx {
  to: string | null;
  input: string;
  ok: boolean;
  at: number; // unix seconds
}

export interface ActionCounts {
  venus: number;
  swaps: number;
  liquidity: number;
  latestAt: number | null;
}

/** Count the agent wallet's job-shaped transactions. `isVenus` says whether an address is a Venus market. */
export function countActions(chainId: number, txs: readonly ChainTx[], isVenus: (address: string) => boolean): ActionCounts {
  const pancake = PANCAKE[chainId];
  const counts: ActionCounts = { venus: 0, swaps: 0, liquidity: 0, latestAt: null };
  for (const tx of txs) {
    if (!tx.ok || !tx.to) continue;
    const to = tx.to.toLowerCase();
    const selector = tx.input.slice(0, 10).toLowerCase();
    let matched = false;
    if (VENUS_ACTION_SELECTORS[selector] && isVenus(to)) {
      counts.venus += 1;
      matched = true;
    } else if (pancake?.routers.includes(to)) {
      counts.swaps += 1;
      matched = true;
    } else if (pancake && to === pancake.positionManager) {
      counts.liquidity += 1;
      matched = true;
    }
    if (matched) counts.latestAt = Math.max(counts.latestAt ?? 0, tx.at);
  }
  return counts;
}

/** What each category's job looks like on chain; null where the job is advice. */
export const JOB_ACTIONS: Readonly<Record<string, ReadonlyArray<keyof Omit<ActionCounts, 'latestAt'>> | null>> = {
  yield: ['venus'],
  'health-factor': ['venus'],
  rebalancing: ['swaps', 'liquidity', 'venus'],
  'grid-trading': ['swaps'],
  'token-safety': null,
};

const NOUN: Record<keyof Omit<ActionCounts, 'latestAt'>, string> = { venus: 'Venus lending call', swaps: 'PancakeSwap swap', liquidity: 'PancakeSwap liquidity change' };

export interface CapabilityRead {
  chainId: number;
  wallet: string;
  counts: ActionCounts;
  /** Days of history read. */
  days: number;
  checkedAt: string;
}

/** The Compare and profile wording. */
export function capabilityText(input: {
  category: string;
  declared: Declared;
  wallet: string | null | undefined;
  reads: readonly CapabilityRead[];
  chainLabel: (chainId: number) => string;
  now?: number;
}): { text: string; seen: boolean | null } {
  const job = JOB_ACTIONS[input.category];
  if (job === null) return { text: 'Its job is advice: nothing to do on chain', seen: null };
  if (job === undefined) return { text: 'No category to judge its job by', seen: null };
  if (!input.wallet) return { text: 'No agent wallet registered to read', seen: null };
  if (input.reads.length === 0) return { text: 'Not read yet', seen: null };
  const now = input.now ?? Date.now();
  const seen = input.reads
    .map((read) => {
      const parts = job.filter((kind) => read.counts[kind] > 0).map((kind) => `${read.counts[kind]} ${NOUN[kind]}${read.counts[kind] === 1 ? '' : 's'}`);
      if (parts.length === 0) return null;
      const days = read.counts.latestAt ? Math.max(0, Math.round((now / 1000 - read.counts.latestAt) / 86_400)) : null;
      return `${parts.join(', ')} on ${input.chainLabel(read.chainId)}${days === null ? '' : `, latest ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}`}`;
    })
    .filter((line): line is string => line !== null);
  if (seen.length > 0) return { text: `Seen doing its job: ${seen.join('; ')}`, seen: true };
  const days = Math.max(...input.reads.map((r) => r.days));
  const none = `No ${job.includes('venus') && job.includes('swaps') ? 'lending or swap' : job.includes('venus') ? 'Venus lending' : 'PancakeSwap'} transactions from its agent wallet in the last ${days} days`;
  if (input.declared === 'acts') return { text: `Says it acts; ${none.charAt(0).toLowerCase()}${none.slice(1)}`, seen: false };
  return { text: input.declared === 'advises' ? `${none}. It says it only advises` : none, seen: false };
}
