'use client';

import Link from 'next/link';
import { useState } from 'react';

import { formatBudget } from '@/lib/erc8183/pricing';
import { NETWORK_LABEL, PAYMENT_VALUE_NOTE } from '@/lib/network/presentation';
import type { HireStep } from '@/lib/wallet/external';
import { useGasSponsorship } from '@/lib/wallet/sponsor-client';
import { shortAddress } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Checkbox, Textarea } from '@/components/ui/Field';
import { DefinitionList } from '@/components/ui/Definition';
import { Segmented } from '@/components/ui/Segmented';
import { StagedProgress } from '@/components/ui/Progress';
import { CampaignWalletNote } from './CampaignWalletNote';
import { ReadinessRow } from './ReadinessRow';
import { HireError } from './HireError';
import { BUDGET_MAX, BUDGET_MIN, useHire, type HireAgent, type ProviderChoice } from './useHire';

const PRESETS = [0.05, 0.1, 0.25, 0.5];

const EXTERNAL_STAGES: { id: HireStep; label: string }[] = [
  { id: 'connecting', label: 'Connecting your wallet' },
  { id: 'creating', label: 'Creating the job' },
  { id: 'registering', label: 'Attaching the policy' },
  { id: 'budgeting', label: 'Setting the budget' },
  { id: 'approving', label: 'Approving exactly this amount' },
  { id: 'funding', label: 'Paying into escrow' },
  { id: 'confirming', label: 'Waiting for the chain' },
  { id: 'done', label: 'Funded' },
];

/**
 * The hire, as three steps in a drawer: brief, confirm, done. The state is
 * the existing machine; this is only what it looks like. The brief step
 * asks for the two things the escrow records, the confirm step reads the
 * whole order back and names what will be signed, and done is a receipt.
 */
export function HireFlow({ agent, providers, signedQuoteU, riskWarnings, onClose }: { agent: HireAgent; providers: ProviderChoice[]; signedQuoteU: number | null; riskWarnings: string[]; onClose: () => void }) {
  const hire = useHire({ agent, providers, signedQuoteU, riskWarnings });
  const sponsored = useGasSponsorship();
  const [changingProvider, setChangingProvider] = useState(false);
  const busy = hire.state === 'hiring';

  /* ── Done ───────────────────────────────────────────────────────── */
  if (hire.state === 'hired' && hire.job) {
    const job = hire.job;
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-start gap-2">
          <span aria-hidden className="check-in grid size-9 place-items-center rounded-full bg-positive-dim text-positive">
            <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="2.2">
              <path d="m5 13 4 4L19 7" />
            </svg>
          </span>
          <h3 className="text-title" role="status">
            Payment is in escrow. {hire.provider?.label ?? agent.name} has been told.
          </h3>
          <p className="text-body-s text-ink-muted">Nothing else is needed from you until a delivery arrives. You will find it under Your work.</p>
        </div>
        <DefinitionList
          items={[
            { term: 'Paid into escrow', detail: `${formatBudget(Number(job.budgetRaw) / 1e18)}`, note: PAYMENT_VALUE_NOTE ?? undefined },
            { term: 'Delivered by', detail: hire.provider?.label ?? job.providerLabel ?? agent.name },
            { term: 'Due', detail: `${job.expiredAt.slice(0, 10)} ${job.expiredAt.slice(11, 16)} UTC`, note: 'Refundable after this if nothing arrives' },
            { term: 'Job', detail: `#${job.jobId} on ${NETWORK_LABEL}` },
            {
              term: 'Agent told',
              detail:
                hire.notification === 'accepted'
                  ? 'Accepted the job'
                  : hire.notification === 'notifying'
                    ? 'Being told now'
                    : hire.notification === 'rejected'
                      ? 'Declined the job'
                      : hire.notification === 'failed'
                        ? 'Could not be reached yet'
                        : hire.notification === 'not-applicable'
                          ? 'Watches the chain itself'
                          : 'Notification queued',
              note: hire.notification === 'failed' || hire.notification === 'rejected' ? 'Pokter retries on its own schedule. The escrow is unaffected.' : undefined,
            },
          ]}
        />
        <div className="flex flex-col gap-2">
          {/*
            To the activity page, anchored on this job.

            This pointed at /jobs/<id>, a route that does not exist here —
            so the one link offered immediately after somebody funded an
            escrow returned a 404. It came across with the hire drawer from
            a branch that has that page; this codebase keeps jobs on the
            activity page, and each row now carries its id as an anchor.
          */}
          <Button href={`/activity#job-${job.jobId}`} variant="primary" block>
            Open the job
          </Button>
          <Button onClick={onClose} block>
            Done
          </Button>
        </div>
      </div>
    );
  }

  /* ── Brief ──────────────────────────────────────────────────────── */
  if (hire.screen === 'describe') {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-body-s font-medium">What should it deliver?</p>
          <Segmented
            label="Kind of result"
            size="sm"
            value={hire.selectedTemplate ?? hire.taskTemplates[0].id}
            onChange={(id) => hire.chooseTemplate(id)}
            options={hire.taskTemplates.map((template) => ({ value: template.id, label: template.label, short: template.short }))}
            className="w-full"
          />
          <Textarea value={hire.task} onChange={(event) => hire.setTask(event.target.value)} rows={5} aria-label="Your brief" disabled={busy} className="bg-canvas text-body-s" />
          <p className="text-small text-ink-muted">Written into the job on chain. Never include keys or seed phrases.</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-body-s font-medium">Budget held in escrow</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-9 items-center rounded-md border border-line bg-canvas focus-within:border-ink">
              <input type="number" min={BUDGET_MIN} max={BUDGET_MAX} step={0.05} value={hire.budget} disabled={busy} onChange={(event) => hire.setBudget(Number(event.target.value))} aria-label="Budget in $U" aria-invalid={!hire.budgetValid || undefined} className="mono h-full w-20 bg-transparent px-2.5 text-body-s outline-none" />
              <span className="border-l border-line px-2.5 text-small text-ink-muted">$U</span>
            </div>
            {PRESETS.map((amount) => (
              <button key={amount} type="button" disabled={busy} onClick={() => hire.setBudget(amount)} className={cn('tap-safe h-9 rounded-md border px-3 text-body-s font-medium transition-colors', hire.budget === amount ? 'border-ink bg-ink text-canvas' : 'border-line text-ink-secondary hover:border-line-strong')}>
                {amount}
              </button>
            ))}
          </div>
          <p className={cn('text-small', hire.budgetValid ? 'text-ink-muted' : 'text-negative')}>
            {hire.budgetValid ? `${signedQuoteU !== null ? `The agent signed ${formatBudget(signedQuoteU)}.` : 'No signed price; you set it.'} Between ${BUDGET_MIN} and ${BUDGET_MAX} $U. Released only when you accept the delivery.` : `Enter between ${BUDGET_MIN} and ${BUDGET_MAX} $U.`}
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-line bg-canvas-subtle p-3">
          <div className="flex items-center justify-between gap-3 text-body-s">
            <span className="text-ink-muted">Delivered by</span>
            <span className="flex items-center gap-2">
              <span className="font-medium">{hire.provider?.label ?? 'Choose'}</span>
              {providers.length > 1 && (
                <button type="button" onClick={() => setChangingProvider((v) => !v)} className="text-small text-ink-muted prose-link">
                  {changingProvider ? 'Keep' : 'Change'}
                </button>
              )}
            </span>
          </div>
          {changingProvider && (
            <ul className="flex flex-col gap-1.5 border-t border-line pt-2">
              {providers.map((option) => {
                const can = option.reachable && option.automatedDelivery;
                const chosen = hire.providerAddress === option.address;
                return (
                  <li key={option.address}>
                    <button type="button" disabled={!can || busy} aria-pressed={chosen} onClick={() => can && hire.setProviderAddress(option.address)} className={cn('flex w-full flex-col gap-0.5 rounded-md border p-2.5 text-left text-body-s', chosen ? 'border-ink' : 'border-line', !can && 'cursor-not-allowed opacity-60')}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{option.label}</span>
                        <span className="mono text-caption text-ink-faint">{shortAddress(option.address)}</span>
                      </span>
                      <span className="text-small text-ink-muted">{can ? option.note : option.reachable ? 'Cannot be asked to deliver' : 'On a different chain'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {hire.substituted && hire.providerCanDeliver && (
            <p className="text-small leading-relaxed text-ink-muted">
              {agent.name} cannot see this escrow, so {hire.provider?.label} carries your brief to its endpoint and delivers its answer unchanged. If it does not answer, nothing is delivered and the budget comes back when the window closes.
            </p>
          )}
          {!hire.providerCanDeliver && <p className="text-small text-negative">Nothing can deliver this job yet. Choose a provider that can be asked.</p>}
        </div>

        <Button variant="primary" block onClick={() => hire.setScreen('fund')} disabled={!hire.describeValid || busy}>
          Review and confirm
        </Button>
      </div>
    );
  }

  /* ── Confirm ────────────────────────────────────────────────────── */
  const passkey = hire.active.mode === 'passkey';
  const externalIndex = hire.externalStep ? EXTERNAL_STAGES.findIndex((stage) => stage.id === hire.externalStep) : 0;
  const passkeyStages = [
    ...(sponsored ? [{ id: 'fee', label: 'Covering the network fee', detail: 'Pokter tops up your passkey wallet.' }] : []),
    { id: 'confirm', label: 'Confirm on your device', detail: 'One passkey prompt signs the approval and the deposit together.' },
    { id: 'chain', label: 'Waiting for the chain' },
    { id: 'tell', label: 'Telling the agent' },
  ];
  const passkeyIndex = hire.stage === 'sponsoring' ? 0 : hire.stage === 'swapping' ? (sponsored ? 1 : 0) : sponsored ? 1 : 0;

  return (
    <div className="flex flex-col gap-5">
      <DefinitionList
        items={[
          { term: 'Brief', detail: <span className="line-clamp-4 whitespace-pre-wrap">{hire.task}</span> },
          { term: 'Into escrow', detail: formatBudget(hire.budget), note: PAYMENT_VALUE_NOTE ?? 'Exactly this; no allowance stays behind' },
          { term: 'Delivered by', detail: hire.provider?.label ?? '—' },
          { term: 'Window', detail: `${hire.authority?.deliveryWindowHours ?? 24} hours`, note: 'Refundable after this if nothing arrives' },
          { term: 'Escrow', detail: hire.authority ? <span className="mono">{shortAddress(hire.authority.escrowContract)}</span> : '—', note: NETWORK_LABEL },
        ]}
      />

      {hire.riskWarnings.length > 0 && (
        <Callout tone="caution" title="Read before you fund">
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {hire.riskWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <Checkbox label="I understand and still want to fund this job." checked={hire.riskAccepted} onChange={(event) => hire.setRiskAccepted(event.target.checked)} />
        </Callout>
      )}

      <CampaignWalletNote mode={hire.active.mode} />

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-body-s font-medium">{hire.locked ? 'To sign, you need' : 'Ready to sign'}</p>
        <ReadinessRow priceU={hire.budget} variant="full" />
        <p className="text-small leading-relaxed text-ink-muted">
          {passkey ? (sponsored ? 'One passkey confirmation. Pokter covers the network fee.' : 'One passkey confirmation.') : hire.active.mode === 'external' ? 'Two wallet prompts: an approval for exactly this amount, then the deposit.' : 'A wallet or a passkey, chosen above. Nothing is signed before then.'} The agent never sees your wallet.
        </p>
      </div>

      {busy && <StagedProgress current={passkey ? passkeyIndex : Math.max(0, externalIndex)} stages={passkey ? passkeyStages : EXTERNAL_STAGES} className="rounded-md border border-line bg-canvas-subtle p-4" />}

      {hire.state === 'error' && <HireError hire={hire} />}

      <div className="flex flex-col gap-2">
        <Button variant="primary" block onClick={hire.commission} disabled={busy || hire.locked || !hire.providerCanDeliver || !hire.riskAccepted || !hire.task.trim()} loading={busy}>
          {busy ? 'Working…' : `Fund ${formatBudget(hire.budget)} into escrow`}
        </Button>
        <Button block onClick={() => hire.setScreen('describe')} disabled={busy}>
          Back
        </Button>
        {hire.lockReason && !busy && <p className="text-small text-caution">{hire.lockReason}</p>}
        <p className="text-caption text-ink-faint">
          By funding you accept the <Link href="/terms" className="prose-link">terms</Link>. Test tokens on {NETWORK_LABEL}; no real value.
        </p>
      </div>
    </div>
  );
}
