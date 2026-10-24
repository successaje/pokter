'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { Button, LinkButton } from '@/ui/Button';
import { Checkbox, Field, Input, Textarea } from '@/ui/Field';
import { EmptyState, LoadingRegion, Notice, Skeleton } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { cn } from '@/lib/ui/cn';

import {
  FIXTURE_SCENARIOS,
  KIND_COPY,
  LIVE_SCENARIO,
  REPLAY_SCENARIO,
  type ScenarioMeta,
} from './catalogue';
import { ProofRunResults } from './ResultsView';
import type { ProofRunView } from './run';

/**
 * "Test this agent": pick a scenario, run it, read what it found.
 *
 * The three groups are kept visually and verbally apart because conflating
 * them is the defect that matters here. A synthetic fixture is a position
 * Pokter wrote down; a replay reads BNB Chain at a past block; a live test
 * is a funded job. Drawn as one list of "tests", a synthetic pass reads as
 * evidence about the agent on chain, which it is not.
 *
 * ## State, and what survives an error
 *
 * Every field the reader typed lives in this component and is never cleared
 * by a failure — not the account, not the block, not the pasted report, not
 * the authorisation. A recoverable error that empties the form makes the
 * reader pay for Pokter's outage, and the longer the input the more likely
 * they give up rather than retype it.
 *
 * A timeout, an aborted request and an offline browser all land in
 * `failed`. None of them can reach `done`: a run that did not finish is not
 * a run that passed, and this component has no path that lets an absent
 * answer render as one.
 */

const REPORT_PLACEHOLDER = `{
  "account": "0x…",
  "chain_id": 56,
  "pool": "core",
  "as_of": { "block_number": "44100000" },
  "health_factor": 1.64,
  "liquidatable": false,
  "debt_usd": 24500.12,
  "collateral_usd": 58240.77
}`;

type Phase =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; view: ProofRunView }
  | { kind: 'failed'; message: string; field: string | null; offline: boolean };

export interface TestAgentAgent {
  chainId: number;
  tokenId: string;
  name: string;
}

export function TestAgentPanel({
  agent,
  initialScenarioId,
  heading = 'Test this agent',
}: {
  /** Null on the standalone page, where no agent is in context. */
  agent?: TestAgentAgent | null;
  initialScenarioId?: string;
  heading?: string;
}) {
  const [scenarioId, setScenarioId] = useState<string>(
    initialScenarioId && [...FIXTURE_SCENARIOS, REPLAY_SCENARIO].some((s) => s.id === initialScenarioId)
      ? initialScenarioId
      : FIXTURE_SCENARIOS[0].id,
  );
  const [account, setAccount] = useState('');
  const [report, setReport] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [online, setOnline] = useState(true);
  /* Unique per mount, so two panels on one page do not share one radio
     group — which would make selecting a scenario in one clear the other. */
  const groupName = useId();
  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /*
   * Which run's answer is still wanted.
   *
   * Starting a run aborts the one before it, and that abort rejects the
   * old fetch on a later microtask — after this run has already set
   * `running`. Without a sequence number the superseded run's `catch`
   * then overwrites it with "the run did not finish", so pressing the
   * button twice shows a failure for a run that is still in flight. Only
   * the newest id may write to `phase`.
   */
  const runIdRef = useRef(0);
  const aliveRef = useRef(true);
  /*
   * What the last run was of.
   *
   * "Run again" means re-run *this* scenario, so it forces a recompute.
   * Choosing a different scenario and pressing the same button does not:
   * that is a first run of something else, and if this server already
   * holds a result for it, the honest thing is to serve it and say it was
   * reused. Forcing freshness on every press made the reused label
   * unreachable through the interface — a state the code could produce
   * and no reader could ever see.
   */
  const lastRunRef = useRef<string | null>(null);

  /*
   * The browser's own connection state, watched rather than guessed from a
   * failed request. `navigator.onLine` is only read after mount: reading it
   * during render would differ between the server and the client and
   * hydrate into the wrong notice.
   */
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(
    () => () => {
      aliveRef.current = false;
      abortRef.current?.abort();
    },
    [],
  );

  const replaying = scenarioId === REPLAY_SCENARIO.id;
  /*
   * A refusal about one field belongs beside that field and nowhere else.
   * Printing it in the banner as well said the same sentence twice, under
   * a heading ("the run did not finish") that was wrong about it anyway —
   * a rejected address means the run never started, which is the reader's
   * to fix rather than Pokter's to apologise for.
   */
  const fieldLevel =
    phase.kind === 'failed' && (phase.field === 'account' || phase.field === 'report');

  /*
   * A refusal about a field stops describing that field the moment it is
   * edited.
   *
   * Leaving it up was a small lie with a loud voice: the box stayed
   * outlined and the line underneath still read "give the account as a
   * 42-character address" while a perfectly good address sat in it. The
   * reader is told the run has not happened yet, which is true, rather
   * than told their corrected input is still wrong, which is not.
   */
  function clearFieldError(field: 'account' | 'report') {
    setPhase((current) =>
      current.kind === 'failed' && current.field === field ? { kind: 'idle' } : current,
    );
  }

  /** What identifies a run, for deciding whether a press is a re-run. */
  function inputKey(): string {
    return replaying ? `${scenarioId}|${account.trim().toLowerCase()}|${report.trim()}` : scenarioId;
  }

  async function run(options: { fresh?: boolean } = {}) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++runIdRef.current;
    const current = () => aliveRef.current && runIdRef.current === id;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    setPhase({ kind: 'running' });

    try {
      const response = await fetch('/api/proofrun/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          scenarioId,
          ...(replaying ? { account, report } : {}),
          /* Set only when this press re-runs the same scenario with the
             same inputs. Then "Run again" recomputes rather than
             re-serving what this process held, which is what the button
             offers. A press after switching scenario is a first run of
             something else, and may legitimately be served from memory
             and labelled as reused. */
          ...(options.fresh ? { fresh: true } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { view?: ProofRunView; error?: string; field?: string | null }
        | null;

      if (!current()) return;
      if (!response.ok || !payload?.view) {
        setPhase({
          kind: 'failed',
          message:
            payload?.error ??
            (response.status === 429
              ? 'Too many runs from here in the last minute. Wait a moment and try again.'
              : `Pokter answered ${response.status} and no result came back.`),
          field: payload?.field ?? null,
          offline: false,
        });
        return;
      }
      lastRunRef.current = inputKey();
      setPhase({ kind: 'done', view: payload.view });
    } catch (error) {
      if (!current()) return;
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      setPhase({
        kind: 'failed',
        /*
         * Named as a failure to finish, never as a result. "Timed out" must
         * not share wording with any outcome: an unfinished run that reads
         * as a verdict is the silent-success case this whole feature
         * exists to refuse.
         */
        message: aborted
          ? 'The run did not finish within 30 seconds, so nothing was checked. Your inputs are still here — try again.'
          : navigator.onLine
            ? 'Pokter could not be reached. Nothing was checked, and your inputs are still here.'
            : 'This browser is offline, so nothing was checked. Your inputs are still here.',
        field: null,
        offline: !navigator.onLine,
      });
    } finally {
      window.clearTimeout(timeout);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  /* Scrolling to a fresh result is the only motion here, and it explains
     the state change rather than standing in for it. The browser honours
     `prefers-reduced-motion` on `scroll-behavior` from globals.css. */
  useEffect(() => {
    if (phase.kind === 'done') resultRef.current?.scrollIntoView({ block: 'nearest' });
  }, [phase]);

  return (
    <section aria-label={heading} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="t-label flex items-center gap-2">
          <span className="tile" aria-hidden /> ProofRun
        </span>
        <h3 className="t-h3">{heading}</h3>
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Don’t just ask what an agent can do. See where it fails. Pick a position with a known shape, and read what
          each named check found — including the ones that could not be settled.
        </p>
      </div>

      {!online && (
        <Notice tone="watch" title="This browser is offline.">
          Nothing can be run until the connection is back. Whatever you have typed stays where it is.
        </Notice>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="sr-only">Choose a scenario to run</legend>

        <ScenarioGroup
          kind="fixture"
          name={groupName}
          scenarios={FIXTURE_SCENARIOS}
          selected={scenarioId}
          onSelect={setScenarioId}
          disabled={phase.kind === 'running'}
        />

        <ScenarioGroup
          kind="replay"
          name={groupName}
          scenarios={[REPLAY_SCENARIO]}
          selected={scenarioId}
          onSelect={setScenarioId}
          disabled={phase.kind === 'running'}
        />
      </fieldset>

      {replaying && (
        <div className="flex flex-col gap-4 rounded-[12px] border border-rule bg-sunken/40 p-4">
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            A replay reads Venus’s own figures for a real account, at whatever block the report names — never at the
            head. Free endpoints keep only recent blocks, so an older one usually cannot be read at all, and where it
            cannot, every check is reported as not verified rather than re-read somewhere else.
          </p>
          {/*
            The account is an input and the block is not.
            The subject has to come from outside the report: one that chose
            its own subject could answer correctly about any wallet and
            collect a pass for a position nobody asked about, which is why
            `venusSubjectFromBrief` reads it from the brief. The block is
            the opposite — the chain is read at the block the report itself
            names and at no other, so a field for it could only disagree
            with the comparison that actually ran.
          */}
          <Field
            label="Account"
            hint="The borrower the report should be about, as a 42-character address. Taken from here rather than from the report, so a report cannot choose its own subject."
            error={phase.kind === 'failed' && phase.field === 'account' ? phase.message : undefined}
          >
            {(props) => (
              <Input
                {...props}
                value={account}
                onChange={(event) => {
                  setAccount(event.target.value);
                  clearFieldError('account');
                }}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                className="t-readout text-[13px]"
                disabled={phase.kind === 'running'}
              />
            )}
          </Field>
          <Field
            label="The report to check"
            hint="The agent’s own answer, as JSON. It must name the block it read — that is the block the chain is read at, and without one there is nothing to bind the figures to."
            error={phase.kind === 'failed' && phase.field === 'report' ? phase.message : undefined}
          >
            {(props) => (
              <Textarea
                {...props}
                value={report}
                onChange={(event) => {
                  setReport(event.target.value);
                  clearFieldError('report');
                }}
                placeholder={REPORT_PLACEHOLDER}
                spellCheck={false}
                className="t-readout min-h-40 text-[12.5px]"
                disabled={phase.kind === 'running'}
              />
            )}
          </Field>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          intent="primary"
          onClick={() => void run({ fresh: phase.kind === 'done' && lastRunRef.current === inputKey() })}
          busy={phase.kind === 'running'}
          /*
            Not disabled when the browser reports itself offline. The notice
            above says so, and `navigator.onLine` reports false negatives on
            some setups — disabling on it would leave a reader with a
            working connection no way to try at all. An attempt that cannot
            reach Pokter fails with that said plainly, which is recoverable;
            a dead button is not.
          */
          icon={phase.kind === 'running' ? undefined : <Icon.Play size={14} />}
        >
          {phase.kind === 'running' ? 'Running' : phase.kind === 'done' ? 'Run again' : 'Run this check'}
        </Button>
        <span className="text-[12px] text-ink-3">
          Read-only, free, and it moves no money.{' '}
          {replaying ? 'One archive read of BNB Chain.' : 'Nothing is read from the chain, and no agent is contacted.'}
        </span>
      </div>

      {phase.kind === 'failed' && !fieldLevel && (
        <Notice
          tone={phase.offline ? 'watch' : 'bad'}
          title={
            phase.offline
              ? 'Nothing was checked: the browser is offline.'
              : phase.field
                ? 'That could not be run.'
                : 'The run did not finish.'
          }
          action={
            <Button
              intent="secondary"
              size="s"
              onClick={() => void run()}
              icon={<Icon.Refresh size={13} />}
            >
              Try again
            </Button>
          }
        >
          {phase.message}
          {!phase.offline && (
            <p className="mt-1.5 text-[12.5px] text-ink-3">
              This is a failure to run, not a result. It says nothing about the agent or the report.
            </p>
          )}
        </Notice>
      )}

      <div ref={resultRef} className="scroll-mt-28">
        {phase.kind === 'running' && (
          <LoadingRegion label="Running the check">
            <div className="flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-6 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-28" />
              </div>
              <Skeleton className="h-px w-full" />
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-14" />
                </div>
              ))}
            </div>
          </LoadingRegion>
        )}

        {phase.kind === 'idle' && (
          <EmptyState title="Nothing has been run yet.">
            Each scenario is a position with one known awkward shape. Running one compares a report against the
            criteria above and lists every outcome, including the checks that could not be settled — which is the half
            most surfaces leave out.
          </EmptyState>
        )}

        {phase.kind === 'done' && <ProofRunResults view={phase.view} />}
      </div>

      <LiveTest agent={agent ?? null} />
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * The picker
 * ------------------------------------------------------------------ */

function ScenarioGroup({
  kind,
  name,
  scenarios,
  selected,
  onSelect,
  disabled,
}: {
  kind: 'fixture' | 'replay';
  /** Shared across both groups so arrow keys move through every scenario. */
  name: string;
  scenarios: readonly ScenarioMeta[];
  selected: string;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const copy = KIND_COPY[kind];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <span className="t-label flex items-center gap-1.5">
          {kind === 'fixture' ? <Icon.Flask size={12} /> : <Icon.Clock size={12} />}
          {copy.name}
          {scenarios.length > 1 && <span className="font-normal normal-case tracking-normal">· {scenarios.length}</span>}
        </span>
        <p className="max-w-prose text-[12px] leading-relaxed text-ink-3">{copy.blurb}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {scenarios.map((scenario) => (
          <label
            key={scenario.id}
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-[11px] border bg-raised p-3 transition-colors duration-150',
              /* Selection is drawn from React state, which is also what the
                 radio reads, so the card and the control cannot disagree.
                 Keyboard focus is the input's own `:focus-visible` outline
                 from globals.css — the input stays visible for that reason. */
              selected === scenario.id ? 'border-ink bg-sunken/60' : 'border-rule hover:border-rule-strong',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name={name}
              value={scenario.id}
              checked={selected === scenario.id}
              onChange={() => onSelect(scenario.id)}
              disabled={disabled}
              className="mt-0.5 size-[16px] shrink-0 cursor-pointer accent-[var(--ink)]"
            />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[13.5px] font-medium leading-snug text-ink">{scenario.label}</span>
              <span className="text-[12px] leading-relaxed text-ink-2">{scenario.purpose}</span>
              <span className="text-[11.5px] leading-relaxed text-ink-3">{scenario.exposes}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The live test
 * ------------------------------------------------------------------ */

/**
 * The optional paid test, and the three things that make it safe to offer.
 *
 * **Optional.** It is collapsed, nothing above it depends on it, and the
 * free scenarios answer the same question about the report's shape.
 *
 * **Priced before it is authorised.** Pokter does not print a figure it has
 * not been given: the price is the agent's own signed quote, and the only
 * honest thing to say before a quote exists is who sets it, what Pokter
 * adds (nothing) and when the number appears. A made-up "from $x" would be
 * worse than no figure.
 *
 * **Authorised explicitly, and not here.** The checkbox gates the step, and
 * the step is a link to the hire review where the buyer sees the signed
 * price and funds it in their own wallet. Nothing on this panel can move
 * money, and no run on this page starts a job.
 */
function LiveTest({ agent }: { agent: TestAgentAgent | null }) {
  const [authorised, setAuthorised] = useState(false);
  const [account, setAccount] = useState('');

  return (
    <details className="group rounded-[12px] border border-rule bg-sunken/40 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <Icon.ChevronRight size={14} className="shrink-0 transition-transform duration-150 group-open:rotate-90" />
        <span className="flex flex-wrap items-center gap-2">
          {LIVE_SCENARIO.label}
          <span className="rounded-full bg-signal-wash px-1.5 py-px text-[11px] font-normal text-ink">Optional · paid</span>
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-4 border-t border-rule pt-3">
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          The scenarios above test what a report does with a known shape. This one tests what the agent does for a
          paying customer, on a position at the current head — which is the only test it has an incentive to pass.
        </p>

        <dl className="ruled text-[12.5px]">
          <div className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3">
            <dt className="text-ink-3">What it costs</dt>
            <dd className="text-ink-2">
              The agent’s own price, signed by its registered wallet, plus the gas to fund the escrow.{' '}
              <span className="font-medium text-ink">Pokter adds nothing and takes nothing.</span>
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3">
            <dt className="text-ink-3">When you see the figure</dt>
            <dd className="text-ink-2">
              Before anything is funded. Pokter does not quote a price here because it does not have one until the
              agent signs it for your exact task.
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3">
            <dt className="text-ink-3">Who pays, and how</dt>
            <dd className="text-ink-2">
              You do, in your own wallet, into ERC-8183 escrow. Nothing on this page can move funds, and nothing is
              charged by opening the review.
            </dd>
          </div>
        </dl>

        <Field label="The account to report on" optional hint="Carried into the brief. You can change it on the review step.">
          {(props) => (
            <Input
              {...props}
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              className="t-readout text-[13px]"
            />
          )}
        </Field>

        <Checkbox
          checked={authorised}
          onChange={(event) => setAuthorised(event.target.checked)}
          label="I want to open a paid hire for this test."
          description="This opens the review step. You will see the agent’s signed price there and fund it yourself; ticking this authorises nothing on its own and spends nothing."
        />

        {agent ? (
          <div className="flex flex-wrap items-center gap-3">
            {authorised ? (
              <LinkButton
                intent="secondary"
                size="s"
                href={`/hire/${agent.chainId}/${agent.tokenId}${account.trim() ? `?account=${encodeURIComponent(account.trim())}` : ''}`}
                trailing={<Icon.ArrowUpRight size={13} />}
              >
                Review a paid test of {agent.name}
              </LinkButton>
            ) : (
              <Button intent="secondary" size="s" disabled>
                Review a paid test of {agent.name}
              </Button>
            )}
            {!authorised && <span className="text-[12px] text-ink-3">Tick the box above to continue.</span>}
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-3">
            Open an agent’s page to run a paid test against it.{' '}
            <Link href="/agents" className="link text-ink">
              Browse agents
            </Link>
            .
          </p>
        )}
      </div>
    </details>
  );
}
