/**
 * Touchstone's verdict, pure: facts in, Safe / Caution / Avoid out, with
 * every reason it rests on.
 *
 * Avoid when the token cannot be sold, or takes 10% or more on a trade.
 * Caution when it cannot be tested, takes a smaller tax, has an active
 * owner who can mint, blacklist, change fees or stop trading, is
 * upgradable, or has thin or unlocked liquidity. Safe otherwise, and only
 * for what was checked: a clean contract can still be a bad investment.
 */

export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TokenFacts {
  isContract: boolean;
  symbol: string | null;
  probe: { stage: Stage; buyTax: number | null; sellTax: number | null } | null;
  /** `isContract` null when the owner's code could not be read: then it is named, not labelled. */
  owner: { address: string | null; renounced: boolean; isContract?: boolean | null };
  powers: string[];
  upgradable: boolean;
  liquidityUsd: number | null;
  lpBurnedShare: number | null;
  ownerShare: number | null;
  burnedShare: number | null;
}

export type Verdict = 'Safe' | 'Caution' | 'Avoid';

/** Below this, who holds the LP tokens matters: a rug is one withdrawal. */
export const THIN_POOL_USD = 250_000;

/** EIP-7702 delegation: a wallet whose code is a pointer, not a token. */
export const isDelegatedWallet = (code: string | undefined | null) => typeof code === 'string' && code.toLowerCase().startsWith('0xef0100');

const pct = (value: number) => `${Math.round(value * 1000) / 10}%`;

export function touchstoneVerdict(facts: TokenFacts): { verdict: Verdict; reasons: Array<{ level: 'avoid' | 'caution' | 'ok'; finding: string }> } {
  const reasons: Array<{ level: 'avoid' | 'caution' | 'ok'; finding: string }> = [];
  const avoid = (finding: string) => reasons.push({ level: 'avoid', finding });
  const caution = (finding: string) => reasons.push({ level: 'caution', finding });
  const ok = (finding: string) => reasons.push({ level: 'ok', finding });

  if (!facts.isContract) {
    avoid('This address has no contract code: it is a wallet, not a token.');
    return { verdict: 'Avoid', reasons };
  }

  const probe = facts.probe;
  if (!probe || probe.stage === 1) caution('No PancakeSwap v2 pair with WBNB, so a buy and sell could not be simulated. Taxes and sellability are unverified.');
  else if (probe.stage === 2) caution('Buying on PancakeSwap v2 reverts: trading may be disabled, limited to some wallets, or the token trades elsewhere. Not tested further.');
  else if (probe.stage === 3) avoid('A simulated buy went through but delivered no tokens.');
  else if (probe.stage === 4) avoid('After buying, the router could not be approved to sell: tokens may be locked in the buyer’s wallet.');
  else if (probe.stage === 5) caution('After buying, no sell price could be quoted.');
  else if (probe.stage === 6) avoid('Honeypot: a simulated buy worked and selling the same tokens back reverted.');
  else {
    const worst = Math.max(probe.buyTax ?? 0, probe.sellTax ?? 0);
    const taxes = `buy ${pct(probe.buyTax ?? 0)}, sell ${pct(probe.sellTax ?? 0)}`;
    if (worst >= 0.1) avoid(`Takes ${taxes} on trades, measured by simulating a buy and a sell.`);
    else if (worst >= 0.01) caution(`Takes a tax on trades: ${taxes}, measured by a simulated buy and sell.`);
    else ok(`Buys and sells freely in simulation; tax ${taxes}.`);
  }

  if (facts.owner.renounced) ok('Ownership is renounced: no owner can change the contract’s settings.');
  else if (facts.powers.length > 0) {
    const kind = facts.owner.isContract === true ? 'a contract, ' : facts.owner.isContract === false ? 'a wallet, ' : '';
    caution(`An active owner (${kind}${facts.owner.address}) can call: ${facts.powers.join(', ')}.${facts.owner.isContract ? ' A contract owner acts only as its own code allows; check what that contract is.' : ''}`);
  }
  else if (facts.owner.address) ok(`Has an owner (${facts.owner.address}), but no mint, blacklist, fee or pause functions were found.`);
  else if (facts.powers.length === 0) ok('No owner function and no mint, blacklist, fee or pause functions were found.');

  if (facts.upgradable) caution('Upgradable proxy: whoever controls the proxy can replace the code, including everything above.');

  if (facts.liquidityUsd !== null) {
    if (facts.liquidityUsd < 20_000) caution(`Thin liquidity: about ${Math.round(facts.liquidityUsd).toLocaleString('en-US')} USD in the PancakeSwap v2 WBNB pool, so trades move the price.`);
    else ok(`About ${Math.round(facts.liquidityUsd).toLocaleString('en-US')} USD of liquidity in the PancakeSwap v2 WBNB pool.`);
  }
  // A deep pool is many providers' money; a thin one is often one wallet's, and pullable.
  if (facts.lpBurnedShare !== null && facts.liquidityUsd !== null && facts.liquidityUsd < THIN_POOL_USD) {
    if (facts.lpBurnedShare >= 0.9) ok(`${pct(facts.lpBurnedShare)} of the pool’s LP tokens are burned, so that liquidity cannot be pulled.`);
    else if (!facts.owner.renounced) caution(`Only ${pct(facts.lpBurnedShare)} of the small pool’s LP tokens are burned; the rest can be withdrawn by whoever holds them.`);
  }
  if (facts.ownerShare !== null && facts.ownerShare >= 0.2 && !facts.owner.renounced) caution(`The owner holds ${pct(facts.ownerShare)} of the supply.`);

  const verdict: Verdict = reasons.some((r) => r.level === 'avoid') ? 'Avoid' : reasons.some((r) => r.level === 'caution') ? 'Caution' : 'Safe';
  return { verdict, reasons };
}

/** The token named in a brief. */
export function readTouchstoneBrief(brief: string): { token: string | null } {
  return { token: brief.match(/0x[0-9a-fA-F]{40}/)?.[0] ?? null };
}
