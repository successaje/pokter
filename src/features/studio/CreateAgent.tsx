'use client';

import Link from 'next/link';
import { useState } from 'react';

import { CATEGORIES } from '@/lib/agents/categories';
import { draftFromBrief, EMPTY_BRIEF, type LaunchBrief } from '@/lib/builder/brief';
import type { StoredDraft } from '@/lib/builder/drafts';
import { NATIVE_SYMBOL } from '@/lib/network/presentation';
import { avatarUrl } from '@/lib/ui/avatar-art';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { Button, LinkButton, Spinner } from '@/ui/Button';
import { Segmented } from '@/ui/Controls';
import { CopyButton, Details } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';
import { Checkbox, Field, Input, Select, Textarea } from '@/ui/Field';
import { Icon } from '@/ui/icons';
import { siteUrlClient } from './site';
import { useAgentDraft, type AgentDraft } from './useAgentDraft';

const STEPS = [
  { id: 'define', label: 'Define', detail: 'What it does and for whom' },
  { id: 'configure', label: 'Configure', detail: 'Endpoint, behaviour, image' },
  { id: 'test', label: 'Test', detail: 'Pokter calls it like a buyer' },
  { id: 'publish', label: 'Publish', detail: 'Register its identity' },
] as const;

const REG_STEPS = [
  { id: 'connecting', label: 'Connecting the wallet' },
  { id: 'switching-network', label: 'Checking the network' },
  { id: 'registering', label: 'Registering the identity', hint: 'Approve the first transaction.' },
  { id: 'confirming-registration', label: 'Confirming on chain' },
  { id: 'publishing-profile', label: 'Publishing the profile', hint: 'Approve the second transaction.' },
  { id: 'verifying', label: 'Reading it back from chain' },
];

function Blueprint({ d }: { d: AgentDraft }) {
  const [brief, setBrief] = useState<LaunchBrief>({ ...EMPTY_BRIEF, outcome: d.draft.category });
  const [applied, setApplied] = useState(false);
  const set = <K extends keyof LaunchBrief>(k: K, v: LaunchBrief[K]) => {
    setApplied(false);
    setBrief((b) => ({ ...b, [k]: v }));
  };
  const complete = brief.outcome && brief.audience.trim() && brief.task.trim() && brief.evidence.trim() && brief.limits.trim();
  return (
    <Details summary="Start from an idea instead: answer five questions">
      <div className="flex flex-col gap-4 rounded-[12px] border border-rule bg-paper p-4">
        <p className="text-[13px] text-ink-2">Pokter turns your answers into a name and description you can edit. It is a written blueprint, not a working agent: you still need an endpoint that does the work.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Outcome">
            {(p) => (
              <Select {...p} value={brief.outcome} onChange={(e) => set('outcome', e.target.value)}>
                <option value="">Choose one</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Who it is for">{(p) => <Input {...p} placeholder="e.g. Venus borrowers" value={brief.audience} onChange={(e) => set('audience', e.target.value)} />}</Field>
          <Field label="What it does" className="sm:col-span-2">{(p) => <Input {...p} placeholder="e.g. Checks a lending position’s health factor" value={brief.task} onChange={(e) => set('task', e.target.value)} />}</Field>
          <Field label="What its answer includes">{(p) => <Input {...p} placeholder="e.g. liquidation distance and data sources" value={brief.evidence} onChange={(e) => set('evidence', e.target.value)} />}</Field>
          <Field label="What it will not do">{(p) => <Input {...p} placeholder="e.g. move funds or promise protection" value={brief.limits} onChange={(e) => set('limits', e.target.value)} />}</Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="How it is called" size="s" value={brief.interaction} onChange={(v) => set('interaction', v)} options={[{ value: 'task', label: 'Takes tasks (A2A)' }, { value: 'tool', label: 'Is a tool (MCP)' }]} />
          <Button
            intent="secondary"
            size="s"
            disabled={!complete}
            onClick={() => {
              d.replace(draftFromBrief(brief));
              setApplied(true);
            }}
          >
            Write the blueprint
          </Button>
          {applied && <span className="text-[13px] text-ok">Filled in above. Edit freely.</span>}
        </div>
      </div>
    </Details>
  );
}

function StepDefine({ d }: { d: AgentDraft }) {
  return (
    <div className="flex flex-col gap-6">
      <Blueprint d={d} />
      <Field label="Name" hint="What buyers will see. Specific beats clever.">
        {(p) => <Input {...p} value={d.draft.name} maxLength={80} onChange={(e) => d.update('name', e.target.value)} placeholder="Position Guardian" />}
      </Field>
      <Field label="Description" hint={<>Say what it returns, for whom, and what it will not do. <span className="t-readout">{d.draft.description.trim().length}/600</span></>}>
        {(p) => <Textarea {...p} value={d.draft.description} maxLength={600} onChange={(e) => d.update('description', e.target.value)} placeholder="Checks supported BNB Chain lending positions, explains health-factor changes, and returns a read-only risk report without moving funds." />}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Category</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <label key={c.id} className={cn('flex cursor-pointer items-start gap-3 rounded-[10px] border p-3', d.draft.category === c.id ? 'border-ink bg-raised' : 'border-rule hover:border-rule-strong')}>
              <input type="radio" name="category" className="mt-1 accent-[var(--ink)]" checked={d.draft.category === c.id} onChange={() => d.update('category', c.id)} />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{c.label}</span>
                <span className="text-[12.5px] leading-snug text-ink-3">{c.blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function StepConfigure({ d }: { d: AgentDraft }) {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">How buyers reach it</span>
        <Segmented label="Protocol" value={d.draft.protocol} onChange={(v) => d.update('protocol', v)} options={[{ value: 'a2a', label: 'A2A agent' }, { value: 'mcp', label: 'MCP server' }]} />
        <Field label="Endpoint URL" hint={d.draft.protocol === 'a2a' ? 'The base URL serving /.well-known/agent-card.json, or the card itself.' : 'Your MCP server’s https endpoint.'}>
          {(p) => <Input {...p} value={d.draft.endpoint} onChange={(e) => d.update('endpoint', e.target.value)} placeholder="https://agent.example.com" className="t-readout text-[14px]" spellCheck={false} />}
        </Field>
        <Details summary="No endpoint yet? Build one">
          <div className="flex flex-col gap-3 text-[13.5px] leading-relaxed text-ink-2">
            <p>
              <strong className="font-medium text-ink">With an AI coding tool.</strong> Copy this prompt into Claude Code, Cursor or similar. It describes the agent card, the negotiate and delivery skills Pokter calls, and the limits you set below.
            </p>
            <div className="relative">
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[10px] border border-rule bg-sunken p-3 pr-10 text-[12px] leading-relaxed">{d.buildPrompt}</pre>
              <CopyButton value={d.buildPrompt} label="Copy prompt" className="absolute right-2 top-2 bg-raised" />
            </div>
            <p>
              <strong className="font-medium text-ink">With BNB Agent Studio.</strong> Studio deploys an agent and registers its ERC-8004 identity in one step. Then connect it here by its ID.{' '}
              <a href="https://www.bnbchain.org/en/bnb-agent-studio" target="_blank" rel="noreferrer noopener" className="link">
                BNB Agent Studio
              </a>
              . Agents behind an OAuth-protected endpoint cannot be called anonymously, so buyers here could not hire them.
            </p>
          </div>
        </Details>
      </div>

      {d.runtimeOptions && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Behaviour</span>
          <p className="text-[13px] text-ink-3">Written into the build prompt and a runtime config file. Your runtime enforces these; Pokter checks the public endpoint independently.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(['target', 'policy', 'output'] as const).map((k) => (
              <Field key={k} label={k === 'target' ? 'Works on' : k === 'policy' ? 'Risk stance' : 'Returns'}>
                {(p) => (
                  <Select {...p} value={d.runtime[k]} onChange={(e) => d.chooseRuntime(k, e.target.value)}>
                    {d.runtimeOptions![k].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
          </div>
          <Button intent="ghost" size="s" onClick={d.downloadRuntimeConfig} icon={<Icon.Download size={14} />} className="self-start">
            Download runtime config
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">Image</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Generated images">
          {d.avatarSeeds.map((seed) => {
            const url = `${siteUrlClient()}${avatarUrl(seed)}`;
            const selected = d.image === url || (!d.draft.image && seed === d.avatarSeeds[0]);
            return (
              <button key={seed} type="button" role="radio" aria-checked={selected} onClick={() => d.update('image', url)} className={cn('rounded-[12px] border-2 p-0.5', selected ? 'border-ink' : 'border-transparent')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarUrl(seed)} alt="" width={48} height={48} className="size-12 rounded-[9px]" />
              </button>
            );
          })}
        </div>
        <Field label="Or your own image URL" hint="https only. Shown on your listing." >
          {(p) => <Input {...p} value={d.draft.image.startsWith(siteUrlClient()) ? '' : d.draft.image} onChange={(e) => d.update('image', e.target.value)} placeholder="https://…/logo.png" />}
        </Field>
      </div>

      <Field label="Source repository" hint="Optional, public. Buyers trust what they can read." error={d.repositoryProblem ?? undefined} optional>
        {(p) => <Input {...p} value={d.draft.repository} onChange={(e) => d.update('repository', e.target.value)} placeholder="https://github.com/you/agent" />}
      </Field>
    </div>
  );
}

function StepTest({ d }: { d: AgentDraft }) {
  const p = d.preflight;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Endpoint check</p>
            <p className="t-readout truncate text-[12.5px] text-ink-3">{d.draft.endpoint || 'No endpoint set'}</p>
          </div>
          <Button onClick={() => void d.runPreflight()} busy={d.preflightBusy} disabled={!/^https:\/\//i.test(d.draft.endpoint.trim())} intent={d.endpointChecked ? 'secondary' : 'primary'}>
            {d.endpointChecked ? 'Check again' : 'Run the check'}
          </Button>
        </div>
        {!/^https:\/\//i.test(d.draft.endpoint.trim()) && <p className="text-[13px] text-watch">Set an https endpoint in Configure first.</p>}
        {d.preflightBusy && (
          <p className="flex items-center gap-2 text-[13px] text-ink-3" role="status">
            <Spinner /> Calling it from Pokter&rsquo;s servers, as a buyer&rsquo;s hire would…
          </p>
        )}
        {d.preflightError && <Notice tone="bad" title="The check could not run">{d.preflightError}</Notice>}
        {p && (
          <div className="anim-fade flex flex-col gap-3">
            <Notice tone={p.ok ? 'ok' : 'bad'} title={p.ok ? `It answered${p.latencyMs ? ` in ${p.latencyMs} ms` : ''}` : 'It did not answer correctly'}>
              {p.detail}
            </Notice>
            <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-3">
              <div>
                <dt className="t-label">Skills found</dt>
                <dd className="mt-1">{p.capabilities.length ? p.capabilities.slice(0, 6).join(', ') : 'None declared'}</dd>
              </div>
              <div>
                <dt className="t-label">Signed quotes</dt>
                <dd className={cn('mt-1', p.quoteCapability ? 'text-ok' : 'text-watch')}>{p.quoteCapability ? 'Supports negotiate' : 'No negotiate skill: buyers set the budget blind'}</dd>
              </div>
              <div>
                <dt className="t-label">HTTP status</dt>
                <dd className="t-readout mt-1">{p.status ?? '—'}</dd>
              </div>
            </dl>
            <Details summary="What Pokter refused to do while checking (safety)">
              <ul className="grid grid-cols-1 gap-1.5 text-[12.5px] text-ink-2 sm:grid-cols-2">
                {[
                  ['Required https', p.safety.httpsRequired],
                  ['Rejected credentials in the URL', p.safety.credentialsRejected],
                  ['Pinned DNS for the request', p.safety.dnsPinned],
                  ['Refused private networks', p.safety.privateNetworksRejected],
                  ['Did not follow redirects', p.safety.redirectsBlocked],
                ].map(([label, on]) => (
                  <li key={label as string} className="flex items-center gap-2">
                    {on ? <Icon.Check size={14} className="text-ok" /> : <Icon.Dash size={14} className="text-ink-3" />} {label}
                  </li>
                ))}
                <li className="text-ink-3">
                  Timeout {p.safety.timeoutMs} ms · response cap {Math.round(p.safety.responseLimitBytes / 1024)} KB
                </li>
              </ul>
            </Details>
          </div>
        )}
      </div>

      <div className={cn('flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5', !d.endpointChecked && 'opacity-60')}>
        <div>
          <p className="text-sm font-medium">Sample run</p>
          <p className="text-[13px] text-ink-3">
            {d.trialCapability ? `Calls its “${d.trialCapability}” skill with a read-only task.` : 'Calls a preview or simulate skill if it has one. Optional.'}
          </p>
        </div>
        <Textarea value={d.trialTask} onChange={(e) => d.setTrialTask(e.target.value)} maxLength={500} className="min-h-20 text-[13.5px]" aria-label="Sample task" disabled={!d.endpointChecked} />
        <Button intent="secondary" onClick={() => void d.runTrial()} busy={d.trialBusy} disabled={!d.endpointChecked || d.trialTask.trim().length < 10} className="self-start" icon={<Icon.Play size={14} />}>
          Run a sample
        </Button>
        {d.trialError && <Notice tone="watch">{d.trialError}</Notice>}
        {d.trial && (
          <div className="anim-fade flex flex-col gap-2">
            <Notice tone={d.trial.ok ? 'ok' : 'watch'} title={d.trial.summary} />
            <pre className="max-h-64 overflow-auto rounded-[10px] bg-sunken p-3 text-[12px]">{JSON.stringify(d.trial.response, null, 2).slice(0, 4000)}</pre>
            <p className="text-[12px] text-ink-3">{d.trial.disclaimer}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StepPublish({ d }: { d: AgentDraft }) {
  const { openConnect } = useConnect();
  const funded = d.funding[d.network]?.funded;
  const regIndex = d.progress ? REG_STEPS.findIndex((s) => s.id === d.progress!.step) : -1;

  if (d.published) {
    return (
      <div className="anim-rise flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-ok-wash text-ok">
            <Icon.Check size={22} />
          </span>
          <div>
            <h2 className="t-h2">{d.draft.name} is registered</h2>
            <p className="text-sm text-ink-2">
              ERC-8004 identity <span className="t-readout">#{d.published.tokenId}</span> on {d.published.chainId === 56 ? 'BNB Chain' : 'BNB testnet'}.
            </p>
          </div>
        </div>
        {d.passkeyCanPublish && (
          <Notice tone="watch" title="Managing it needs a browser wallet, for now">
            It is owned by your passkey wallet. Studio&rsquo;s ownership check and profile editor need a message signature that passkey wallets cannot produce yet, so Studio cannot manage or edit it yet. Its public listing, probes and hires work as normal.
          </Notice>
        )}
        <Notice tone="neutral" title="Registered is not the same as proven">
          Pokter starts probing it on the next sweep. Its listing shows &ldquo;Not measured&rdquo; until there is evidence, and it becomes hireable once it answers.
        </Notice>
        <div className="flex flex-wrap gap-3">
          <LinkButton href={`/studio/agents/${d.published.chainId}/${d.published.tokenId}`} trailing={<Icon.Arrow size={16} />}>
            Manage this agent
          </LinkButton>
          <LinkButton href={`/agents/${d.published.chainId}/${d.published.tokenId}`} intent="secondary">
            See the public listing
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="ruled rounded-[14px] border border-rule bg-raised px-5">
        {d.checks.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3">
            <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', c.done ? 'bg-ok text-paper' : 'border border-rule-strong text-ink-3')}>{c.done ? <Icon.Check size={13} /> : <Icon.Dash size={13} />}</span>
            <span className="flex flex-col">
              <span className="text-sm font-medium">{c.label}</span>
              {!c.done && <span className="text-[12.5px] text-ink-3">{c.hint}</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">Register on</span>
        <Segmented label="Network" value={String(d.network) as '97' | '56'} onChange={(v) => d.setNetwork(Number(v) as 56 | 97)} options={[{ value: '97', label: 'BNB testnet' }, { value: '56', label: 'BNB Chain' }]} />
        {d.network === 56 && (
          <Checkbox
            checked={d.mainnetConsent}
            onChange={(e) => d.setMainnetConsent(e.target.checked)}
            label="I understand this is two mainnet transactions paid in real BNB"
            description="Registration is permanent: the identity can be updated but not deleted."
          />
        )}
        {d.network === 56 && d.passkeyCanPublish && <Notice tone="watch">A passkey wallet publishes only on the network it lives on. Use a browser wallet for BNB Chain mainnet.</Notice>}
      </div>

      {!d.signingAddress ? (
        <div className="flex flex-col items-start gap-3 rounded-[14px] border border-rule bg-raised p-5">
          <p className="text-sm text-ink-2">The wallet that signs owns the agent. Use the one you will keep.</p>
          <Button onClick={() => openConnect('to own and publish this agent')} icon={<Icon.Wallet size={16} />}>
            Connect a wallet
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-[14px] border border-rule bg-raised p-5 text-sm">
          <p>
            Owner: <span className="t-readout">{shortAddress(d.signingAddress)}</span> ({d.passkeyCanPublish ? 'passkey wallet' : 'browser wallet'})
          </p>
          <p className={cn('text-[13px]', funded === false ? 'text-watch' : 'text-ink-3')}>
            {funded === false ? `This wallet needs about 0.002 ${d.network === 56 ? 'BNB' : NATIVE_SYMBOL} for the two transactions.` : funded ? 'Enough gas for both transactions.' : 'Checking gas…'}
          </p>
        </div>
      )}

      {d.recovery && !d.publishing && (
        <Notice
          tone="neutral"
          title="This draft's registration was interrupted"
          action={
            <Button size="s" intent="ghost" onClick={d.discardRecovery}>
              Start over instead
            </Button>
          }
        >
          {d.recovery.agentId ? `Identity #${String(d.recovery.agentId)} was minted but its profile was not written. ` : ''}
          Publishing again resumes it with the same wallet rather than minting a second identity.
        </Notice>
      )}

      {d.publishing && d.progress && (
        <ol className="flex flex-col gap-2 rounded-[14px] border border-rule bg-raised p-5 text-sm" aria-live="polite">
          {REG_STEPS.map((s, i) => (
            <li key={s.id} className={cn('flex items-center gap-3', i < regIndex ? 'text-ink-2' : i === regIndex ? 'font-medium text-ink' : 'text-ink-3')}>
              <span className="grid w-5 place-items-center">{i < regIndex ? <Icon.Check size={14} className="text-ok" /> : i === regIndex ? <Spinner size={13} /> : <span className="size-1.5 rounded-full bg-rule-strong" />}</span>
              {s.label}
              {i === regIndex && s.hint && <span className="font-normal text-ink-3">· {s.hint}</span>}
            </li>
          ))}
        </ol>
      )}

      {d.publishError && <Notice tone="bad" title="Not published">{d.publishError}</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <Button intent="signal" size="l" onClick={() => void d.publish()} busy={d.publishing} disabled={!d.ready || !d.signingAddress || (d.network === 56 && !d.mainnetConsent)}>
          {d.recovery ? 'Resume registration' : 'Register the identity'}
        </Button>
        <Button intent="ghost" onClick={d.downloadRegistrationFile} icon={<Icon.Download size={15} />}>
          Download the file instead
        </Button>
      </div>
      <p className="text-[12.5px] text-ink-3">Two transactions: one mints the ERC-8004 identity, the second writes this profile to it. Your wallet shows each before you approve it.</p>
    </div>
  );
}

export function CreateAgent({ initial }: { initial?: StoredDraft | null }) {
  const d = useAgentDraft(initial);
  const step = Math.min(d.step, 3);
  const canNext = step === 0 ? d.checks[0].done && d.checks[1].done && d.checks[2].done : step === 1 ? /^https:\/\//i.test(d.draft.endpoint.trim()) && !d.repositoryProblem : step === 2 ? d.endpointChecked : false;
  const go = (n: number) => {
    d.setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                onClick={() => i <= step && go(i)}
                disabled={i > step}
                aria-current={i === step ? 'step' : undefined}
                className={cn('flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left', i === step ? 'bg-sunken' : 'hover:bg-sunken/60 disabled:hover:bg-transparent')}
              >
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border text-[11px]', i < step ? 'border-ok bg-ok text-paper' : i === step ? 'border-ink' : 'border-rule-strong text-ink-3')}>{i < step ? <Icon.Check size={12} /> : i + 1}</span>
                <span className="flex flex-col">
                  <span className={cn('text-sm font-medium', i > step && 'text-ink-3')}>{s.label}</span>
                  <span className="hidden text-[12px] text-ink-3 lg:block">{s.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-6 hidden rounded-[12px] border border-rule p-4 lg:block">
          <span className="t-label">Readiness</span>
          <p className="t-readout mt-1 text-xl">
            {d.checks.filter((c) => c.done).length}/{d.checks.length}
          </p>
          <p className="text-[12px] text-ink-3">Saved on this device as you go.</p>
        </div>
      </aside>

      <section className="min-w-0 max-w-2xl" aria-labelledby="step-title">
        <div className="mb-6">
          <span className="t-label">
            Step {step + 1} of 4
          </span>
          <h1 id="step-title" className="t-h2 mt-1">
            {step === 0 && 'What will your agent do?'}
            {step === 1 && 'Where does it run?'}
            {step === 2 && 'Does it answer?'}
            {step === 3 && (d.published ? 'Published' : 'Register and publish')}
          </h1>
        </div>
        <div key={step} className="anim-fade">
          {step === 0 && <StepDefine d={d} />}
          {step === 1 && <StepConfigure d={d} />}
          {step === 2 && <StepTest d={d} />}
          {step === 3 && <StepPublish d={d} />}
        </div>
        {!d.published && (
          <div className="mt-10 flex items-center justify-between border-t border-rule pt-5">
            {step > 0 ? (
              <Button intent="ghost" onClick={() => go(step - 1)} icon={<Icon.ChevronLeft size={16} />}>
                Back
              </Button>
            ) : (
              <Link href="/studio" className="text-sm text-ink-3 hover:text-ink">
                Cancel
              </Link>
            )}
            {step < 3 && (
              <Button onClick={() => go(step + 1)} disabled={!canNext} trailing={<Icon.Arrow size={16} />}>
                {step === 2 ? 'Continue to publish' : 'Continue'}
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
