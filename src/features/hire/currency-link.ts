/** A token address from a hire link (`?pay=`), shape-checked only; the hire decides whether it is offered there. */
export function currencyFromLink(pay: string | undefined): string | null {
  return typeof pay === 'string' && /^0x[0-9a-fA-F]{40}$/.test(pay) ? pay : null;
}
