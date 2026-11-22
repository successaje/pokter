import { PAYMENT_TERMS } from '@/lib/erc8183/payment-terms';
import { Icon } from '@/ui/icons';

/**
 * The five hiring steps, as five ruled cells under two brackets.
 *
 * They were five coloured cards, and before that five equal cells with a
 * small green "free" in the corner of two of them. Both lost the one
 * sentence this section exists for — you can stop before you fund — the
 * first in a word nobody read, the second in five colours that said five
 * different things were happening.
 *
 * So the line is drawn where it falls. A bracket spans the two steps that
 * cost nothing and another, in the signal colour, spans the three that run
 * through escrow, and the cells under them stay one colour, because they
 * are one process. On a phone, where brackets would have nowhere to sit,
 * each cell says which side it is on.
 */

const STEPS = [
  {
    step: 'Find',
    icon: Icon.Search,
    body: 'Describe the task in your words. Pokter reads it for intent and ranks measured agents against it.',
    free: true,
  },
  {
    step: 'Evaluate',
    icon: Icon.Eye,
    body: 'See what each agent claims, what Pokter observed, its signed price and what it needs from you.',
    free: true,
  },
  {
    step: 'Hire',
    icon: Icon.Lock,
    body: 'Confirm the job and fund one escrow. The agent can only be paid by delivering.',
    free: false,
  },
  {
    step: 'Receive',
    icon: Icon.Inbox,
    body: 'The agent delivers a file and commits its hash on chain. Pokter checks they match.',
    free: false,
  },
  {
    step: 'Review',
    icon: Icon.Shield,
    body: PAYMENT_TERMS.reviewBrief,
    free: false,
  },
] as const;

/* The free steps come first, so one bracket covers them and the other the rest. */
const FREE_STEPS = STEPS.filter((item) => item.free).length;

function Bracket({ label, tone, className, span }: { label: string; tone: 'quiet' | 'signal'; className?: string; span: number }) {
  const line = tone === 'signal' ? 'bg-signal' : 'bg-rule-strong';
  return (
    <div className={className} style={{ gridColumn: `span ${span} / span ${span}` }}>
      <span className="t-label block pb-2.5 text-center">{label}</span>
      <div aria-hidden className="relative h-2">
        <span className={`absolute inset-x-0 top-0 h-[2px] ${line}`} />
        <span className={`absolute left-0 top-0 h-2 w-[2px] ${line}`} />
        <span className={`absolute right-0 top-0 h-2 w-[2px] ${line}`} />
      </div>
    </div>
  );
}

export function StepRail() {
  return (
    <>
      <div className="mb-10 flex max-w-2xl flex-col gap-3.5">
        <span className="t-label inline-flex items-center gap-2">
          <span aria-hidden className="size-[7px] bg-signal" />
          How hiring works
        </span>
        <h2 id="how-title" className="t-h1">
          Five steps, and you can stop before you fund.
        </h2>
      </div>

      {/* The brackets take their spans from the steps, so they cannot disagree with them. */}
      <div className="hidden grid-cols-5 lg:grid" aria-hidden>
        <Bracket label="Free · nothing to connect" tone="quiet" className="pr-3" span={FREE_STEPS} />
        <Bracket label="Through one escrow · paid only by delivering" tone="signal" className="pl-3" span={STEPS.length - FREE_STEPS} />
      </div>

      <ol aria-label="The five steps of a hire" className="grid grid-cols-1 border-l border-t border-rule sm:grid-cols-2 lg:mt-3 lg:grid-cols-5">
        {STEPS.map((item, i) => (
          <li
            key={item.step}
            className="group relative flex flex-col gap-4 border-b border-r border-rule bg-raised/50 p-5 transition-colors duration-200 hover:bg-raised sm:min-h-[220px] xl:p-6"
          >
            {/* Which side of the line it is on, drawn in as the pointer arrives. */}
            <span
              aria-hidden
              className={`absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:scale-x-100 ${item.free ? 'bg-ink' : 'bg-signal'}`}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="t-readout text-[12px] text-ink-3">{String(i + 1).padStart(2, '0')}</span>
              <span className="grid size-9 place-items-center rounded-full border border-rule bg-paper text-ink-2 transition-colors group-hover:border-ink group-hover:text-ink">
                <item.icon size={16} />
              </span>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:mt-10">
              <h3 className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.02em]">
                {item.step}
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] lg:hidden ${item.free ? 'bg-sunken text-ink-2' : 'bg-signal-wash text-ink'}`}
                >
                  {item.free ? 'Free' : 'Escrow'}
                </span>
              </h3>
              <p className="text-[13.5px] leading-relaxed text-ink-2">{item.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
