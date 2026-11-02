import { planCheckPreviewForCategory } from '@/lib/delivery/plan-checks';

/** The same checker named on a delivered job, before the buyer funds it. */
export function CheckCoverage({ category }: { category: string }) {
  const coverage = planCheckPreviewForCategory(category);
  return (
    <section aria-label="What Pokter can check after delivery" className="rounded-[14px] border border-rule bg-raised p-5">
      <p className="t-label">After delivery</p>
      <h2 className="mt-1 text-base font-semibold text-ink">What Pokter can check</h2>
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
        These are Pokter’s delivery checks. They are not, by themselves, terms the agent signed. You decide whether to release or dispute the escrow after reading the delivery.
      </p>
    </section>
  );
}
