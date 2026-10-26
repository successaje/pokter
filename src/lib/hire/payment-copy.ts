import { formatUnits } from 'viem';

import type { CommissionPlan } from './commission-plan';

type Planned = Extract<CommissionPlan, { ok: true }>;

/**
 * The words on the final payment screen, from the plan the transaction is
 * built from.
 *
 * The review screen named the signed USDT price and this screen still said
 * "Pay … $U" and "Fund escrow · … $U" while the wallet was about to move the
 * USDT amount — two different statements about money on consecutive screens.
 * So the amount, the symbol, the balance and the advice for a short wallet
 * all come from one place, the plan, and a `$U` hire reads as it always has.
 */
export interface PaymentCopy {
  /** "Pay {amount}" — the amount as the transaction carries it. */
  amountLabel: string;
  buttonLabel: string;
  balanceLabel: string;
  /** The wallet's balance in the hire's token, two decimals; "—" when unknown. */
  balanceValue: string;
  /** Said under the balance when it is short. */
  shortNote: string | null;
  /** How to get the money, when the wallet is short. */
  topUp: 'dollar-u-faucet' | 'add-token' | null;
  /** Under the connect button, before a wallet is connected. */
  connectNote: string;
}

export function paymentCopy(plan: Planned, input: {
  networkLabel: string;
  testnet: boolean;
  walletMode: 'external' | 'passkey' | null;
  /** The balance in the plan's token, or null when not read yet. */
  balanceRaw: bigint | null;
  /** For $U: whether a swap for the shortfall has no pool on this network. */
  swapHasNoPool: boolean;
  /** The gas token's symbol, for the $U swap note. */
  nativeSymbol: string;
}): PaymentCopy {
  const short = input.balanceRaw !== null && input.balanceRaw < plan.amountRaw;
  /* $U reads exactly as it always has; a signed token says when it is a test token. */
  const testSuffix = input.testnet && plan.signedAmount ? ' (test token)' : '';
  const shortNote = !short
    ? null
    : plan.signedAmount
      ? `Short of the signed price. Pokter does not swap into ${plan.symbol}; add ${plan.symbol} to this wallet.`
      : input.swapHasNoPool
        ? `Short, and there is no pool to buy $U from on ${input.networkLabel}.`
        : input.walletMode === 'passkey'
          ? `Short. Pokter will swap ${input.nativeSymbol} for the difference if you hold enough.`
          : 'Short of the budget.';
  return {
    amountLabel: `${plan.amountLabel}${testSuffix}`,
    buttonLabel: `Fund escrow · ${plan.amountLabel}`,
    balanceLabel: `${plan.symbol} to pay with`,
    balanceValue: input.balanceRaw === null ? '—' : Number(formatUnits(input.balanceRaw, plan.decimals)).toFixed(2),
    shortNote,
    topUp: !short ? null : plan.signedAmount ? 'add-token' : input.testnet ? 'dollar-u-faucet' : null,
    /* A passkey wallet funds $U only (`hire-paths`), so a signed-token hire never suggests one. */
    connectNote: plan.signedAmount
      ? `This hire is paid in ${input.testnet ? 'test' : 'real'} ${plan.symbol} on ${input.networkLabel}, from a browser or mobile wallet.`
      : input.testnet
        ? 'A passkey wallet takes about ten seconds to make, and needs no extension.'
        : `This hire is paid in real ${plan.symbol} on ${input.networkLabel}, from a browser or mobile wallet.`,
  };
}
