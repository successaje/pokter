/**
 * How the active network is described to a user.
 *
 * Deliberately not `server-only` and not `'use client'`: the same values have
 * to reach a server component rendering a receipt link and a client component
 * labelling a balance. One source means the two cannot disagree.
 *
 * Everything here derives from `NEXT_PUBLIC_ALTANA_NETWORK`, because the
 * browser has to be able to read it. `assertNetworkAgreement` checks that the
 * server's own `ALTANA_NETWORK` says the same thing — see the note there for
 * why that check exists.
 */

export const IS_TESTNET = process.env.NEXT_PUBLIC_ALTANA_NETWORK !== 'bnb';

export const CHAIN_ID = IS_TESTNET ? 97 : 56;

/** What the user is actually spending. Never hardcode this. */
export const NATIVE_SYMBOL = IS_TESTNET ? 'tBNB' : 'BNB';

/*
 * Named the way BNB Chain names itself. "BSC testnet" is accurate and is what
 * the tooling says, but the chain's own branding is BNB Chain, and a header
 * whose job is to stop someone mistaking test money for real money should not
 * make them translate an abbreviation first.
 */
export const NETWORK_LABEL = IS_TESTNET ? 'BNB Testnet' : 'BNB Chain';

/** The registry's network, which is mainnet even while escrow is on testnet. */
export const REGISTRY_NETWORK_LABEL = 'BNB Chain';

/**
 * Not derived from `IS_TESTNET`: the registry Pokter reads is the mainnet one
 * whatever network escrow settles on, which is the whole reason the two are
 * named separately here.
 */
export const REGISTRY_CHAIN_ID = 56;

/**
 * A chain id, written the way a reader can act on.
 *
 * Badges and error messages printed the number: "chain 56", "chain 97". Only
 * someone who already knows the ecosystem can tell from that whether their
 * money is real, which is exactly backwards — the people who need the warning
 * are the ones who cannot read it. The same two names already exist above for
 * the active network; this maps any id, because a page can show a mainnet
 * registry entry and a testnet escrow at once.
 *
 * An unknown id keeps its number rather than guessing a name.
 */
export function chainLabel(chainId: number): string {
  if (chainId === 56) return 'BNB Chain';
  if (chainId === 97) return 'BNB Testnet';
  return `chain ${chainId}`;
}

/**
 * What the payment token is worth.
 *
 * `NATIVE_SYMBOL` already tells the truth by becoming tBNB on testnet, but
 * the payment token renders as "$U" on both networks, so a card reading
 * "0.10 $U" looks like a price when the amount is faucet currency. Stating
 * it is cheaper than letting someone infer the wrong thing from a number,
 * and this product does not get to be careful about evidence and careless
 * about that.
 *
 * Null on mainnet, where the amount means what it says.
 */
export const PAYMENT_VALUE_NOTE = IS_TESTNET
  ? 'Test tokens — no real value'
  : null;

const EXPLORER = IS_TESTNET
  ? 'https://testnet.bscscan.com'
  : 'https://bscscan.com';

export function explorerTxUrl(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER}/address/${address}`;
}

/**
 * Where a user can obtain funds, or null when they cannot simply be given.
 *
 * Null on mainnet is the point. Offering a faucet for a chain that has none
 * tells someone their funds are free, which is the most direct way to have
 * them authorise real money believing it is play money.
 */
/*
 * Where testnet funds actually come from.
 *
 * The $U web faucet is unreliable in practice. BNB Chain's own support bot
 * dispenses testnet $U on request and has been the dependable route, so it
 * leads and the web faucet stays as a fallback. The bot takes a sentence
 * rather than a form, which is why the phrasing is carried here: somebody
 * told to "use the bot" and left to guess the wording is being sent to a
 * dead end politely.
 */
export const FAUCETS: {
  native: string;
  paymentToken: string;
  paymentTokenBot: { url: string; handle: string; ask: string } | null;
} | null = IS_TESTNET
  ? {
      native: 'https://www.bnbchain.org/en/testnet-faucet',
      paymentToken: 'https://united-coin-u.github.io/u-faucet/',
      paymentTokenBot: {
        url: 'https://t.me/bnbchain_official_bot',
        handle: '@bnbchain_official_bot',
        ask: 'I would like to get U to my wallet 0xYOUR_ADDRESS',
      },
    }
  : null;

/**
 * Fail loudly when the server and the browser disagree about the network.
 *
 * `ALTANA_NETWORK` decides what the server signs; `NEXT_PUBLIC_ALTANA_NETWORK`
 * decides what the interface says. They are separate variables, and today they
 * agree only because both are unset and default to testnet. Setting one at
 * migration and not the other produces the worst available outcome: real
 * mainnet transactions described to the user as testnet.
 *
 * Server-side callers only — the browser cannot see `ALTANA_NETWORK`.
 */
export function assertNetworkAgreement(): void {
  const serverIsTestnet = process.env.ALTANA_NETWORK !== 'bnb';
  if (serverIsTestnet !== IS_TESTNET) {
    throw new Error(
      `Network mismatch: the server signs on ${serverIsTestnet ? 'testnet' : 'mainnet'} ` +
        `while the interface says ${IS_TESTNET ? 'testnet' : 'mainnet'}. ` +
        'Set ALTANA_NETWORK and NEXT_PUBLIC_ALTANA_NETWORK to the same value.',
    );
  }
}
