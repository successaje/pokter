'use client';

import Link from 'next/link';

import { FAUCETS } from '@/lib/network/presentation';
import { formatBudget } from '@/lib/erc8183/pricing';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import type { Hire } from './useHire';

/**
 * What went wrong, said in terms of where the sequence stopped.
 *
 * The browser-wallet path is five signatures. "No transaction was submitted"
 * is true if the first was refused and false for every one after it, and the
 * old panel said it regardless. The headline here follows the step reached,
 * and each step offers the recovery that fits it.
 */
export function HireError({ hire }: { hire: Hire }) {
  const { error, externalStep, externalJobId, heldAfterFailure, budget, revoked, revoking, revokeAllowance } = hire;
  if (!error) return null;

  const step = externalStep;
  const jobLabel = externalJobId ? `Job #${externalJobId.toString()}` : 'The job';

  const headline =
    step === null || step === 'connecting' || step === 'creating'
      ? 'The job was not created. No money moved.'
      : step === 'registering' || step === 'budgeting'
        ? `${jobLabel} was created but never funded. No money moved; it expires unfunded.`
        : step === 'approving'
          ? `${jobLabel} is approved but not funded. No money moved.`
          : step === 'funding'
            ? 'The funding transaction was not confirmed.'
            : step === 'confirming'
              ? 'Funding was sent and is still waiting for confirmation.'
              : 'The hire did not complete.';

  /* A sentence that is only true before anything landed on chain. */
  const detail = step && step !== 'connecting' && step !== 'creating' ? error.replace(/\s*No transaction was submitted\.?/i, '') : error;
  const checkJobsFirst = step === 'funding' || step === 'confirming';
  const linkClass = 'tap text-body-s font-medium text-info underline decoration-dotted underline-offset-2';

  return (
    <Callout tone="negative" title={headline}>
      {detail && <p>{detail}</p>}

      {checkJobsFirst && (
        <p>
          Before trying again, open{' '}
          <Link href="/jobs" className="font-medium underline underline-offset-2">
            Jobs
          </Link>
          . If the money moved, the job is there and funding it twice would create a second one.
        </p>
      )}

      {heldAfterFailure && (
        <p>The {heldAfterFailure} $U acquired before this failed is still in your wallet. Nothing was escrowed. Trying again spends it rather than swapping a second time.</p>
      )}

      {(step === 'approving' || step === 'funding') && (
        <div className="rounded-md border border-line bg-surface p-3">
          <p>
            {revoked
              ? 'The approval is back to zero. Nothing of yours is spendable by the escrow.'
              : `The escrow is approved to draw ${formatBudget(budget)} and did not. Trying again reuses that approval, or you can take it back now.`}
          </p>
          {!revoked && (
            <Button size="sm" variant="ghost" onClick={revokeAllowance} loading={revoking} className="mt-2 -ml-3">
              Withdraw the approval
            </Button>
          )}
        </div>
      )}

      {FAUCETS && (/tBNB/i.test(error) || (/\$U/i.test(error) && !heldAfterFailure)) && (
        <p className="flex flex-wrap gap-3">
          {/tBNB/i.test(error) && (
            <a href={FAUCETS.native} target="_blank" rel="noreferrer noopener" className={linkClass}>
              Get test BNB for gas ↗
            </a>
          )}
          {/\$U/i.test(error) && !heldAfterFailure && (
            <a href={FAUCETS.paymentToken} target="_blank" rel="noreferrer noopener" className={linkClass}>
              Get free $U ↗
            </a>
          )}
        </p>
      )}
    </Callout>
  );
}
