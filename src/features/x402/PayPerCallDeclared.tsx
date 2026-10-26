import { declaresPayPerCall } from '@/lib/x402/declared';

/*
 * Pay-per-call, named as a route of its own while Pokter takes no x402
 * payments. Shown only when the registration declares an endpoint, and
 * worded for that: a declaration, not a working endpoint and not a price.
 * An agent that cannot be hired through escrow may still be paid per call
 * elsewhere, which "cannot be hired" alone used to hide.
 */
export const PAY_PER_CALL_DECLARED = 'Declares pay-per-call; payments not supported on Pokter.';

export async function PayPerCallDeclared({ chainId, tokenId }: { chainId: number; tokenId: string }) {
  if (!(await declaresPayPerCall(chainId, tokenId))) return null;
  return (
    <div id="pay-per-call" className="scroll-mt-32 flex flex-col gap-1.5 rounded-[14px] border border-rule bg-raised p-5 sm:p-6">
      <span className="t-label">Pay per call (x402)</span>
      <p className="text-[14px] text-ink">{PAY_PER_CALL_DECLARED}</p>
      <p className="text-[12.5px] leading-snug text-ink-3">
        Declared in registration; availability and price aren’t verified here. Prices on this page are for hiring through escrow.
      </p>
    </div>
  );
}
