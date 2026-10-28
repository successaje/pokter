import type { Address } from 'viem';

/**
 * Following a wallet step from the chain as well as from the wallet.
 *
 * Every step of a hire is a wallet prompt, and Pokter learned that a step
 * happened only from the wallet's answer: the hash, then a receipt for it.
 * Some wallets approve and broadcast a transaction and never answer the
 * page, or stop answering its quick questions (network, account) before
 * the next prompt. The transaction lands; the page waits on the wallet with
 * nothing to tell it otherwise, and the buyer refreshes and starts again.
 *
 * So each step can also be recognised by what it does on chain, read with
 * plain contract calls that every endpoint answers. Whichever comes first,
 * the wallet's answer or the chain's, settles the step.
 */

/** What a step's effect reveals once it is on chain: the job a create made. */
export interface StepLanded {
  jobId?: bigint;
}

export interface ChainWatch {
  /** The buyer's confirmed transaction count before the prompt; null when it could not be read. */
  nonceBefore: number | null;
  /** The buyer's confirmed transaction count now. */
  nonceNow: () => Promise<number>;
  /** The step's effect, when it is on chain; null while it is not. */
  landed: () => Promise<StepLanded | null>;
  /**
   * The effect alone cannot prove the step landed (a dry run that reverts
   * may be a node's error), so it counts only once the buyer's count moved.
   */
  requireNonce?: boolean;
  pollMs: number;
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The first of the wallet's promise and the step's effect on chain.
 *
 * The promise's rejection (a refusal in the wallet) still ends the race:
 * the chain cannot show a step the buyer refused. A read that fails is
 * tried again on the next poll, never taken as an answer.
 */
export async function raceWithChain<A>(
  primary: Promise<A>,
  watch: ChainWatch,
  sleep: (ms: number) => Promise<void> = pause,
): Promise<{ kind: 'wallet'; value: A } | { kind: 'chain'; landed: StepLanded }> {
  let settled = false;
  const fromWallet = primary.then((value) => ({ kind: 'wallet' as const, value }));
  const fromChain = (async (): Promise<{ kind: 'chain'; landed: StepLanded } | null> => {
    while (!settled) {
      await sleep(watch.pollMs);
      if (settled) return null;
      try {
        if (watch.nonceBefore !== null) {
          const moved = (await watch.nonceNow()) > watch.nonceBefore;
          if (!moved && watch.requireNonce) continue;
        } else if (watch.requireNonce) {
          continue;
        }
        const landed = await watch.landed();
        if (landed && !settled) return { kind: 'chain', landed };
      } catch {
        /* An unreadable chain is asked again; it is never evidence. */
      }
    }
    return null;
  })();
  try {
    const first = await Promise.race([fromWallet, fromChain.then((found) => found ?? new Promise<never>(() => {}))]);
    return first;
  } finally {
    settled = true;
  }
}

/** Waits for a promise for at most `ms`, then answers `null` instead. */
export async function answerWithin<T>(promise: Promise<T>, ms: number): Promise<{ value: T } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then((value) => ({ value })),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** How long the wallet has to answer a quick question (its network, its account) before Pokter decides without it. */
export const WALLET_CHECK_MS = 8_000;

/**
 * The check before each prompt that the wallet is still on the hire's
 * network and account, without waiting forever for it.
 *
 * Both were asked with no time limit, and a wallet that stopped answering
 * after approving the last step held the page on that step indefinitely.
 * A wallet that answers is checked exactly as before. One that does not is
 * taken to be where it was when this hire began, which was checked, unless
 * it announced a network or account change since: then it cannot be
 * trusted and the hire stops with a reason instead of spinning.
 */
export async function confirmWalletStill(input: {
  chainId: number;
  account: Address;
  request: (method: 'eth_chainId' | 'eth_accounts') => Promise<unknown>;
  /** Moves the wallet to `chainId`, asking the buyer; throws when it cannot. */
  switchChain: () => Promise<void>;
  /** Whether the wallet announced a network or account change during this hire. */
  changed: () => boolean;
  ms?: number;
}): Promise<void> {
  const ms = input.ms ?? WALLET_CHECK_MS;
  const chain = await answerWithin(input.request('eth_chainId'), ms);
  if (chain === null) {
    if (input.changed()) throw new Error('WALLET_NOT_RESPONDING');
  } else if (Number(chain.value) !== input.chainId) {
    await input.switchChain();
  }
  const accounts = await answerWithin(input.request('eth_accounts'), ms);
  if (accounts === null) {
    if (input.changed()) throw new Error('WALLET_NOT_RESPONDING');
    return;
  }
  const list = accounts.value as string[] | undefined;
  if (!list?.length || list[0].toLowerCase() !== input.account.toLowerCase()) throw new Error('ACCOUNT_CHANGED');
}
