'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatEther, formatUnits } from 'viem';
import { useSwitchChain } from 'wagmi';

import { BUDGET_MAX, BUDGET_MIN, useHire, type HireAgent, type ProviderChoice } from '@/lib/hire/useHire';
import { FAUCETS, chainLabel, explorerBaseFor } from '@/lib/network/presentation';
import { jobHref } from '@/lib/jobs/href';
import { useGasSponsorship } from '@/lib/wallet/sponsor-client';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { formatBudget } from '@/lib/erc8183/pricing';
import { deadlineTerms } from '@/lib/erc8183/deadline';
import { readDisputeWindow } from '@/lib/wallet/external';
import { useQuery } from '@tanstack/react-query';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { Mark } from '@/shell/Logo';
import { AgentAvatar } from '@/ui/Agent';
import { Button, LinkButton, Spinner } from '@/ui/Button';
import { Address, Details } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';
import { Checkbox } from '@/ui/Field';
import { Icon } from '@/ui/icons';
import { JobUpdates } from '@/features/workspace/JobUpdates';
import { TaskEditor } from './TaskEditor';
import { BriefSourceNotice } from './BriefSource';
import { GuidedBrief } from './GuidedBrief';
import { recipeById } from '@/lib/hire/brief-recipes';
import { taskProblems } from '@/lib/hire/task-fields';
import { ConversionBeacon, recordConversionOnce } from '@/features/conversion/ConversionBeacon';
import { explainFailure } from '@/lib/hire/failure';
import type { AnsweredTask } from '@/lib/agent/answered-tasks';
import { stoppedHireEvent } from '@/lib/conversion/funnel';

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
  /** The newest signed price, expired. Used as the budget default. */
  lastSignedU?: number | null;
  warnings: string[];
  escrow: { chainId: number; commerce: string; paymentToken: string };
  /** Set and Earn is running: warn that passkey hires cannot count on a second marketplace. */
  campaignLive?: boolean;
  /** Every escrow this agent can be hired on; more than one means the buyer chooses. */
  escrowOptions?: number[];
  /**
   * The agent's declared skills, so its own examples can be offered as
   * the task rather than a template picked by category.
   */
  declaredSkills?: { name: string; kind?: string; description?: string | null; examples: string[] }[];
  /** Tasks this agent has delivered real answers to, from public escrow jobs. */
  answeredTasks?: AnsweredTask[];
  /** A brief to start from, from the link (`?task=`). */
  initialTask?: string | null;
}

/**
 * `formatEther` prints eighteen decimals, and a swap cost rendered as
 * 0.001234567890123456 is noise at the moment the reader most needs to
 * take it in. Six places is past anything that could matter here and
 * still shows a dust-sized swap as something other than zero.
 */
function trimNative(raw: bigint): string {
  const exact = Number(formatEther(raw));
  return exact < 0.000001 ? '< 0.000001' : String(Number(exact.toFixed(6)));
}

const EXTERNAL_STEPS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'connecting', label: 'Checking your wallet', hint: 'Making sure the right account and network are selected.' },
  /*
    Only reached when the wallet is short on $U. The step list is the same
    for everybody, so this sits dormant for a funded wallet rather than
    being conditionally spliced in — a progress list whose length changes
    while it is on screen is worse than one with a step that never lights.
  */
  { id: 'swapping', label: 'Swapping for the missing $U', hint: 'One prompt. Spends BNB up to the quoted maximum and refunds the rest.' },
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

export function HireFlow(props: HireFlowProps) {
  const hire = useHire({ agent: props.agent, providers: props.providers, signedQuoteU: props.signedQuoteU, suggestedU: props.suggestedU, lastSignedU: props.lastSignedU ?? null, riskWarnings: props.warnings, declaredSkills: props.declaredSkills, escrowChainId: props.escrow.chainId, initialTask: props.initialTask ?? null });
  // A task declared as JSON must have its required inputs before it can be funded.
  // Read against the layout of the template the buyer started from, so a
  // value of the wrong type is not re-read as a different kind of field.
  const taskIssues = useMemo(() => taskProblems(hire.taskSchema, hire.task), [hire.taskSchema, hire.task]);
  // Everything below describes the escrow this hire is funded on, which is
  // chosen per agent and is not necessarily the site's default network.
  const escrowChainId = props.escrow.chainId;
  const testnet = escrowChainId === 97;
  const nativeSymbol = testnet ? 'tBNB' : 'BNB';
  const networkLabel = chainLabel(escrowChainId);
  /*
   * The deadline is the agent's delivery time plus this escrow's dispute
   * window, read from its policy: 15 minutes on testnet, 7 days on mainnet.
   * Shown before funding because it is also how long the money stays
   * locked if nothing is delivered.
   */
  const disputeWindow = useQuery({
    queryKey: ['dispute-window', escrowChainId],
    queryFn: () => readDisputeWindow(escrowChainId),
    staleTime: 60 * 60_000,
  });
  const deadline = disputeWindow.data !== undefined ? deadlineTerms(disputeWindow.data) : null;
  const faucets = testnet ? FAUCETS : null;
  const txUrl = (hash: string) => `${explorerBaseFor(escrowChainId)}/tx/${hash}`;
  const { openConnect } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
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
  const failure = hire.state === 'error' && hire.error ? explainFailure(hire.error, hire.errorLayer) : null;

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

  useEffect(() => {
    if (hire.active.address) recordConversionOnce('wallet_connected', props.agent.chainId, props.agent.tokenId, escrowChainId);
  }, [hire.active.address, props.agent.chainId, props.agent.tokenId, escrowChainId]);

  useEffect(() => {
    if (done) recordConversionOnce('funded', props.agent.chainId, props.agent.tokenId, escrowChainId);
  }, [done, props.agent.chainId, props.agent.tokenId, escrowChainId]);

  const stopped = hire.state === 'error' ? stoppedHireEvent(hire.errorLayer) : null;
  useEffect(() => {
    if (stopped) recordConversionOnce(stopped, props.agent.chainId, props.agent.tokenId, escrowChainId);
  }, [stopped, props.agent.chainId, props.agent.tokenId, escrowChainId]);

  // ── Done ──────────────────────────────────────────────
  if (done && hire.job) {
    const job = hire.job;
    return (
      <Shell agent={props.agent} step={null} testnet={testnet}>
        <div className="anim-rise flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-ok-wash text-ok">
              <Icon.Check size={22} />
            </span>
            <div>
              <h1 className="t-h2">Job #{job.jobId} is funded</h1>
              <p className="text-sm text-ink-2">
                {formatUnits(BigInt(job.budgetRaw), 18)} $U is in escrow. {props.agent.name} is paid only after it delivers and the review window passes without a successful dispute.
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
                  <a href={txUrl(job.hireTxHash)} target="_blank" rel="noreferrer noopener" className="t-readout link text-[13px]">
                    {job.hireTxHash.slice(0, 10)}…
                  </a>
                </dd>
              </div>
            )}
          </dl>
          <JobUpdates jobId={job.jobId} chainId={job.chainId} />
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
            <LinkButton href={jobHref(job)} size="l" trailing={<Icon.Arrow size={16} />}>
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
      <Shell agent={props.agent} step="pay" testnet={testnet}>
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
    <Shell agent={props.agent} step={step} testnet={testnet}>
      <ConversionBeacon event="hire_opened" chainId={props.agent.chainId} tokenId={props.agent.tokenId} escrowChainId={escrowChainId} />
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
          {(props.escrowOptions?.length ?? 0) > 1 && (
            <div role="radiogroup" aria-label="Where to hire" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {props.escrowOptions!.map((option) => {
                const selected = option === escrowChainId;
                return (
                  <Link
                    key={option}
                    role="radio"
                    aria-checked={selected}
                    replace
                    scroll={false}
                    href={`/hire/${props.agent.chainId}/${props.agent.tokenId}?escrow=${option}`}
                    className={cn(
                      'flex flex-col gap-0.5 rounded-[12px] border p-3.5 text-left transition-colors',
                      selected ? 'border-ink bg-raised' : 'border-rule hover:border-rule-strong',
                    )}
                  >
                    <span className="text-sm font-medium">{option === 56 ? 'Hire on BNB Chain' : 'Try free on testnet'}</span>
                    <span className="text-[12.5px] text-ink-2">
                      {option === 56
                        ? 'Real $U from a browser wallet. The agent is paid directly, at its signed price.'
                        : 'Test tokens, no cost. Pokter’s delivery agent carries your task to it and returns its answer.'}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
          {/*
            The phrasings this agent is known to answer, from its own
            delivered jobs. Some sellers parse only a narrow form: Sluicegate
            answered nine one-line questions and returned an error for a
            five-line brief with the same facts. Shown before the generic
            templates because they are evidence about this agent.
          */}
          {props.answeredTasks && props.answeredTasks.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Wording that previously returned an output</span>
                <span className="text-[12.5px] text-ink-3">
                  From delivered jobs paid to this agent’s wallet, where the delivery held content rather than only an error. That shows
                  the wording was understood, not that the answer was right.
                </span>
              </div>
              <div role="radiogroup" aria-label="Wording that previously returned an output" className="flex flex-col gap-2">
                {props.answeredTasks.map((answered) => (
                  <div key={answered.task} className="flex flex-col gap-1">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={hire.task === answered.task}
                      onClick={() => hire.setTask(answered.task)}
                      className={cn('flex items-start gap-2.5 rounded-[12px] border p-3 text-left text-[13.5px] transition-colors', hire.task === answered.task ? 'border-ink bg-raised' : 'border-rule bg-paper hover:border-rule-strong')}
                    >
                      <Icon.Check size={14} className="mt-0.5 shrink-0 text-ok" />
                      <span className="flex flex-col gap-0.5">
                        <span>{answered.task}</span>
                        <span className="text-[11.5px] text-ink-3">
                          Job #{answered.jobId} on {chainLabel(answered.chainId)}
                          {answered.figures.length > 0 ? ` · ${answered.figures.join(', ')} were that buyer’s figures: change them to yours` : ''}
                        </span>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <BriefSourceNotice
            source={hire.briefSource}
            agentName={props.agent.name}
            chainId={props.agent.chainId}
            tokenId={props.agent.tokenId}
            task={hire.task}
            preview={hire.previewSkill}
            wallet={hire.active.address ?? null}
            onUseExample={hire.setTask}
          />
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
          {recipeById(hire.recipeId ?? undefined) && (
            <GuidedBrief
              key={hire.recipeId}
              recipe={recipeById(hire.recipeId ?? undefined)!}
              example={hire.recipeExample}
              agentName={props.agent.name}
              task={hire.task}
              onChange={hire.setTaskKeepingFormat}
            />
          )}
          <div className="flex flex-col gap-1.5">
            <TaskEditor task={hire.task} schema={hire.taskSchema} onChange={hire.setTask} wallet={hire.active.address ?? null} hintId="task-hint" />
            <p id="task-hint" className="flex justify-between gap-3 text-[12.5px] text-ink-3">
              <span>Stored on chain with the job, so anyone can read it. Never include keys, seed phrases or passwords.</span>
              <span className="t-readout shrink-0">{hire.task.length}/2000</span>
            </p>
          </div>

          {props.providers.length > 0 && (
            <ProviderChoices providers={props.providers} selected={hire.providerAddress} onSelect={hire.setProviderAddress} />
          )}
          <div className="flex justify-end">
            {/*
              Said before the money moves, not discovered after.

              The escrow will not let a seller deliver to itself, and
              Pokter knew both addresses the whole time. Two mainnet jobs
              were funded this way and can never be completed by anyone.
            */}
            {hire.selfHire && (
              <Notice tone="bad" title="This wallet is the agent's own provider">
                You would be paying yourself, and the escrow will not accept a delivery
                where the seller and the buyer are the same wallet — the job would sit
                funded until it expired and you reclaimed it. Hire from a different
                wallet to test this agent end to end.
                {props.campaignLive ? ' Set and Earn also requires hirers independent of the agent’s owner, so a hire from here counts for nothing.' : ''}
              </Notice>
            )}
            {taskIssues.length > 0 && (
              <p className="mr-auto self-center text-[12.5px] text-ink-3">To continue: {taskIssues.join('; ')}.</p>
            )}
            <Button size="l" onClick={() => setStep('review')} disabled={!hire.taskReady || taskIssues.length > 0 || !hire.providerCanDeliver || hire.selfHire} trailing={<Icon.Arrow size={16} />}>
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

          {/*
            Said before the first signature, not discovered at it.

            When the wallet is short on $U the hire now buys the shortfall
            on the way through, which spends the holder's tBNB. A swap
            nobody was told about is a swap that happened to them, so the
            cost, the ceiling and the refund are stated here, while
            nothing has been signed and the budget is still editable.
          */}
          {hire.swapPlan && (
            <Notice
              tone={hire.swapPlan.affordable ? 'watch' : 'bad'}
              title={
                hire.swapPlan.maxNativeIn === 0n
                  ? `Short on $U, and no route to buy it`
                  : `This hire will swap first`
              }
            >
              {hire.swapPlan.maxNativeIn === 0n ? (
                <>
                  {/*
                    There is no WBNB/$U pool on the escrow chain — the V3
                    factory returns none at every fee tier — so on testnet
                    this branch is the only one a short wallet ever sees.
                    "Fund the wallet with $U directly" is true and useless
                    without saying where from, and the faucet that hands
                    out both tokens is already known to this codebase.
                  */}
                  Your wallet is {formatBudget(Number(formatUnits(hire.swapPlan.shortfallRaw, 18)))}{' '}
                  short, and there is no pool to buy $U from on {networkLabel}.
                  {faucets?.paymentTokenBot ? (
                    <>
                      {' '}The faucet hands out both tokens: message{' '}
                      <a
                        href={faucets.paymentTokenBot.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline"
                      >
                        {faucets.paymentTokenBot.handle}
                      </a>{' '}
                      with{' '}
                      <span className="t-readout">
                        {faucets.paymentTokenBot.bothAsk.replace('ADDRESS', shortAddress(hire.active.address ?? ''))}
                      </span>
                      , then come back.
                    </>
                  ) : (
                    <> Fund the wallet with $U directly, or lower the budget.</>
                  )}
                </>
              ) : (
                <>
                  Your wallet is {formatBudget(Number(formatUnits(hire.swapPlan.shortfallRaw, 18)))}{' '}
                  short, so the first prompt spends up to{' '}
                  <span className="t-readout">
                    {trimNative(hire.swapPlan.maxNativeIn)} {nativeSymbol}
                  </span>{' '}
                  on PancakeSwap to cover it and refunds whatever it does not need.
                  Then the approval and the deposit, as usual.
                  {!hire.swapPlan.affordable && (
                    <> This wallet does not hold that much {nativeSymbol} with gas to
                    spare — top it up from the faucet, or lower the budget.</>
                  )}
                </>
              )}
            </Notice>
          )}

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
                {budgetError
                  ?? (props.signedQuoteU !== null
                    ? `Signed price ${props.signedQuoteU} $U`
                    : props.lastSignedU != null
                      /* Expired, which almost every stored quote is: they last
                         fifteen minutes. Saying so beats hiding the number the
                         hire will be measured against. */
                      ? `Last signed price ${props.lastSignedU} $U · a fresh quote is signed when you hire`
                      : props.suggestedU !== null
                        ? `Suggested ${props.suggestedU} $U · no signed price`
                        : 'No signed price; you set it')}
              </span>
            </div>
            <p className="text-[12.5px] text-ink-3">
              The agent is asked to sign a quote for this exact task before funding. If its price is above your budget, the hire stops before any payment.
            </p>
          </div>

          <div className="overflow-hidden rounded-[14px] border border-rule">
            <dl className="ruled bg-raised text-sm">
              {[
                ['You pay', `${Number.isFinite(hire.budget) ? hire.budget : '—'} $U${testnet ? ' (test token)' : ''}`],
                ['Held by', `ERC-8183 escrow on ${networkLabel}`],
                ['Agent is paid', 'After it delivers and the review window passes without a successful dispute'],
                ['Deadline', deadline?.deadline ?? `24 hours for the agent to deliver, plus the escrow’s review window on ${networkLabel}`],
                ['If nothing is delivered', deadline?.reclaim ?? 'You reclaim the full amount after the deadline'],
                ['Network fee', hire.active.mode === 'external' || hire.active.passkeyUnsupported || !testnet ? `A few cents of ${nativeSymbol}, paid by your wallet` : sponsored && !hire.funding.paymentLow ? 'Covered by Pokter if your wallet is short of gas' : `About 0.002 ${nativeSymbol}`],
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

          {props.campaignLive && hire.active.mode !== 'external' && (
            <Notice tone="watch" title="Entering Set and Earn? Use the wallet you registered">
              A passkey wallet only works on Pokter, so its hires cannot be matched with a second marketplace, and the campaign disqualifies second wallets. Connect the browser or mobile wallet you registered.{' '}
              <Link href="/set-and-earn" className="link">
                The campaign steps
              </Link>
            </Notice>
          )}

          {!hire.active.address ? (
            <div className="flex flex-col items-start gap-4 rounded-[14px] border border-rule bg-raised p-5">
              <p className="text-sm text-ink-2">{hire.lockReason ?? 'Connect a wallet to fund this job.'}</p>
              {/* Switches to this hire's escrow, which is not necessarily the site's default network the connect dialog offers. */}
              <Button
                onClick={() => (hire.active.wrongChain ? switchChain({ chainId: escrowChainId === 56 ? 56 : 97 }) : openConnect('to fund this job'))}
                busy={switching}
                icon={<Icon.Wallet size={16} />}
              >
                {hire.active.wrongChain ? `Switch to ${networkLabel}` : hire.active.passkeyUnsupported ? 'Connect a browser wallet' : 'Connect a wallet'}
              </Button>
              <p className="text-[12.5px] text-ink-3">
                {testnet ? 'A passkey wallet takes about ten seconds to make, and needs no extension.' : `This hire is paid in real $U on ${networkLabel}, from a browser or mobile wallet.`}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{hire.active.mode === 'passkey' ? 'Passkey wallet' : 'Browser wallet'}</span>
                  <Address address={hire.active.address} chainId={escrowChainId} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {/*
                    The swap promise is conditional on there being a pool.
                    This told every short passkey wallet "Pokter will swap
                    tBNB for the difference", including on the network
                    where the only WBNB/$U pool is empty — so the hire
                    stopped on a step the interface had just guaranteed.
                  */}
                  <Balance
                    label="$U to pay with"
                    value={hire.funding.token?.ok ? Number(formatUnits(hire.funding.token.raw, hire.funding.token.decimals)).toFixed(2) : '—'}
                    ok={hire.funding.paymentReady}
                    known={hire.funding.paymentKnown}
                    note={
                      !hire.funding.paymentLow
                        ? undefined
                        : hire.swapPlan && hire.swapPlan.maxNativeIn === 0n
                          ? `Short, and there is no pool to buy $U from on ${networkLabel}.`
                          : hire.active.mode === 'passkey'
                            ? `Short. Pokter will swap ${nativeSymbol} for the difference if you hold enough.`
                            : 'Short of the budget.'
                    }
                  />
                  <Balance
                    label={`${nativeSymbol} for the fee`}
                    value={hire.funding.native !== undefined ? Number(formatEther(hire.funding.native)).toFixed(4) : '—'}
                    ok={hire.funding.gasReady}
                    known={hire.funding.gasKnown}
                    note={hire.funding.gasLow ? (hire.active.mode === 'passkey' && sponsored && !hire.funding.paymentLow ? 'Low. Pokter will cover the fee.' : hire.active.mode === 'passkey' && sponsored ? 'Low. Pokter covers it once the wallet holds the budget in $U.' : 'Too low for the network fee.') : undefined}
                  />
                </div>
                {testnet && faucets && (hire.funding.paymentLow || hire.funding.gasLow) && (
                  <p className="text-[12.5px] text-ink-3">
                    Test tokens: ask{' '}
                    <a href={faucets.paymentTokenBot?.url ?? faucets.paymentToken} className="link" target="_blank" rel="noreferrer noopener">
                      {faucets.paymentTokenBot?.handle ?? 'the faucet'}
                    </a>{' '}
                    for $U and {nativeSymbol}, or use the{' '}
                    <a href={faucets.native} className="link" target="_blank" rel="noreferrer noopener">
                      {nativeSymbol} faucet
                    </a>
                    .
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-4 rounded-[14px] border-2 border-ink bg-raised p-5">
                <span className="t-label">You are about to</span>
                <p className="text-[15px] leading-relaxed">
                  Pay <strong className="t-readout">{hire.budget} $U</strong> into the escrow contract <span className="t-readout text-[13px]">{shortAddress(props.escrow.commerce)}</span> on {networkLabel}, for one job delivered by <span className="t-readout text-[13px]">{shortAddress(hire.providerAddress)}</span>.
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

function Shell({ agent, step, testnet, children }: { agent: HireFlowProps['agent']; step: Step | null; testnet: boolean; children: React.ReactNode }) {
  const index = step ? STEPS.findIndex((s) => s.id === step) : STEPS.length;
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
        Skip to content
      </a>
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
          {testnet && <p className="hidden text-[12px] leading-relaxed text-ink-3 md:block">BNB testnet. $U here is a test token with no value.</p>}
        </aside>
        <main id="main" className="min-w-0 max-w-2xl">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Who delivers, as one answer.
 *
 * Every provider used to be listed as an equal radio: the agent's own wallet
 * marked "not reachable", Pokter's delivery agent, and sometimes a different
 * seller altogether, followed by a warning box repeating the second option's
 * description. The one that will deliver is shown on its own; the others,
 * with why they are not the default, sit behind a disclosure.
 */
function ProviderChoices({ providers, selected, onSelect }: { providers: ProviderChoice[]; selected: string; onSelect: (address: string) => void }) {
  const current = providers.find((p) => p.address === selected) ?? providers[0];
  const others = providers.filter((p) => p.address !== current.address);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Who delivers</legend>
      <ProviderOption p={current} selected={selected} onSelect={onSelect} />
      {others.length > 0 && (
        <Details summary={`Other ways to deliver (${others.length})`}>
          <div className="flex flex-col gap-2">
            {others.map((p) => (
              <ProviderOption key={p.address} p={p} selected={selected} onSelect={onSelect} />
            ))}
          </div>
        </Details>
      )}
    </fieldset>
  );
}

function ProviderOption({ p, selected, onSelect }: { p: ProviderChoice; selected: string; onSelect: (address: string) => void }) {
  return (
    <label className={cn('flex items-start gap-3 rounded-[12px] border p-3.5', p.reachable ? 'cursor-pointer' : 'cursor-not-allowed opacity-70', selected === p.address ? 'border-ink bg-raised' : 'border-rule')}>
      <input type="radio" name="provider" className="mt-1 accent-[var(--ink)]" checked={selected === p.address} onChange={() => onSelect(p.address)} disabled={!p.reachable} />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">
          {p.label} {!p.reachable && <span className="font-normal text-ink-3">· not available for this hire</span>}
        </span>
        <span className="text-[12.5px] leading-snug text-ink-3">{p.note}</span>
      </span>
    </label>
  );
}
