/**
 * Keeping an agent's example wallet from becoming the buyer's account.
 *
 * Templates built from an agent's own card copy its example brief as
 * written, and some examples name a real wallet: Brinkwatch's first is
 * "Venus health factor for 0x0aEe…9aB7 and the repay that restores 1.5".
 * Choosing it sent a report on someone else's position as though it were
 * the buyer's. Other examples leave "0x…" for the reader to fill, which an
 * agent can only refuse.
 *
 * An address in the brief that also appears in one of the agent's own
 * examples is treated as the example's, until the buyer replaces it or
 * says they mean it. Edits do not hide it: the comparison is against the
 * examples, not the template that was last clicked.
 */
const ADDRESS = /0x[0-9a-fA-F]{40}/g;

/** What an example's account address becomes when it is put in the brief: the buyer's to fill. */
export const WALLET_PLACEHOLDER = '[wallet address]';
const PLACEHOLDER = /0x(?:…|\.{2,})(?![0-9a-fA-F])/;

/**
 * What the words just before an address say it is.
 *
 * Every address in an example was treated as somebody's account, so a
 * brief naming a token, pool or vault offered the buyer "Use my wallet"
 * for it — which would swap a contract Pokter is asked to read for the
 * buyer's own address and produce a brief the agent must refuse.
 *
 * Only a clear non-account cue excuses an address, not the absence of an
 * account one. An example's wallet reaching a funded job is the worse
 * failure of the two: it funded two mainnet jobs that can never complete,
 * which is why this file exists.
 */
const NOT_AN_ACCOUNT = /\b(token|contract|pool|pair|vault|market|asset|collection|router|factory|lp|nft|mint|erc-?20|erc-?721)\b["'\s:=,._-]{0,24}$/i;

/** Addresses in `text` that something immediately before names as not an account. */
export function nonAccountAddresses(task: string): Set<string> {
  const skip = new Set<string>();
  for (const match of task.matchAll(ADDRESS)) {
    const before = task.slice(Math.max(0, match.index - 40), match.index);
    if (NOT_AN_ACCOUNT.test(before)) skip.add(match[0].toLowerCase());
  }
  return skip;
}

export interface ExampleWalletCheck {
  /** Example addresses still in the brief and not confirmed. */
  exampleWallets: string[];
  /** A "0x…" left for the buyer to fill. */
  placeholder: boolean;
}

export function checkExampleWallets(task: string, examples: readonly string[], confirmed: ReadonlySet<string> = new Set()): ExampleWalletCheck {
  const fromExamples = new Set(examples.flatMap((example) => example.match(ADDRESS) ?? []).map((a) => a.toLowerCase()));
  const inTask = [...new Set((task.match(ADDRESS) ?? []).map((a) => a.toLowerCase()))];
  /*
   * Judged where the buyer will read it. An address the examples introduce
   * as a token can still be the account in this brief, and the warning is
   * about this brief.
   */
  const notAccounts = nonAccountAddresses(task);
  return {
    exampleWallets: inTask.filter((a) => fromExamples.has(a) && !confirmed.has(a) && !notAccounts.has(a)),
    placeholder: PLACEHOLDER.test(task) || task.includes(WALLET_PLACEHOLDER),
  };
}

/** The brief with one address swapped for another, every occurrence, case-insensitively. */
export function replaceWallet(task: string, from: string, to: string): string {
  return task.replace(new RegExp(from.replace(/^0x/i, '0x'), 'gi'), to);
}
