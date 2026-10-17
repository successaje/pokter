/*
 * `hire_refused` and `hire_failed` split a hire that stopped before funding
 * by whose side stopped it: the agent declining, needing credentials or
 * not being ready (refused), or a quote, network or payment problem
 * (failed). Counts only, per agent and day, like the rest: no brief, no
 * wallet, no error text.
 */
export const CONVERSION_EVENTS = ['listing_viewed', 'hire_opened', 'wallet_connected', 'funded', 'hire_refused', 'hire_failed'] as const;
export type ConversionEvent = (typeof CONVERSION_EVENTS)[number];

export interface ConversionCounts {
  listingViewed: number;
  hireOpened: number;
  walletConnected: number;
  funded: number;
  hireRefused: number;
  hireFailed: number;
  firstObservedDay: string | null;
}

export function isConversionEvent(value: unknown): value is ConversionEvent {
  return typeof value === 'string' && (CONVERSION_EVENTS as readonly string[]).includes(value);
}

export function emptyConversionCounts(): ConversionCounts {
  return { listingViewed: 0, hireOpened: 0, walletConnected: 0, funded: 0, hireRefused: 0, hireFailed: 0, firstObservedDay: null };
}

export function conversionField(event: ConversionEvent): keyof Omit<ConversionCounts, 'firstObservedDay'> {
  if (event === 'listing_viewed') return 'listingViewed';
  if (event === 'hire_opened') return 'hireOpened';
  if (event === 'wallet_connected') return 'walletConnected';
  if (event === 'hire_refused') return 'hireRefused';
  if (event === 'hire_failed') return 'hireFailed';
  return 'funded';
}

/** Which count a hire that stopped belongs to, by the layer it stopped in. */
export function stoppedHireEvent(layer: string | null): 'hire_refused' | 'hire_failed' | null {
  if (layer === 'seller') return 'hire_refused';
  if (layer === 'protocol' || layer === 'network' || layer === 'payment' || layer === 'terms') return 'hire_failed';
  // The buyer declining in their wallet, or fixing their own brief, is neither.
  return null;
}
