import Link from 'next/link';

import type { HeadlineId, StoppedGroup } from '@/lib/builder/diagnostics/report';
import type { Remediation } from '@/lib/builder/diagnostics/remediation';
import { jobHref } from '@/lib/jobs/href';
import { LinkButton } from '@/ui/Button';
import { Details, Readout } from '@/ui/Data';
import { EmptyState, LoadingRegion, Notice, Skeleton } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { loadBuilderDiagnostics } from './diagnostics-data';
import { WITHHELD_REASON_TEXT } from '@/lib/builder/diagnostics/withheld';

/**
 * "Why aren't buyers successfully hiring my agent?", answered on the page.
 *
 * The order is the argument. The headline first, because a builder with one
 * minute should read one sentence and know what to change. Then the stages
 * in the order a hire passes through them, each carrying its own
 * denominator so a number cannot be quoted without it. Then what was left
 * out of the figures and why — Pokter probes every agent it lists, and a
 * builder who is not told that will read Pokter's own traffic as customers.
 * Definitions and the limits of the measurement last, where somebody
 * checking a figure will look for them, not buried on another page.
 */

const DAY = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const HEADLINE_TONE: Record<HeadlineId, 'bad' | 'watch' | 'neutral' | 'ok' | 'info'> = {
  'blocked-before-any-buyer': 'bad',
  'buyers-stopped': 'watch',
  'deliveries-lapsed': 'watch',
  'priced-not-funded': 'watch',
  'no-buyer-yet': 'neutral',
  'nothing-failing': 'ok',
  'not-measurable': 'info',
};

function Fix({ remediation }: { remediation: Remediation | null }) {
  if (!remediation) return null;
  return (
    <LinkButton href={remediation.fix.href} intent="secondary" size="s" trailing={<Icon.ArrowUpRight size={13} />}>
      {remediation.fix.label}
    </LinkButton>
  );
}

/** One stage of the hire, with what its number counts beneath it. */
function Stage({
  label,
  value,
  note,
  muted,
}: {
  label: string;
  value: string;
  note: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-rule py-3 first:border-t-0 sm:flex-row sm:items-baseline sm:gap-6">
      <span className="t-label shrink-0 sm:w-56">{label}</span>
      <span className={`t-readout shrink-0 text-lg leading-tight sm:w-24 ${muted ? 'text-ink-3' : 'text-ink'}`}>{value}</span>
      <span className="text-[12.5px] leading-relaxed text-ink-3">{note}</span>
    </div>
  );
}

function Stopped({ group }: { group: StoppedGroup }) {
  return (
    <li className="flex flex-col gap-2 rounded-[12px] border border-rule bg-raised p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="t-readout text-[13px] font-medium">{group.code}</span>
        <span className="text-[12.5px] text-ink-3">
          {group.attempts} of {group.of} ask{group.of === 1 ? '' : 's'}
          {group.tries > group.attempts ? ` · ${group.tries} requests after retries` : ''}
          {group.layer ? ` · ${group.layer} layer` : ''} · last {DAY(group.lastAt)}
        </span>
      </div>
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        {group.remediation?.reason ?? `Pokter has no specific fix recorded for ${group.code}.`}
      </p>
      {group.sellerReason && (
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          {group.sellerReason === WITHHELD_REASON_TEXT ? (
            <>
              Your agent gave a reason Pokter would not repeat: it could not be bounded safely, so it is withheld rather
              than shown in part. Check your own logs for this request.
            </>
          ) : (
            <>Your agent said: &ldquo;{group.sellerReason}&rdquo;</>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Fix remediation={group.remediation} />
      </div>
    </li>
  );
}

const DELIVERY_LABEL = {
  lapsed: 'Deadline passed undelivered',
  'refused-funded-job': 'Refused a funded job',
  disputed: 'Disputed and refunded',
} as const;

export function DiagnosticsSkeleton() {
  return (
    <LoadingRegion label="Loading hire diagnostics">
      <div className="flex flex-col gap-6">
        <Skeleton className="h-24 rounded-[12px]" />
        <Skeleton className="h-48 rounded-[12px]" />
        <Skeleton className="h-32 rounded-[12px]" />
      </div>
    </LoadingRegion>
  );
}

export async function Diagnostics({ chainId, tokenId }: { chainId: number; tokenId: string }) {
  const result = await loadBuilderDiagnostics(chainId, tokenId);

  if (!result.ok) {
    /*
     * Three different refusals, said as three different things. "Pokter
     * could not check" was once reported as "not yours", which sends a
     * builder hunting for a transfer that never happened.
     */
    const registryDown = result.kind === 'refused' && result.reason === 'registry-unavailable';
    return (
      <Notice
        tone={registryDown || result.kind === 'unavailable' ? 'watch' : 'info'}
        title={
          result.kind === 'unavailable'
            ? 'Diagnostics are unavailable'
            : result.reason === 'no-session'
              ? 'Verify your wallet to see diagnostics'
              : registryDown
                ? 'Pokter could not confirm who owns this agent'
                : 'These diagnostics are not yours to read'
        }
        action={
          result.kind === 'refused' && result.reason === 'no-session' ? (
            <LinkButton href={`/build/import?chainId=${chainId}&tokenId=${tokenId}`} size="s" intent="secondary">
              Verify ownership
            </LinkButton>
          ) : undefined
        }
      >
        {result.message}
      </Notice>
    );
  }

  const d = result.diagnostics;
  const { demand, funding, delivery } = d;
  const windowNote = `Last ${d.window.days} days (UTC days).`;

  return (
    <div className="flex flex-col gap-10">
      <Notice tone={HEADLINE_TONE[d.headline.id]} title={d.headline.title} action={<Fix remediation={d.headline.remediation} />}>
        {d.headline.body}
      </Notice>

      <section aria-labelledby="diag-stages-title" className="flex flex-col gap-3">
        <div>
          <h3 id="diag-stages-title" className="t-h3">
            The hire, stage by stage
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
            Each figure says what it counts. Nothing here is Pokter&rsquo;s own traffic; see &ldquo;Not counted as
            demand&rdquo; below for what was removed and how much of it there was.
          </p>
        </div>
        <div className="rounded-[14px] border border-rule bg-raised px-4 py-2 sm:px-5">
          <Stage
            label="Hire page opened"
            value={demand.hireFlowOpens === null ? 'Not counted' : String(demand.hireFlowOpens)}
            muted={!demand.hireFlowOpens}
            note={
              demand.hireFlowOpens === null
                ? 'The funnel store could not be read, so this is not a zero.'
                : `Tab sessions, not people: the same buyer in a second tab counts twice. ${windowNote}`
            }
          />
          <Stage
            label="Buyers asked for a price"
            value={demand.measurable ? String(demand.attempts) : 'Unknown'}
            muted={demand.attempts === 0}
            note={
              demand.measurable
                ? `One ask is one network address, one brief, one day — so a retry after a timeout is the same ask. ${windowNote}`
                : 'Pokter could not read its record of price requests. This is not a count of zero.'
            }
          />
          <Stage
            label="Got a signed price"
            value={demand.measurable ? `${demand.quoted} of ${demand.attempts}` : 'Unknown'}
            muted={demand.quoted === 0}
            note={`Out of the asks above. A price signed by this agent's registered wallet. ${windowNote}`}
          />
          <Stage
            label="Prices carried to funding"
            value={String(funding.signedPrices)}
            muted={funding.signedPrices === 0}
            note={`One per negotiation hash, so a buyer who edits the brief and asks again records another. ${windowNote}`}
          />
          <Stage
            label="Jobs an outside buyer funded"
            value={String(funding.fundedInWindow)}
            muted={funding.fundedInWindow === 0}
            note={`Escrow jobs whose funder is neither a declared Pokter wallet nor this agent's own. ${windowNote}`}
          />
          <Stage
            label="Delivered and settled"
            value={`${delivery.delivered} of ${delivery.terminal}`}
            muted={delivery.delivered === 0}
            note="Out of outside-funded jobs that reached an end state, over this agent's whole history rather than the window — jobs are few and permanent."
          />
        </div>
      </section>

      <section aria-labelledby="diag-stopped-title" className="flex flex-col gap-3">
        <h3 id="diag-stopped-title" className="t-h3">
          Where buyers stopped
        </h3>
        {!demand.measurable ? (
          <Notice tone="watch" title="Not measured">
            Pokter could not read its record of buyer price requests, so this list is unknown rather than empty.
          </Notice>
        ) : demand.noBuyerYet ? (
          <EmptyState title="No buyer has asked this agent for a price yet">
            <p>
              That is a real answer, not a failure. Pokter has recorded no price request through the hire flow in the
              last {d.window.days} days — and it does not count its own scheduled checks, or free trials, as demand.
            </p>
            <p className="mt-2">
              If Pokter&rsquo;s own check below is passing, the hire path works and what is missing is buyers reaching
              it. If it is failing, fix that first: the hire page calls the same endpoint.
            </p>
          </EmptyState>
        ) : demand.stoppedByCode.length === 0 ? (
          <Notice tone="ok" title={`All ${demand.attempts} ask${demand.attempts === 1 ? '' : 's'} ended in a signed price`}>
            Nothing in the quote path turned a buyer away in this window.
          </Notice>
        ) : (
          <ul className="flex flex-col gap-3">
            {demand.stoppedByCode.map((group) => (
              <Stopped key={group.code} group={group} />
            ))}
          </ul>
        )}
      </section>

      {funding.pricedNotFunded > 0 && (
        <section aria-labelledby="diag-funding-title" className="flex flex-col gap-3">
          <h3 id="diag-funding-title" className="t-h3">
            Priced and not funded
          </h3>
          <Notice tone="watch" title={`${funding.pricedNotFunded} signed price${funding.pricedNotFunded === 1 ? '' : 's'} did not become a funded job`} action={<Fix remediation={funding.remediation} />}>
            <p>{funding.remediation?.reason}</p>
            <p className="mt-2 text-[12.5px]">
              An upper bound, counted as prices carried to funding minus outside-funded jobs over the same{' '}
              {d.window.days} days. A buyer who edits the brief and asks again records a second price, so some of this
              gap is one buyer deciding rather than several leaving. Pokter cannot see inside a buyer&rsquo;s wallet, so
              it cannot tell a change of mind from a balance that was short.
            </p>
          </Notice>
        </section>
      )}

      <section aria-labelledby="diag-delivery-title" className="flex flex-col gap-3">
        <h3 id="diag-delivery-title" className="t-h3">
          Deliveries that failed
        </h3>
        {delivery.failures.length === 0 ? (
          <Notice tone={delivery.terminal > 0 ? 'ok' : 'neutral'} title={delivery.terminal > 0 ? 'No funded job has failed' : 'No funded job has reached an end state yet'}>
            {delivery.terminal > 0
              ? `All ${delivery.terminal} outside-funded job${delivery.terminal === 1 ? '' : 's'} that reached an end state were delivered and settled.`
              : 'Nothing to report: this agent has no settled, refused, disputed or lapsed job on record. Jobs Pokter delivered on its behalf are excluded and are listed below.'}
          </Notice>
        ) : (
          <ul className="flex flex-col gap-3">
            {delivery.failures.map((failure) => (
              <li key={`${failure.escrowChainId}:${failure.jobId}`} className="flex flex-col gap-2 rounded-[12px] border border-rule bg-raised p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-[13px] font-medium">{DELIVERY_LABEL[failure.kind]}</span>
                  <span className="text-[12.5px] text-ink-3">
                    <Link href={jobHref({ jobId: failure.jobId, chainId: failure.escrowChainId })} className="link">
                      Job {failure.jobId}
                    </Link>{' '}
                    · {DAY(failure.at)}
                  </span>
                </div>
                <p className="text-[13.5px] leading-relaxed text-ink-2">{failure.remediation.reason}</p>
                {failure.sellerReason && (
                  <p className="text-[12.5px] leading-relaxed text-ink-3">
                    {failure.sellerReason === WITHHELD_REASON_TEXT
                      ? 'Your agent gave a reason Pokter would not repeat: it could not be bounded safely, so it is withheld rather than shown in part.'
                      : `Your agent said: “${failure.sellerReason}”`}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Fix remediation={failure.remediation} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="diag-check-title" className="flex flex-col gap-3">
        <div>
          <h3 id="diag-check-title" className="t-h3">
            Pokter&rsquo;s own price check
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
            Pokter asks every listed agent for a price on a schedule. This is that request, and it is Pokter&rsquo;s
            traffic — never a buyer&rsquo;s. It matters here because the hire page calls the same endpoint the same way:
            if this fails, no buyer can get a price either.
          </p>
        </div>
        {/* Four states, not two. A failure; a failure a buyer's own signed
            price has already disproved; a request that succeeded; and no
            request at all — which used to render as the third, reporting a
            measurement Pokter had never made. */}
        {d.pokterCheck ? (
          <Notice
            tone={d.pokterCheck.outranked || d.pokterCheck.remediation?.transient ? 'watch' : 'bad'}
            title={
              d.pokterCheck.outranked
                ? `Pokter's scheduled request failed (${d.pokterCheck.code}), but buyers can still be quoted`
                : `Pokter's latest price request failed: ${d.pokterCheck.code}`
            }
            action={d.pokterCheck.outranked ? undefined : <Fix remediation={d.pokterCheck.remediation} />}
          >
            {d.pokterCheck.outranked ? (
              <p>
                Your agent has since signed a payable price for a buyer&rsquo;s own brief, so this failure is true of
                Pokter&rsquo;s generic scheduled ask and is not stopping hires. It is worth fixing anyway: no price
                shows on your public card until a generic request is answered.
              </p>
            ) : (
              <p>{d.pokterCheck.remediation?.reason ?? 'Pokter has no specific fix recorded for this code.'}</p>
            )}
            <p className="mt-2 text-[12.5px]">
              Observed {DAY(d.pokterCheck.observedAt)}.
              {!d.pokterCheck.outranked && d.pokterCheck.remediation?.transient
                ? ' This may be a passing condition rather than something to change.'
                : ''}
            </p>
          </Notice>
        ) : d.pokterCheckedAt ? (
          <Notice tone="ok" title="Pokter's latest price request succeeded">
            The last scheduled request, on {DAY(d.pokterCheckedAt)}, got a usable signed price from this agent, so the
            quote path works. That is not a statement about demand.
          </Notice>
        ) : (
          <Notice tone="neutral" title="Pokter has not checked this agent yet">
            No scheduled price request is on record for this agent, so there is nothing here to pass or fail. This is
            not a reading that the quote path works: until a sweep reaches it, Pokter has made no measurement of
            whether this agent can be priced.
          </Notice>
        )}
      </section>

      <section aria-labelledby="diag-excluded-title" className="flex flex-col gap-3">
        <div>
          <h3 id="diag-excluded-title" className="t-h3">
            Not counted as demand
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
            Removed from every figure above, and shown here so you can see the size of what you are not being shown.{' '}
            <Link href="/proof" className="link">
              Every wallet Pokter declares as its own
            </Link>{' '}
            is published, so these exclusions can be checked against the chain rather than taken on trust.
          </p>
        </div>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {d.excluded.map((item) => (
            <div key={item.id} className="flex flex-col gap-1">
              {/* A null count prints "Not totalled", never 0: a zero here
                  would claim there were none of these, and for Pokter's own
                  scheduled requests that is the opposite of true. */}
              <Readout
                label={item.label}
                value={item.count === null ? 'Not totalled' : String(item.count)}
                muted={!item.count}
              />
              <dd className="text-[12px] leading-relaxed text-ink-3">{item.why}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="diag-definitions-title" className="flex flex-col gap-3">
        <h3 id="diag-definitions-title" className="t-h3">
          What each figure means
        </h3>
        <Details summary="Every metric, with its window and its denominator">
          <dl className="ruled text-sm">
            {d.definitions.map((metric) => (
              <div key={metric.id} className="flex flex-col gap-1 py-3">
                <dt className="text-[13px] font-medium">{metric.label}</dt>
                <dd className="flex flex-col gap-1 text-[12.5px] leading-relaxed text-ink-2">
                  <span>{metric.counts}</span>
                  <span className="text-ink-3">Window: {metric.window}</span>
                  <span className="text-ink-3">
                    Denominator: {metric.denominator ?? 'none — this is a count, and must not be read as a rate.'}
                  </span>
                  <span className="text-ink-3">Read from: {metric.source}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Details>
        <Details summary="What Pokter does not measure, and so does not show">
          <ul className="flex flex-col gap-2 text-[12.5px] leading-relaxed text-ink-2">
            {d.unmeasured.map((line) => (
              <li key={line} className="flex gap-2">
                <Icon.Dash size={14} className="mt-0.5 shrink-0 text-ink-3" />
                {line}
              </li>
            ))}
          </ul>
        </Details>
      </section>
    </div>
  );
}
