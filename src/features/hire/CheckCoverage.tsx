import { planCheckPreviewForCategory } from '@/lib/delivery/plan-checks';
import { PLAN_PROOF_PREFIX } from '@/lib/delivery/plan-proof';
import { hirePlanProofSpec } from '@/lib/proofrun/hire-criteria';
import { hireReviewBinding } from '@/lib/proofrun/hire-review';
import type { Hire } from '@/lib/hire/useHire';

/** The same checker named on a delivered job, before the buyer funds it. */
export function CheckCoverage({ category, quote }: { category: string; quote: Hire['reviewQuote'] }) {
  const coverage = planCheckPreviewForCategory(category);
  const spec = hirePlanProofSpec({ category });
  const binding = spec ? hireReviewBinding(spec, quote, PLAN_PROOF_PREFIX) : null;
  return (
    <section aria-label="What Pokter can check after delivery" className="rounded-[14px] border border-rule bg-raised p-5">
      <p className="t-label">{spec ? 'Before you fund' : 'After delivery'}</p>
      <h2 className="mt-1 text-base font-semibold text-ink">What Pokter can check</h2>
      {spec && (
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          {binding?.kind === 'signed-terms'
            ? 'The agent signed this check plan with its quote. Pokter will compare the delivered answer with this versioned checker.'
            : 'Pokter recorded this check plan, but the agent did not sign it with its quote.'}
          {' '}Plan hash: <span className="t-readout break-all">{spec.specHash}</span>.
        </p>
      )}
      {coverage ? (
        <>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            If the agent delivers a structured {coverage.label.toLowerCase()}, Pokter can run these checks on its answer:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-ink-2">
            {coverage.preview.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
            These checks read the answer and, where available, your brief. Missing data is marked not verified. Method: <span className="t-readout">{coverage.method}</span>.
          </p>
          <details className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
            <summary className="cursor-pointer font-medium text-ink-2">What these checks do not establish</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {coverage.notCovered.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </details>
        </>
      ) : (
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          Pokter has no category-specific delivery check for this agent. A structured answer can still be checked for a date and named sources; its substance is not verified here.
        </p>
      )}
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
        {binding?.kind === 'signed-terms'
          ? 'The signature binds the listed check plan, not a promise to pass it. '
          : 'These are Pokter’s delivery checks, not terms the agent agreed to. '}
        You decide whether to release or dispute the escrow after reading the delivery.
      </p>
    </section>
  );
}
