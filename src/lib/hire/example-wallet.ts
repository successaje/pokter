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
const PLACEHOLDER = /0x(?:…|\.{2,})(?![0-9a-fA-F])/;

export interface ExampleWalletCheck {
  /** Example addresses still in the brief and not confirmed. */
  exampleWallets: string[];
  /** A "0x…" left for the buyer to fill. */
  placeholder: boolean;
}

export function checkExampleWallets(task: string, examples: readonly string[], confirmed: ReadonlySet<string> = new Set()): ExampleWalletCheck {
  const fromExamples = new Set(examples.flatMap((example) => example.match(ADDRESS) ?? []).map((a) => a.toLowerCase()));
  const inTask = [...new Set((task.match(ADDRESS) ?? []).map((a) => a.toLowerCase()))];
  return {
    exampleWallets: inTask.filter((a) => fromExamples.has(a) && !confirmed.has(a)),
    placeholder: PLACEHOLDER.test(task),
  };
}

/** The brief with one address swapped for another, every occurrence, case-insensitively. */
export function replaceWallet(task: string, from: string, to: string): string {
  return task.replace(new RegExp(from.replace(/^0x/i, '0x'), 'gi'), to);
}
