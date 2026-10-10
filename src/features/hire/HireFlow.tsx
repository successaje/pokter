'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatEther, formatUnits } from 'viem';

import { BUDGET_MAX, BUDGET_MIN, useHire, type HireAgent, type ProviderChoice } from '@/lib/hire/useHire';
import { FAUCETS, IS_TESTNET, NATIVE_SYMBOL, NETWORK_LABEL, explorerTxUrl } from '@/lib/network/presentation';
import { useGasSponsorship } from '@/lib/wallet/sponsor-client';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { Mark } from '@/shell/Logo';
import { AgentAvatar } from '@/ui/Agent';
import { Button, LinkButton, Spinner } from '@/ui/Button';
import { Address, Details } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';
import { Checkbox, Textarea } from '@/ui/Field';
import { Icon } from '@/ui/icons';

type Step = 'describe' | 'review' | 'pay';
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'describe', label: 'Describe the job' },
  { id: 'review', label: 'Review terms' },
  { id: 'pay', label: 'Fund escrow' },
];

export interface HireFlowProps {
  agent: HireAgent & { imageUrl: string | null; key: string };
  providers: ProviderChoice[];
  signedQuoteU: number | null;
  suggestedU: number | null;
  warnings: string[];
  escrow: { commerce: string; paymentToken: string };
}

const EXTERNAL_STEPS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'connecting', label: 'Checking your wallet', hint: 'Making sure the right account and network are selected.' },
  { id: 'creating', label: 'Creating the job', hint: 'Approve in your wallet. This records the job and its terms.' },
  { id: 'registering', label: 'Registering the job', hint: 'Approve in your wallet.' },
  { id: 'budgeting', label: 'Setting the budget', hint: 'Approve in your wallet.' },
  { id: 'approving', label: 'Approving exactly the budget', hint: 'Lets the escrow take this amount and no more.' },
  { id: 'funding', label: 'Funding escrow', hint: 'The payment moves into escrow, not to the agent.' },
  { id: 'confirming', label: 'Waiting for confirmation', hint: 'Usually a few seconds on BNB Chain.' },
];

function Progress({ steps, current }: { steps: Array<{ id: string; label: string; hint?: string }>; current: string }) {
  const index = steps.findIndex((s) => s.id === current);
  return (
    <ol className="flex flex-col" aria-live="polite">
      {steps.map((s, i) => {
        const done = i < index;
        const now = i === index;
        return (
          <li key={s.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
            <span className="relative flex justify-center">
              <span className={cn('z-10 grid size-6 place-items-center rounded-full border text-[11px]', done ? 'border-ok bg-ok text-paper' : now ? 'border-ink bg-raised text-ink' : 'border-rule-strong bg-raised text-ink-3')}>
                {done ? <Icon.Check size={13} /> : now ? <Spinner size={12} /> : i + 1}
              </span>
              {i < steps.length - 1 && <span className={cn('absolute top-6 h-[calc(100%-8px)] w-px', done ? 'bg-ok' : 'bg-rule')} aria-hidden />}
            </span>
            <span className="flex flex-col pt-0.5">
              <span className={cn('text-sm', now ? 'font-semibold text-ink' : done ? 'text-ink-2' : 'text-ink-3')}>{s.label}</span>
              {now && s.hint && <span className="text-[12.5px] text-ink-3">{s.hint}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function explainFailure(message: string): { title: string; body: string } {
  if (/reject|denied|cancel|dismiss|NotAllowed/i.test(message)) return { title: 'You declined in the wallet', body: 'Nothing was sent and no funds moved. You can try again when ready.' };
  if (/insufficient|balance|needs at least|You need/i.test(message)) return { title: 'Not enough in the wallet', body: message };
  if (/signed a price|signed quote|quote/i.test(message)) return { title: 'The agent’s quote stopped this hire', body: message };
  if (/network|chain|switch/i.test(message)) return { title: 'Wrong network', body: message };
  return { title: 'The hire did not complete', body: message };
}

export function HireFlow(props: HireFlowProps) {
  const hire = useHire({ agent: props.agent, providers: props.providers, signedQuoteU: props.signedQuoteU, suggestedU: props.suggestedU, riskWarnings: props.warnings });
  const { openConnect } = useConnect();
  const sponsored = useGasSponsorship();
  const [step, setStepState] = useState<Step>('describe');
  const setStep = (next: Step) => {
    setStepState(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // A confirmation is for this amount and this task; changing either clears it.
  const terms = `${hire.budget}|${hire.task}|${hire.providerAddress}`;
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const confirmed = confirmedFor === terms;
  const setConfirmed = (on: boolean) => setConfirmedFor(on ? terms : null);

  // The agent's signed price only binds when the agent itself delivers.
  const priceFloor = hire.provider?.relationship === 'registry-agent' ? props.signedQuoteU : null;
  const minBudget = Math.max(BUDGET_MIN, priceFloor ?? 0);
  const budgetError =
    priceFloor !== null && priceFloor > BUDGET_MAX
      ? `This agent signed a price of ${priceFloor} $U, above Pokter's ${BUDGET_MAX} $U per-job limit, so it cannot be hired here yet.`
      : !hire.budgetValid
        ? `Between ${BUDGET_MIN} and ${BUDGET_MAX} $U.`
        : priceFloor !== null && hire.budget < priceFloor
          ? `The agent signed a price of ${priceFloor} $U. A lower budget will be refused.`
          : null;

  const busy = hire.state === 'hiring';
  const done = hire.state === 'hired' && hire.job;
  const failure = hire.state === 'error' && hire.error ? explainFailure(hire.error) : null;

  const passkeySteps = useMemo(
    () => [
      { id: 'quote', label: 'Getting the agent’s signed quote', hint: 'The price for this exact task, signed by its wallet.' },
      ...(hire.stage === 'sponsoring' ? [{ id: 'sponsoring', label: 'Covering the network fee', hint: 'Pokter is topping up gas for this transaction.' }] : []),
      ...(hire.stage === 'swapping' || hire.swapQuote ? [{ id: 'swapping', label: 'Swapping BNB for $U', hint: 'Confirm with your passkey. Swaps only the shortfall.' }] : []),
      { id: 'hiring', label: 'Creating and funding the job', hint: 'Confirm with your passkey. One transaction.' },
      { id: 'notify', label: 'Telling the agent', hint: '' },
    ],
    [hire.stage, hire.swapQuote],
  );

  const passkeyCurrent = hire.stage === 'sponsoring' ? 'sponsoring' : hire.stage === 'swapping' ? 'swapping' : hire.stage === 'hiring' ? 'hiring' : 'quote';

  // ── Done ──────────────────────────────────────────────
  if (done && hire.job) {
    const job = hire.job;
    return (
      <Shell agent={props.agent} step={null}>
        <div className="anim-rise flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-ok-wash text-ok">
              <Icon.Check size={22} />
            </span>
            <div>
              <h1 className="t-h2">Job #{job.jobId} is funded</h1>
              <p className="text-sm text-ink-2">
                {formatUnits(BigInt(job.budgetRaw), 18)} $U is in escrow. {props.agent.name} is paid only when it delivers.
              </p>
            </div>
          </div>
          <div className="rounded-[14px] border border-rule bg-raised p-5">
            <span className="t-label">Delivery request</span>
            <div className="mt-2 flex items-start gap-3 text-sm">
              {hire.notification === 'notifying' && <Spinner className="mt-0.5" />}
              <p className="text-ink-2">
                {hire.notification === 'notifying' && 'Telling the agent the job is funded…'}
                {hire.notification === 'accepted' && 'The agent verified the funded job and accepted the work.'}
                {hire.notification === 'rejected' && 'The agent saw the job but declined the delivery request. If nothing is delivered by the deadline, you reclaim the full amount.'}
                {hire.notification === 'failed' && `The agent could not be reached (${hire.notificationDetail ?? 'no detail'}). The job stays funded; if nothing arrives by the deadline, you reclaim it.`}
                {hire.notification === 'not-applicable' && hire.notificationDetail}
                {hire.notification === 'idle' && 'Waiting to notify the agent.'}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="t-label">Deadline</dt>
              <dd className="mt-1">{new Date(job.expiredAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="t-label">Provider</dt>
              <dd className="t-readout mt-1 text-[13px]">{shortAddress(job.provider)}</dd>
            </div>
            {job.hireTxHash && (
              <div>
                <dt className="t-label">Transaction</dt>
                <dd className="mt-1">
                  <a href={explorerTxUrl(job.hireTxHash)} target="_blank" rel="noreferrer noopener" className="t-readout link text-[13px]">
                    {job.hireTxHash.slice(0, 10)}…
                  </a>
                </dd>
              </div>
            )}
          </dl>
          {hire.active.mode === 'external' && !hire.revoked && (
            <Notice
              tone="neutral"
              title="Optional: clear the leftover approval"
              action={
                <Button size="s" intent="secondary" onClick={hire.revokeAllowance} busy={hire.revoking}>
                  Revoke approval
                </Button>
              }
            >
              The approval was for exactly the budget and has been used. Revoking sets it to zero, which costs a small network fee and is not required.
            </Notice>
          )}
          <div className="flex flex-wrap gap-3">
            <LinkButton href={`/workspace/jobs/${job.jobId}`} size="l" trailing={<Icon.Arrow size={16} />}>
              Follow this job
            </LinkButton>
            <LinkButton href="/discover" size="l" intent="secondary">
              Hire another agent
            </LinkButton>
          </div>
        </div>
      </Shell>
    );
  }

  // ── In progress ───────────────────────────────────────
  if (busy) {
    return (
      <Shell agent={props.agent} step="pay">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="t-h2">Funding the job</h1>
            <p className="mt-1 text-sm text-ink-2">Keep this page open. Each step below is reported by the wallet or the chain, not estimated.</p>
          </div>
          <div className="rounded-[14px] border border-rule bg-raised p-5">
            {hire.active.mode === 'external' ? (
              <Progress steps={[{ id: 'quote', label: 'Getting the agent’s signed quote', hint: 'The price for this exact task, signed by its wallet.' }, ...EXTERNAL_STEPS]} current={hire.externalStep ?? 'quote'} />
            ) : (
              <Progress steps={passkeySteps} current={passkeyCurrent} />
            )}
          </div>
          {hire.externalJobId !== null && <p className="text-[13px] text-ink-3">Job #{hire.externalJobId.toString()} created on chain.</p>}
        </div>
      </Shell>
    );
  }

  return (
    <Shell agent={props.agent} step={step}>
      {failure && (
        <Notice tone="bad" title={failure.title} className="mb-6" action={step !== 'pay' ? undefined : <span className="text-[12.5px] text-ink-2">Check the details below and confirm again to retry.</span>}>
          {failure.body}
          {hire.heldAfterFailure && ` The ${hire.heldAfterFailure} $U swapped in for this hire stays in your wallet.`}
        </Notice>
      )}

      {step === 'describe' && (
        <div className="anim-fade flex flex-col gap-6">
          <div>
            <h1 className="t-h2">What should {props.agent.name} do?</h1>
            <p className="mt-1 text-sm text-ink-2">Start from a template or write your own. The agent reads exactly this.</p>
          </div>
          <div role="radiogroup" aria-label="Task templates" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {hire.taskTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={hire.selectedTemplate === t.id}
                onClick={() => hire.chooseTemplate(t.id)}
                className={cn('flex flex-col gap-1 rounded-[12px] border p-3.5 text-left transition-colors', hire.selectedTemplate === t.id ? 'border-ink bg-raised' : 'border-rule bg-paper hover:border-rule-strong')}
              >
                <span className="text-sm font-semibold">{t.label}</span>
                <span className="text-[12.5px] leading-snug text-ink-3">{t.description}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="task" className="text-sm font-medium">
              Task
            </label>
            <Textarea id="task" value={hire.task} onChange={(e) => hire.setTask(e.target.value)} maxLength={2000} className="min-h-40" aria-describedby="task-hint" />
            <p id="task-hint" className="flex justify-between gap-3 text-[12.5px] text-ink-3">
              <span>Stored on chain with the job, so anyone can read it. Never include keys, seed phrases or passwords.</span>
              <span className="t-readout shrink-0">{hire.task.length}/2000</span>
            </p>
          </div>

          {props.providers.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Who delivers</legend>
              {props.providers.map((p) => (
                <label key={p.address} className={cn('flex cursor-pointer items-start gap-3 rounded-[12px] border p-3.5', hire.providerAddress === p.address ? 'border-ink bg-raised' : 'border-rule')}>
                  <input type="radio" name="provider" className="mt-1 accent-[var(--ink)]" checked={hire.providerAddress === p.address} onChange={() => hire.setProviderAddress(p.address)} disabled={!p.reachable} />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">
                      {p.label} {!p.reachable && <span className="font-normal text-ink-3">· not reachable</span>}
                    </span>
                    <span className="text-[12.5px] leading-snug text-ink-3">{p.note}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {hire.substituted && (
            <Notice tone="watch" title="Delivered through Pokter’s testnet courier">
              This agent is registered on another network, so Pokter&rsquo;s seller carries your task to it and delivers its answer unchanged. If the agent does not answer, nothing is delivered and you reclaim the escrow after the deadline.
            </Notice>
          )}
          <div className="flex justify-end">
            <Button size="l" onClick={() => setStep('review')} disabled={hire.task.trim().length < 10 || !hire.providerCanDeliver} trailing={<Icon.Arrow size={16} />}>
              Review terms
            </Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="anim-fade flex flex-col gap-6">
          <div>
            <h1 className="t-h2">Review the terms</h1>
            <p className="mt-1 text-sm text-ink-2">Nothing has been signed or sent. Check the budget and what you are agreeing to.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="budget" className="text-sm font-medium">
              Budget for this job
            </label>
            <div className="flex items-center gap-3">
              <div className="relative w-44">
                <input
                  id="budget"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={minBudget}
                  max={BUDGET_MAX}
                  value={Number.isFinite(hire.budget) ? hire.budget : ''}
                  onChange={(e) => hire.setBudget(Number(e.target.value))}
                  aria-invalid={budgetError ? true : undefined}
                  aria-describedby="budget-hint"
                  className="t-readout h-12 w-full rounded-[10px] border border-rule-strong bg-raised pl-3 pr-12 text-lg focus:border-ink focus:outline-none aria-[invalid=true]:border-bad"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">$U</span>
              </div>
              <span id="budget-hint" className={cn('text-[12.5px]', budgetError ? 'text-bad' : 'text-ink-3')}>
                {budgetError ?? (props.signedQuoteU !== null ? `Signed price ${props.signedQuoteU} $U` : props.suggestedU !== null ? `Suggested ${props.suggestedU} $U · no signed price` : 'No signed price; you set it')}
              </span>
            </div>
            <p className="text-[12.5px] text-ink-3">
              The agent is asked to sign a quote for this exact task before funding. If its price is above your budget, the hire stops before any payment.
            </p>
          </div>

          <div className="overflow-hidden rounded-[14px] border border-rule">
            <dl className="ruled bg-raised text-sm">
              {[
                ['You pay', `${Number.isFinite(hire.budget) ? hire.budget : '—'} $U${IS_TESTNET ? ' (test token)' : ''}`],
                ['Held by', `ERC-8183 escrow on ${NETWORK_LABEL}`],
                ['Agent is paid', 'After it delivers and you accept, or the review window passes without a dispute'],
                ['Deadline', '24 hours from funding'],
                ['If nothing is delivered', 'You reclaim the full amount after the deadline'],
                ['Network fee', hire.active.mode === 'external' ? `A few cents of ${NATIVE_SYMBOL}, paid by your wallet` : sponsored && !hire.funding.paymentLow ? 'Covered by Pokter if your wallet is short of gas' : `About 0.002 ${NATIVE_SYMBOL}`],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <dt className="text-ink-3">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {hire.authority && (
            <Details summary="What this hire can and cannot do">
              <ul className="flex flex-col gap-1.5 text-[13px] text-ink-2">
                <li className="flex gap-2">
                  <Icon.Check size={15} className="mt-0.5 shrink-0 text-ok" /> Move exactly {hire.authority.budgetU} $U into the escrow contract <span className="t-readout">{shortAddress(props.escrow.commerce)}</span>
                </li>
                {hire.authority.prohibited.map((p) => (
                  <li key={p} className="flex gap-2">
                    <Icon.Cross size={15} className="mt-0.5 shrink-0 text-bad" /> {p}
                  </li>
                ))}
              </ul>
            </Details>
          )}

          {props.warnings.length > 0 && (
            <div className="flex flex-col gap-3 rounded-[14px] border border-[color-mix(in_oklab,var(--watch)_35%,transparent)] bg-watch-wash/70 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-watch">
                <Icon.Alert size={16} /> Pokter does not recommend this hire without reading this
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
                {props.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <Checkbox checked={hire.riskAccepted} onChange={(e) => hire.setRiskAccepted(e.target.checked)} label="I understand, and want to hire anyway" />
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button intent="ghost" onClick={() => setStep('describe')} icon={<Icon.ChevronLeft size={16} />}>
              Back
            </Button>
            <Button size="l" onClick={() => setStep('pay')} disabled={Boolean(budgetError) || !hire.riskAccepted} trailing={<Icon.Arrow size={16} />}>
              Continue to payment
            </Button>
          </div>
        </div>
      )}

      {step === 'pay' && (
        <div className="anim-fade flex flex-col gap-6">
          <div>
            <h1 className="t-h2">Fund the escrow</h1>
            <p className="mt-1 text-sm text-ink-2">This is the only step that moves money. You will confirm it in your wallet.</p>
          </div>

          {!hire.active.address ? (
            <div className="flex flex-col items-start gap-4 rounded-[14px] border border-rule bg-raised p-5">
              <p className="text-sm text-ink-2">{hire.lockReason ?? 'Connect a wallet to fund this job.'}</p>
              <Button onClick={() => openConnect('to fund this job')} icon={<Icon.Wallet size={16} />}>
                {hire.active.wrongChain ? 'Switch network' : 'Connect a wallet'}
              </Button>
              <p className="text-[12.5px] text-ink-3">A passkey wallet takes about ten seconds to make, and needs no extension.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{hire.active.mode === 'passkey' ? 'Passkey wallet' : 'Browser wallet'}</span>
                  <Address address={hire.active.address} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Balance
                    label="$U to pay with"
                    value={hire.funding.token?.ok ? Number(formatUnits(hire.funding.token.raw, hire.funding.token.decimals)).toFixed(2) : '—'}
                    ok={hire.funding.paymentReady}
                    known={hire.funding.paymentKnown}
                    note={hire.funding.paymentLow ? (hire.active.mode === 'passkey' ? `Short. Pokter will swap ${NATIVE_SYMBOL} for the difference if you hold enough.` : 'Short of the budget.') : undefined}
                  />
                  <Balance
                    label={`${NATIVE_SYMBOL} for the fee`}
                    value={hire.funding.native !== undefined ? Number(formatEther(hire.funding.native)).toFixed(4) : '—'}
                    ok={hire.funding.gasReady}
                    known={hire.funding.gasKnown}
                    note={hire.funding.gasLow ? (hire.active.mode === 'passkey' && sponsored && !hire.funding.paymentLow ? 'Low. Pokter will cover the fee.' : hire.active.mode === 'passkey' && sponsored ? 'Low. Pokter covers it once the wallet holds the budget in $U.' : 'Too low for the network fee.') : undefined}
                  />
                </div>
                {IS_TESTNET && FAUCETS && (hire.funding.paymentLow || hire.funding.gasLow) && (
                  <p className="text-[12.5px] text-ink-3">
                    Test tokens: ask{' '}
                    <a href={FAUCETS.paymentTokenBot?.url ?? FAUCETS.paymentToken} className="link" target="_blank" rel="noreferrer noopener">
                      {FAUCETS.paymentTokenBot?.handle ?? 'the faucet'}
                    </a>{' '}
                    for $U and {NATIVE_SYMBOL}, or use the{' '}
                    <a href={FAUCETS.native} className="link" target="_blank" rel="noreferrer noopener">
                      {NATIVE_SYMBOL} faucet
                    </a>
                    .
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-4 rounded-[14px] border-2 border-ink bg-raised p-5">
                <span className="t-label">You are about to</span>
                <p className="text-[15px] leading-relaxed">
                  Pay <strong className="t-readout">{hire.budget} $U</strong> into the escrow contract <span className="t-readout text-[13px]">{shortAddress(props.escrow.commerce)}</span> on {NETWORK_LABEL}, for one job delivered by <span className="t-readout text-[13px]">{shortAddress(hire.providerAddress)}</span>.
                </p>
                <p className="text-[13px] text-ink-3">
                  {hire.active.mode === 'passkey'
                    ? 'You will confirm with your passkey (Face ID, Touch ID or PIN). If a swap is needed, that is one extra confirmation.'
                    : 'Your wallet will ask you to approve the job’s transactions, either as one batch or a few in a row. A signature for the quote is not a payment; only the funding transaction moves money.'}
                </p>
                <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} label="I’ve checked the amount, network and recipient" />
                <Button intent="signal" size="l" onClick={() => void hire.commission()} disabled={!confirmed || !hire.riskAccepted || Boolean(budgetError)} className="w-full">
                  Fund escrow · {hire.budget} $U
                </Button>
              </div>
            </>
          )}

          <div className="flex justify-start">
            <Button intent="ghost" onClick={() => setStep('review')} icon={<Icon.ChevronLeft size={16} />}>
              Back
            </Button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Balance({ label, value, ok, known, note }: { label: string; value: string; ok: boolean; known: boolean; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="t-label">{label}</span>
      <span className={cn('t-readout text-lg', !known ? 'text-ink-3' : ok ? 'text-ink' : 'text-watch')}>{value}</span>
      {note && <span className="text-[12px] leading-snug text-ink-3">{note}</span>}
    </div>
  );
}

function Shell({ agent, step, children }: { agent: HireFlowProps['agent']; step: Step | null; children: React.ReactNode }) {
  const index = step ? STEPS.findIndex((s) => s.id === step) : STEPS.length;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-rule bg-[color-mix(in_oklab,var(--paper)_92%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex items-center gap-2.5">
            <Mark size={20} />
            <span className="text-[15px] font-semibold">Hire</span>
          </span>
          <Link href={`/agents/${agent.chainId}/${agent.tokenId}`} className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
            <Icon.Close size={15} /> Exit
          </Link>
        </div>
        <div className="h-0.5 bg-rule">
          <div className="h-full bg-signal transition-[width] duration-500 ease-out" style={{ width: `${((index + (step ? 0.5 : 0)) / STEPS.length) * 100}%` }} />
        </div>
      </header>
      <div className="mx-auto grid grid-cols-1 max-w-5xl gap-10 px-4 py-8 sm:px-6 md:grid-cols-[220px_minmax(0,1fr)] md:py-12">
        <aside className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <AgentAvatar name={agent.name} imageUrl={agent.imageUrl} seed={agent.key} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{agent.name}</p>
              <p className="text-[12px] text-ink-3">#{agent.tokenId}</p>
            </div>
          </div>
          <ol className="hidden flex-col gap-1 md:flex" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s.id} className={cn('flex items-center gap-3 rounded-[8px] px-2 py-1.5 text-[13.5px]', i === index ? 'bg-sunken font-medium text-ink' : i < index ? 'text-ink-2' : 'text-ink-3')} aria-current={i === index ? 'step' : undefined}>
                <span className={cn('grid size-5 place-items-center rounded-full border text-[10.5px]', i < index ? 'border-ok bg-ok text-paper' : i === index ? 'border-ink' : 'border-rule-strong')}>
                  {i < index ? <Icon.Check size={11} /> : i + 1}
                </span>
                {s.label}
              </li>
            ))}
          </ol>
          {IS_TESTNET && <p className="hidden text-[12px] leading-relaxed text-ink-3 md:block">BNB testnet. $U here is a test token with no value.</p>}
        </aside>
        <main id="main" className="min-w-0 max-w-2xl">
          {children}
        </main>
      </div>
    </div>
  );
}
