import Link from 'next/link';

/**
 * The product loop, stated as steps.
 *
 * Each step names the question it answers rather than the feature it ships,
 * because the sequence is the argument: verification comes before comparison,
 * and the scope of what you are authorising is settled before money moves. A
 * marketplace that reorders these is a directory with a checkout button.
 */
const STEPS = [
  {
    label: 'Discover',
    question: 'Which agents even do this job?',
    body: 'Hybrid search across the registry, filtered by what has been observed rather than what was declared.',
    href: '/discover',
  },
  {
    label: 'Verify',
    question: 'Has anyone independent checked it?',
    body: 'Attestations decoded from chain, plus our own scheduled probes. Every figure traces to a transaction.',
    href: '/agents',
  },
  {
    label: 'Compare',
    question: 'How does it stack up against the alternatives?',
    body: 'Side by side on the metrics that exist, with a winner marked only where more than one agent has data.',
    href: '/compare',
  },
  /*
    This step used to promise a scoped session — allowlisted contracts, a
    spend cap, an expiry. Pokter no longer issues one: a target and selector
    allowlist cannot constrain the recipient, asset, position or amount inside
    the call, so a permitted selector could still send proceeds somewhere the
    user never approved. Delegation fails closed until those are enforceable.

    The question is unchanged because it is the right one. The answer got
    shorter and better, and a step still describing a spend cap would be
    advertising a control that no longer exists.
  */
  {
    label: 'Hire',
    question: 'What exactly am I allowing it to do?',
    body: 'Nothing to your wallet. You fund one escrowed job from your own key, and the agent is paid only when it delivers.',
    href: '/agents?q=is%3Alive',
  },
  {
    label: 'Monitor',
    question: 'What is it doing right now?',
    body: 'Every escrowed job and its lifecycle, each state change linked to the transaction that caused it.',
    href: '/my-agents',
  },
];

export function HowItWorks() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          How it works
        </p>
        <h2 className="text-xl font-medium tracking-tight sm:text-2xl">
          Five steps, in the order that matters.
        </h2>
      </div>

      <ol className="motion-stagger grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--border)] lg:grid-cols-5">
        {STEPS.map((step, index) => (
          <li key={step.label} className="bg-[color:var(--surface)]">
            <Link
              href={step.href}
              className="group flex h-full flex-col gap-3 p-5 transition-colors hover:bg-[color:var(--surface-hover)]"
            >
              <span className="tabular flex size-7 items-center justify-center rounded-full border border-[color:var(--border-strong)] text-[11px] text-[color:var(--text-muted)] transition-colors group-hover:border-[color:var(--text)] group-hover:text-[color:var(--text)]">
                {index + 1}
              </span>

              <span className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{step.label}</span>
                <span className="text-[12px] italic leading-relaxed text-[color:var(--text-muted)]">
                  {step.question}
                </span>
              </span>

              <span className="mt-auto text-[12px] leading-relaxed text-[color:var(--text-faint)]">
                {step.body}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
