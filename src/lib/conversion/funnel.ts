export const CONVERSION_EVENTS = ['listing_viewed', 'hire_opened', 'wallet_connected', 'funded'] as const;
export type ConversionEvent = (typeof CONVERSION_EVENTS)[number];

export interface ConversionCounts {
  listingViewed: number;
  hireOpened: number;
  walletConnected: number;
  funded: number;
  firstObservedDay: string | null;
}

export function isConversionEvent(value: unknown): value is ConversionEvent {
  return typeof value === 'string' && (CONVERSION_EVENTS as readonly string[]).includes(value);
}

export function emptyConversionCounts(): ConversionCounts {
  return { listingViewed: 0, hireOpened: 0, walletConnected: 0, funded: 0, firstObservedDay: null };
}

export function conversionField(event: ConversionEvent): keyof Omit<ConversionCounts, 'firstObservedDay'> {
  if (event === 'listing_viewed') return 'listingViewed';
  if (event === 'hire_opened') return 'hireOpened';
  if (event === 'wallet_connected') return 'walletConnected';
  return 'funded';
}
