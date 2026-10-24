import type { CheckResult, VerificationState } from '@/lib/shared/contracts';
import { CopyButton, Details } from '@/ui/Data';
import { Icon } from '@/ui/icons';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';

import { KIND_COPY, PROOFRUN_DOES_NOT_MEAN } from './catalogue';
import { OutcomeChip, OutcomeTally } from './Outcome';
import type { Freshness, ProofRunView } from './run';

/**
 * One ProofRun, as a buyer reads it.
 *
 * Three rules this view is built around, each of them a thing a results
 * page is normally tempted to do:
 *
 *  1. **No composite.** No score, no percentage, no badge. The counts of
 *     passed, failed and not-verified are shown side by side and never
 *     combined, because any single figure over them has to decide what a
 *     not-verified is worth, and the honest answer is "nothing either way".
 *  2. **No unknown drawn as success.** `not-verified` gets its own mark,
 *     its own word and its own reason. A check that did not run is never
 *     counted, coloured or ordered as though it had.
 *  3. **The summary is derived.** `state` and `headline` come from
 *     `lib/proofrun/checks`, over the same rows rendered beneath them, so
 *     the banner cannot come to say "verified" above a failing row.
 *
 * The same `checks` array feeds the table and the phone cards, so no row
 * and no figure exists in one layout and not the other.
 */

const STATE: Record<VerificationState, { title: string; tone: 'ok' | 'bad' | 'watch' | 'none'; detail: string }> = {
  verified: {
    title: 'Every check ran and matched',
    tone: 'ok',
    detail: 'Every criterion was compared and agreed within its stated tolerance. Only the criteria below were checked.',
  },
  mismatch: {
    title: 'A check contradicted the report',
    tone: 'bad',
    detail: 'At least one figure the report gave disagrees with Venus’s own accounting at the block the report names.',
  },
  unverifiable: {
    title: 'Not every check could be run',
    tone: 'watch',
    detail:
      'Some criteria were not settled, so this is not a pass on them. A check that did not run says nothing in either direction — it is not a finding against the agent and not a clearance for it.',
  },
  pending: {
    title: 'The run has not finished',
    tone: 'none',
    detail: 'Nothing below is a result yet.',
  },
  error: {
    title: 'The run failed',
    tone: 'watch',
    detail: 'Pokter could not complete the check. This is Pokter’s failure, and it says nothing about the report.',
  },
  contradicted: {
    title: 'Two runs disagree, and this is unresolved',
    tone: 'watch',
    detail:
      'A re-run produced a different answer from the one on record. Pokter does not decide which is right, and a disagreement is never resolved into a pass.',
  },
};

const STATE_SKIN = {
  ok: 'border-[color-mix(in_oklab,var(--ok)_30%,transparent)] bg-ok-wash',
  bad: 'border-[color-mix(in_oklab,var(--bad)_32%,transparent)] bg-bad-wash',
  watch: 'border-[color-mix(in_oklab,var(--watch)_32%,transparent)] bg-watch-wash',
  none: 'border-rule bg-sunken',
} as const;

const STATE_ICON = { ok: 'text-ok', bad: 'text-bad', watch: 'text-watch', none: 'text-ink-3' } as const;

export function ProofRunResults({ view }: { view: ProofRunView }) {
  const { result, scenario, spec } = view;
  const state = STATE[result.state];
  const kind = KIND_COPY[scenario.kind];
  const synthetic = scenario.kind === 'fixture';

  return (
    <section aria-label="ProofRun result" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-label">{scenario.label}</span>
          <ProvenanceChip kind={scenario.kind} />
        </div>
        <h3 className="t-h3">{result.headline}</h3>
        <p className="text-[13px] leading-relaxed text-ink-3">{view.setup}</p>
      </div>

      {/*
        The provenance is stated above the rows, not in a footnote. A
        synthetic run and a reading of the chain look identical once they
        are a table of figures, and the difference is the whole meaning of
        the table.
      */}
      <p
        className={cn(
          'rounded-[10px] border px-4 py-2.5 text-[12.5px] leading-relaxed',
          synthetic
            ? 'border-[color-mix(in_oklab,var(--info)_28%,transparent)] bg-info-wash text-ink-2'
            : 'border-rule bg-sunken text-ink-2',
        )}
      >
        <span className="font-medium text-ink">{kind.name}.</span> {kind.blurb}
      </p>

      <div className={cn('flex flex-col gap-2 rounded-[12px] border px-4 py-3.5', STATE_SKIN[state.tone])}>
        <p className="flex items-start gap-2.5 text-[14px] font-medium leading-snug text-ink">
          <span className={cn('mt-px shrink-0', STATE_ICON[state.tone])} aria-hidden>
            {state.tone === 'ok' ? <Icon.Check size={15} /> : state.tone === 'bad' ? <Icon.Cross size={15} /> : <Icon.Alert size={15} />}
          </span>
          <span>{state.title}</span>
        </p>
        <p className="pl-[26px] text-[13px] leading-relaxed text-ink-2">{state.detail}</p>
        {/*
          The verifier's own sentence, captioned.

          It is the one place a reader learns *what* happened — that the
          oracle returned no price, that the node no longer keeps the block
          — so it has to be shown. But it is written for a delivery checked
          against the chain, and under a fixture it says things like "Venus
          could not be read at block 900000004", which is a chain read that
          never happened at a block that does not exist. The caption carries
          that frame, rather than leaving the sentence to be read as a
          reading of BNB Chain.
        */}
        <div className="border-t border-[color-mix(in_oklab,var(--ink)_12%,transparent)] pl-[26px] pt-2.5">
          <span className="t-label block">
            {synthetic
              ? 'What the checker said — reading the fixture’s own figures'
              : 'What the checker said'}
          </span>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">{view.reason}</p>
          {synthetic && (
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
              It is phrased as though it had read Venus. In this run “Venus” is the fixture’s written-down figures and
              the block is a label on them, not a block on BNB Chain.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <OutcomeTally checks={result.checks} />
        <FreshnessLine
          freshness={view.freshness}
          criteria={spec.versions.criteria}
          verifier={spec.versions.verifier}
        />
      </div>

      <CheckTable checks={result.checks} />
      <CheckCards checks={result.checks} />
      {/*
        The reconciliation, said where the figures are.
        A row's stated tolerance is the band the criteria set; the checker
        applies the larger of that and a floor of its own, and writes the
        figure it actually allowed into the check's own note. Printing the
        stated band alone, beside a note quoting a wider one, reads as the
        page contradicting itself — so the relationship between the two is
        named rather than left for the reader to infer.
      */}
      <p className="text-[12px] leading-relaxed text-ink-3">
        <strong className="font-medium text-ink">Stated tolerance</strong> is the band the criteria set. The checker
        allows the larger of that and a floor of its own, and where the two differ the allowance it used is in the
        check’s own note. <strong className="font-medium text-ink">None</strong> means the criterion admits no
        tolerance: a field that must simply be stated, or a yes-or-no Venus settles exactly.
      </p>

      <Source view={view} />

      <div className="flex flex-col gap-3">
        <Details summary={`How this was checked${view.methodNote ? ' (no call was made in this run)' : ''}`}>
          <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-ink-2">
            {view.methodNote && <p className="font-medium text-ink">{view.methodNote}</p>}
            {view.method.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        </Details>

        <Details summary="Tolerances, numerically">
          <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-ink-2">
            {view.tolerances.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </Details>

        <Details summary={`Where every figure came from (${result.evidence.length})`}>
          {result.evidence.length > 0 ? (
            <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-ink-2">
              {result.evidence.map((line, index) => (
                <li key={index} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            /* An empty list under this heading would read as "no sources
               were needed". Nothing was read, which is a different fact. */
            <p className="text-[13px] leading-relaxed text-ink-2">
              Nothing was read. The run stopped before any figure was fetched, so there are no sources to list.
            </p>
          )}
        </Details>

        <Details summary={`What this run does not establish (${result.limitations.length})`} defaultOpen>
          <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-ink-2">
            {result.limitations.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </Details>
      </div>

      <div className="flex flex-col gap-2 rounded-[12px] border border-rule bg-sunken/50 px-4 py-3.5">
        <span className="t-label">And what it is not</span>
        <ul className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-ink-2">
          {PROOFRUN_DOES_NOT_MEAN.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Provenance and freshness
 * ------------------------------------------------------------------ */

function ProvenanceChip({ kind }: { kind: ProofRunView['scenario']['kind'] }) {
  const copy = KIND_COPY[kind];
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium',
        kind === 'fixture' ? 'bg-info-wash text-ink' : kind === 'replay' ? 'bg-sunken text-ink-2' : 'bg-signal-wash text-ink',
      )}
      title={copy.provenance}
    >
      {kind === 'fixture' ? <Icon.Flask size={12} /> : kind === 'replay' ? <Icon.Clock size={12} /> : <Icon.Pulse size={12} />}
      {copy.name}
    </span>
  );
}

/**
 * When this was computed, and by which versions.
 *
 * A reused result carries the time it was computed, never the time it was
 * served. Stamping a held result with the current clock is the freshness
 * defect itself, and it is invisible in testing because the number always
 * looks plausible.
 */
function FreshnessLine({
  freshness,
  criteria,
  verifier,
}: {
  freshness: Freshness;
  criteria: string;
  verifier: string;
}) {
  const reused = freshness.kind === 'reused';
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
      <span
        className={cn(
          'inline-flex h-5 items-center gap-1 rounded-full px-1.5 font-medium',
          reused ? 'bg-watch-wash text-ink' : 'bg-ok-wash text-ink',
        )}
      >
        {reused ? <Icon.Refresh size={11} /> : <Icon.Check size={11} />}
        {reused ? 'Reused' : 'Run just now'}
      </span>
      <span>
        {reused
          ? `Computed ${utc(freshness.at)}, ${ago(freshness.heldForSeconds)} ago, and held in this server’s memory since. Nothing was re-read.`
          : `Computed ${utc(freshness.at)}.`}
      </span>
      <span className="t-readout">
        {criteria} · {verifier}
      </span>
    </p>
  );
}

function utc(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? 'at an unknown time' : `${at.toISOString().slice(11, 19)} UTC on ${at.toISOString().slice(0, 10)}`;
}

/*
 * Whole units only, and never rounded up into the next one. A 59-second
 * gap shown as "1 minute" is the same class of defect as a 29.97-second
 * window shown as a full 30: it reports a boundary the measurement never
 * reached.
 */
function ago(seconds: number): string {
  if (seconds < 1) return 'less than a second';
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/* ------------------------------------------------------------------ *
 * The checks
 * ------------------------------------------------------------------ */

/**
 * The rows at reading width.
 *
 * Expected and observed are separate columns rather than one "result"
 * column, because the pair is the evidence: a reader who can see both can
 * tell a rounding difference from a wrong answer without trusting the
 * outcome word at all.
 */
function CheckTable({ checks }: { checks: readonly CheckResult[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-[14px] border border-rule md:block">
      <table className="w-full min-w-[720px] divide-y divide-rule text-left text-[13px]">
        <caption className="sr-only">
          Each criterion, its outcome, what the check required, what the report gave, and the tolerance the criteria
          state.
        </caption>
        <thead className="bg-sunken/70">
          <tr>
            <th scope="col" className="t-label px-3 py-2.5 align-bottom font-medium">
              Criterion
            </th>
            <th scope="col" className="t-label px-3 py-2.5 align-bottom font-medium">
              Outcome
            </th>
            {/*
              Qualified, because the pair is invertible and nothing else on
              the row says which is which. "Expected" holds Venus's figure
              on a compared row and the requirement itself on a structural
              one ("a block number in the report"), so the qualifier has to
              be true of both: what the check required, against what the
              report gave. A reader who mistakes the columns for each other
              reads every finding backwards.
            */}
            <th scope="col" className="px-3 py-2.5 align-bottom font-medium">
              <span className="t-label block">Expected</span>
              <span className="block text-[10.5px] font-normal leading-tight text-ink-3">what the check required</span>
            </th>
            <th scope="col" className="px-3 py-2.5 align-bottom font-medium">
              <span className="t-label block">Observed</span>
              <span className="block text-[10.5px] font-normal leading-tight text-ink-3">what the report gave</span>
            </th>
            <th scope="col" className="t-label px-3 py-2.5 align-bottom font-medium">
              Stated tolerance
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule bg-raised">
          {checks.map((check) => (
            <tr key={check.id} className="align-top">
              <th scope="row" className="max-w-[20rem] px-3 py-3 font-medium">
                <span className="block leading-snug">{check.label}</span>
                <span className="t-readout mt-0.5 block text-[11px] text-ink-3">{check.id}</span>
              </th>
              <td className="px-3 py-3">
                <OutcomeChip outcome={check.outcome} />
                {check.limitation && (
                  <p className="mt-1.5 max-w-[16rem] text-[11.5px] leading-snug text-ink-3">{check.limitation}</p>
                )}
              </td>
              <td className="t-readout px-3 py-3 text-[12.5px] text-ink-2">{check.expected}</td>
              <td className="t-readout px-3 py-3 text-[12.5px] text-ink">{check.observed}</td>
              <td className="t-readout px-3 py-3 text-[12.5px] text-ink-3">
                {check.tolerance ?? <span className="t-body text-[12px]">none</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The same rows at 375px.
 *
 * A five-column table on a phone scrolls sideways, and the figure the
 * reader scrolled to loses the criterion it belongs to — which here would
 * mean an observed value beside the wrong expectation. Same array, same
 * fields, different layout.
 */
function CheckCards({ checks }: { checks: readonly CheckResult[] }) {
  return (
    <ol className="flex flex-col gap-2.5 md:hidden">
      {checks.map((check) => (
        <li key={check.id} className="rounded-[12px] border border-rule bg-raised p-3.5">
          <div className="flex items-start justify-between gap-2.5">
            <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{check.label}</span>
            <OutcomeChip outcome={check.outcome} />
          </div>
          <span className="t-readout mt-1 block text-[11px] text-ink-3">{check.id}</span>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-rule pt-3">
            <div className="min-w-0">
              <dt className="t-label text-[10px]">Expected</dt>
              <dd className="t-readout mt-0.5 break-words text-[12.5px] text-ink-2">{check.expected}</dd>
              <dd className="mt-0.5 text-[10.5px] leading-tight text-ink-3">what the check required</dd>
            </div>
            <div className="min-w-0">
              <dt className="t-label text-[10px]">Observed</dt>
              <dd className="t-readout mt-0.5 break-words text-[12.5px] text-ink">{check.observed}</dd>
              <dd className="mt-0.5 text-[10.5px] leading-tight text-ink-3">what the report gave</dd>
            </div>
            <div className="col-span-2 min-w-0">
              {/* "Stated tolerance" in both layouts, because the note under
                  them explains that exact phrase. */}
              <dt className="t-label text-[10px]">Stated tolerance</dt>
              <dd className="t-readout mt-0.5 text-[12.5px] text-ink-3">{check.tolerance ?? 'none'}</dd>
            </div>
          </dl>
          {check.limitation && (
            <p className="mt-2.5 border-t border-rule pt-2.5 text-[12px] leading-relaxed text-ink-3">
              {check.limitation}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * Source
 * ------------------------------------------------------------------ */

/**
 * The state every row above was read at.
 *
 * The block hash is printed even when it is absent, and the absence is
 * named. A block number alone does not pin state — two chains, or one
 * chain either side of a reorg, both have a block of any given height — so
 * a reader who sees only a number cannot tell whether the reading is
 * pinned. Leaving the row out when there is no hash would hide exactly the
 * case in which it matters.
 */
function Source({ view }: { view: ProofRunView }) {
  const { subject, result, scenario } = view;
  const synthetic = scenario.kind === 'fixture';
  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-2">
      <SourceFact label="Account">
        <span className="t-readout" title={subject.account}>
          {shortAddress(subject.account)}
        </span>
        {synthetic && <span className="mt-0.5 block text-[11.5px] text-ink-3">A fixture label, not a wallet.</span>}
      </SourceFact>
      <SourceFact label={synthetic ? 'Labelled block' : 'Block'}>
        <span className="t-readout">{subject.blockNumber}</span>
        {synthetic && (
          <span className="mt-0.5 block text-[11.5px] text-ink-3">
            Beyond any height BNB Chain has reached. Not a block you can look up.
          </span>
        )}
      </SourceFact>
      <SourceFact label="Block hash">
        {subject.blockHash ? (
          <span className="inline-flex min-w-0 items-center gap-1">
            <span className="t-readout truncate" title={subject.blockHash}>
              {subject.blockHash.slice(0, 14)}…
            </span>
            <CopyButton value={subject.blockHash} label="Copy the block hash" />
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-3">
            None.{' '}
            {synthetic
              ? 'This state was not read from a chain, so there is no hash to give.'
              : 'The node gave no hash, so the reading is pinned by number alone.'}
          </span>
        )}
      </SourceFact>
      <SourceFact label="Checked against">
        <span className="t-readout" title={subject.deployment}>
          {shortAddress(subject.deployment)}
        </span>
        <span className="mt-0.5 block text-[11.5px] text-ink-3">
          Venus Core Pool Comptroller, chain {subject.chainId}
        </span>
      </SourceFact>
      <SourceFact label="Criteria hash">
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="t-readout truncate" title={result.specHash}>
            {(result.specHash ?? '—').slice(0, 14)}…
          </span>
          {result.specHash && <CopyButton value={result.specHash} label="Copy the criteria hash" />}
        </span>
      </SourceFact>
      <SourceFact label="Receipt hash">
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="t-readout truncate" title={view.artifactHash}>
            {view.artifactHash.slice(0, 14)}…
          </span>
          <CopyButton value={view.artifactHash} label="Copy the receipt hash" />
        </span>
        <span className="mt-0.5 block text-[11.5px] text-ink-3">
          Shows these bytes are unaltered. It says nothing about whether the figures are right.
        </span>
      </SourceFact>
    </dl>
  );
}

function SourceFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-raised px-4 py-3">
      <dt className="t-label text-[10px]">{label}</dt>
      <dd className="min-w-0 break-words text-[13px] text-ink">{children}</dd>
    </div>
  );
}
