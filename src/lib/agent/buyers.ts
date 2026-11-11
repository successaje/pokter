/**
 * Who paid for an agent's work, as far as the job index and the listing say.
 *
 * Counts, not a verdict. A wallet Pokter does not declare is outside demand,
 * which is not the same as independent: one operator buying another
 * operator's agent passes every rule that defines outside demand. So the
 * count comes with the two facts that say how far it goes: whether a wallet
 * came back, and whether it runs an agent here itself. The second uses the
 * owner set the leaderboard uses for `operatorBuyers`, so the two pages give
 * one figure.
 */
export interface BuyerCounts {
  /** Distinct outside wallets that funded its paid work. */
  wallets: number;
  /** The paid jobs those wallets funded. */
  jobs: number;
  /** Wallets that funded more than one of them. */
  returning: number;
  /**
   * Wallets that own a listed agent, or this one. Null when the listing
   * was not read: that is not evidence that no buyer runs an agent.
   */
  ownAgent: number | null;
  /** Whether the agent's own owner is one of the wallets; null when its owner was not read. */
  ownerAmong: boolean | null;
}

export function buyerCounts(
  perWallet: ReadonlyMap<string, number>,
  { listedOwners, owner }: { listedOwners: ReadonlySet<string> | null; owner: string | null },
): BuyerCounts {
  const wallets = [...perWallet.keys()].map((wallet) => wallet.toLowerCase());
  const counts = [...perWallet.values()];
  const ownerWallet = owner?.toLowerCase() ?? null;
  return {
    wallets: wallets.length,
    jobs: counts.reduce((sum, count) => sum + count, 0),
    returning: counts.filter((count) => count > 1).length,
    ownAgent: listedOwners ? wallets.filter((wallet) => listedOwners.has(wallet) || wallet === ownerWallet).length : null,
    ownerAmong: ownerWallet ? wallets.includes(ownerWallet) : null,
  };
}

export interface BuyerNotePart {
  text: string;
  /** `watch` where the fact weakens the count above it. */
  tone: 'neutral' | 'watch';
  title?: string;
}

/**
 * The note under a profile's buyer count. Both facts are always said, the
 * one that flatters and the one that does not, and an ownership Pokter could
 * not read is said as that, not left out: an absent line would read as none.
 */
export function buyerNote(counts: BuyerCounts): BuyerNotePart[] {
  if (counts.wallets === 0) return [];
  const came = counts.returning > 0 ? `${counts.returning} came back` : counts.wallets === 1 ? 'Has not come back' : 'None came back';
  const parts: BuyerNotePart[] = [{ text: came, tone: 'neutral' }];
  if (counts.ownAgent === null) {
    parts.push({ text: 'agent owners not read', tone: 'neutral', title: 'Pokter could not read the listing just now, so whether these wallets run agents of their own is unknown.' });
  } else if (counts.ownAgent === 0) {
    parts.push({ text: counts.wallets === 1 ? 'owns no listed agent' : 'none owns a listed agent', tone: 'neutral' });
  } else {
    const text =
      counts.ownerAmong && counts.ownAgent === 1
        ? '1 is this agent’s owner'
        : `${counts.ownAgent} ${counts.ownAgent === 1 ? 'owns' : 'own'} a listed agent${counts.ownerAmong ? ', one of them this agent’s owner' : ''}`;
    parts.push({ text, tone: 'watch', title: 'Outside Pokter’s team, and not independent of the marketplace.' });
  }
  return parts;
}
