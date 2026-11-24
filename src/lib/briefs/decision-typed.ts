import { getAddress, type Address } from 'viem';

/**
 * A poster's decisions on their own request, as EIP-712 typed data:
 * choosing a proposal, taking that choice back, and withdrawing the
 * request. They are the same decisions, field for field, as the plain
 * messages a browser wallet signs (`awardMessage`, `reopenMessage`,
 * `withdrawMessage`), for a wallet that signs only typed data, as an
 * Agentic Wallet does.
 *
 * Each starts with a fixed `action` sentence, so the wallet's own screen
 * says in words what is being agreed to and that it moves no money. The
 * domain names Pokter and BNB Smart Chain, the chain the wallet signs on.
 * It has no verifying contract, because nothing on chain reads these:
 * Pokter checks them, as it checks the plain ones.
 *
 * Shared by the route that hands the typed data out and the routes that
 * check the signatures, so the two cannot describe different messages.
 */

export const DECISION_DOMAIN = { name: 'Pokter', version: '1', chainId: 56 } as const;

export const DECISION_ACTIONS = {
  ChooseProposal: 'Choose this proposal on my Pokter request. Choosing moves no money.',
  ChangeChoice: 'Take back my choice of proposal on my Pokter request. This moves no money.',
  WithdrawRequest: 'Withdraw my request on Pokter. This moves no money.',
} as const;

export const DECISION_TYPES = {
  ChooseProposal: [
    { name: 'action', type: 'string' },
    { name: 'request', type: 'string' },
    { name: 'proposal', type: 'string' },
    { name: 'poster', type: 'address' },
    /* Empty unless the proposal is above the budget: then the amount the poster agrees to fund, as in `awardMessage`. */
    { name: 'aboveMyBudgetIWillFund', type: 'string' },
  ],
  ChangeChoice: [
    { name: 'action', type: 'string' },
    { name: 'request', type: 'string' },
    { name: 'proposalNoLongerChosen', type: 'string' },
    { name: 'poster', type: 'address' },
    /* Dated, as `reopenMessage` is, so a signature cannot be kept and replayed against a later choice. */
    { name: 'decidedAt', type: 'string' },
  ],
  WithdrawRequest: [
    { name: 'action', type: 'string' },
    { name: 'request', type: 'string' },
    { name: 'poster', type: 'address' },
  ],
} as const;

export type DecisionType = keyof typeof DECISION_TYPES;

/** One decision's typed data, with only its own type. */
export interface TypedDecision<T extends DecisionType> {
  domain: typeof DECISION_DOMAIN;
  types: Pick<typeof DECISION_TYPES, T>;
  primaryType: T;
  message: Record<string, string>;
}

/** Any one of the decisions. */
export type DecisionTypedData = { [K in DecisionType]: TypedDecision<K> }[DecisionType];

function typed<T extends DecisionType>(primaryType: T, message: Record<string, string>): TypedDecision<T> {
  return { domain: DECISION_DOMAIN, types: { [primaryType]: DECISION_TYPES[primaryType] } as Pick<typeof DECISION_TYPES, T>, primaryType, message: { action: DECISION_ACTIONS[primaryType], ...message } };
}

/** Choosing a proposal; `fundsAboveBudget` as `awardMessage` takes it. */
export function chooseTypedData(briefId: string, bidId: string, poster: string, fundsAboveBudget: string | null = null) {
  return typed('ChooseProposal', { request: briefId, proposal: bidId, poster: getAddress(poster), aboveMyBudgetIWillFund: fundsAboveBudget ?? '' });
}

export function changeChoiceTypedData(briefId: string, bidId: string, poster: string, decidedAt: string) {
  return typed('ChangeChoice', { request: briefId, proposalNoLongerChosen: bidId, poster: getAddress(poster), decidedAt });
}

export function withdrawTypedData(briefId: string, poster: string) {
  return typed('WithdrawRequest', { request: briefId, poster: getAddress(poster) });
}

const DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
] as const;

/** The typed data as a wallet's `eth_signTypedData_v4` takes it: the domain's own type written out. */
export function walletTypedData(data: DecisionTypedData) {
  return { domain: data.domain, types: { EIP712Domain: DOMAIN_TYPE, ...data.types }, primaryType: data.primaryType, message: data.message };
}

/** The JSON-RPC request an Agentic Wallet's `sign-message preview --message` takes, for this wallet. */
export function walletSignRequest(wallet: Address, data: DecisionTypedData): string {
  return JSON.stringify({ method: 'eth_signTypedData_v4', params: [getAddress(wallet), JSON.stringify(walletTypedData(data))] });
}

/** A value as one single-quoted shell word. */
export function shellWord(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
