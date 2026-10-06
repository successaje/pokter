'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getAddress } from 'viem';
import type { Erc8004RegistrationFile } from '@altananetwork/sdk';

import { CATEGORIES } from '@/lib/agents/categories';
import type { DiagnosticCheck, DiagnosticReport } from '@/lib/diagnostic/checks';
import { builderReadinessSteps, nextBuilderAction, type BuilderLifecycle } from '@/lib/diagnostic/builder-lifecycle';
import { summarizeQuality } from '@/lib/builder/quality';
import { draftFromBrief, EMPTY_BRIEF, type LaunchBrief } from '@/lib/builder/brief';
import { createAgentBuildPrompt } from '@/lib/builder/ai-prompt';
import { selectTrialCapability } from '@/lib/builder/trial';
import { cn } from '@/lib/ui/cn';
import { Field, Input, Select, Textarea, describedBy } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { avatarUrl } from '@/lib/ui/avatar-art';
import { Sheet } from '@/components/ui/Sheet';
import { AgentProfileEditor } from '@/components/builder/AgentProfileEditor';
import { connectIdentityWallet, hasIdentityWallet, signIdentityMessage } from '@/lib/registry/wallet';
import { useAccount } from 'wagmi';

import { usePasskeySigner, usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { passkeyRegistrySigner } from '@/lib/registry/passkey-signer';
import { IdentityNetworkToggle } from '@/components/builder/IdentityNetworkToggle';
import { LowBalanceHelp } from '@/components/builder/LowBalanceHelp';
import { DraftList } from '@/components/builder/DraftList';
import {
  DRAFTS_KEY,
  LEGACY_DRAFT_KEY,
  LEGACY_PLACE_KEY,
  listDrafts,
  migrateLegacyDraft,
  removeDraft,
  upsertDraft,
  isDraftEmpty,
  announceDraftsChanged,
  type DraftRecord,
} from '@/lib/builder/drafts';
import { useChainFunding } from '@/lib/wallet/use-chain-funding';
import { NATIVE_SYMBOL } from '@/lib/network/presentation';

/** Per-browser, so the dismiss survives a reload. */
const CAMPAIGN_NOTICE_KEY = 'pokter:builder:campaign-notice';
const CAMPAIGN_NOTICE_EVENT = 'pokter:builder:campaign-notice-changed';

function campaignNoticeDismissed() {
  try {
    return window.localStorage.getItem(CAMPAIGN_NOTICE_KEY) === 'dismissed';
  } catch {
    /* Private mode or blocked storage: the notice simply stays. */
    return false;
  }
}

function subscribeToCampaignNotice(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(CAMPAIGN_NOTICE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(CAMPAIGN_NOTICE_EVENT, listener);
  };
}

function dismissCampaignNotice() {
  try {
    window.localStorage.setItem(CAMPAIGN_NOTICE_KEY, 'dismissed');
  } catch {
    /* Nothing to persist to; the notice stays, as it always did. */
  }
  window.dispatchEvent(new Event(CAMPAIGN_NOTICE_EVENT));
}
import {
  registerIdentityFromWallet,
  type RegistrationProgress,
  type RegistrationRecovery,
  type RegistryChainId,
} from '@/lib/registry/register';

type Mode = 'choose' | 'existing' | 'new' | 'templates';
type BuilderReport = DiagnosticReport & { enrolled?: boolean; lifecycle?: BuilderLifecycle };
type EndpointPreflight = {
  endpoint: string;
  protocol: Draft['protocol'];
  ok: boolean;
  latencyMs: number | null;
  status: number | null;
  detail: string;
  capabilities: string[];
  quoteCapability: boolean;
  safety: {
    httpsRequired: boolean;
    credentialsRejected: boolean;
    dnsPinned: boolean;
    privateNetworksRejected: boolean;
    redirectsBlocked: boolean;
    timeoutMs: number;
    responseLimitBytes: number;
  };
};
type BuilderTrial = {
  ok: boolean;
  protocol: Draft['protocol'];
  capability: string;
  latencyMs: number;
  observedAt: string;
  summary: string;
  response: unknown;
  disclaimer: string;
};

type Draft = {
  name: string;
  description: string;
  category: string;
  protocol: 'a2a' | 'mcp';
  endpoint: string;
  image: string;
  /** Public source repository. Published on chain, never probed. */
  repository: string;
};

const EMPTY_DRAFT: Draft = {
  name: '',
  description: '',
  category: '',
  protocol: 'a2a',
  endpoint: '',
  image: '',
  repository: '',
};

const QUALITY_EXAMPLE: Draft = {
  name: 'Treasury Sentinel',
  description: 'Monitors a BNB Chain treasury, compares risk-adjusted stablecoin yields, and returns a read-only allocation plan with source data, assumptions, and explicit loss limits.',
  category: 'yield',
  protocol: 'a2a',
  endpoint: '',
  image: '',
  repository: '',
};

const STARTER_KITS: Array<{
  id: string;
  eyebrow: string;
  description: string;
  draft: Draft;
}> = [
  {
    id: 'portfolio-monitor',
    eyebrow: 'Portfolio monitor',
    description: 'Turn wallet positions into a sourced exposure and concentration report.',
    draft: {
      name: 'Portfolio Watch',
      description: 'Reviews a BNB Chain wallet, identifies asset concentration and protocol exposure, and returns a read-only portfolio report with sources, assumptions, and clearly stated data gaps.',
      category: 'rebalancing', protocol: 'a2a', endpoint: '', image: '',
  repository: '',
    },
  },
  {
    id: 'health-factor-monitor',
    eyebrow: 'Health-factor monitor',
    description: 'Explain lending risk and identify positions approaching liquidation.',
    draft: {
      name: 'Position Guardian',
      description: 'Checks supported BNB Chain lending positions, explains health-factor changes, and returns a read-only risk report without moving funds or promising liquidation protection.',
      category: 'health-factor', protocol: 'a2a', endpoint: '', image: '',
  repository: '',
    },
  },
  {
    id: 'yield-researcher',
    eyebrow: 'Yield researcher',
    description: 'Compare opportunities without presenting advertised APY as guaranteed return.',
    draft: QUALITY_EXAMPLE,
  },
  {
    id: 'rebalancing-adviser',
    eyebrow: 'Rebalancing adviser',
    description: 'Produce an allocation plan that remains advisory and user-approved.',
    draft: {
      name: 'Allocation Guide',
      description: 'Compares a portfolio with user-defined allocation targets and returns a read-only rebalancing plan with proposed amounts, market assumptions, and explicit execution risks.',
      category: 'rebalancing', protocol: 'a2a', endpoint: '', image: '',
  repository: '',
    },
  },
  {
    id: 'treasury-reporter',
    eyebrow: 'Treasury reporter',
    description: 'Summarise balances, movements and risk for teams and communities.',
    draft: {
      name: 'Treasury Reporter',
      description: 'Produces a sourced BNB Chain treasury summary covering balances, recent movements, protocol exposure, and material changes while clearly separating observations from recommendations.',
      category: 'rebalancing', protocol: 'mcp', endpoint: '', image: '',
  repository: '',
    },
  },
];

const RUNTIME_OPTIONS: Record<string, { target: string[]; policy: string[]; output: string[] }> = {
  'health-factor': { target: ['Venus', 'Lista'], policy: ['Conservative', 'Balanced', 'Custom thresholds'], output: ['Risk report', 'Stress analysis', 'Action plan'] },
  yield: { target: ['Stablecoins', 'BNB liquid staking', 'All supported assets'], policy: ['Capital preservation', 'Balanced', 'Opportunity seeking'], output: ['Opportunity comparison', 'Allocation research', 'Risk report'] },
  rebalancing: { target: ['Wallet portfolio', 'Treasury', 'Liquidity positions'], policy: ['Drift threshold', 'Scheduled review', 'Custom mandate'], output: ['Rebalancing plan', 'Exposure report', 'Proposed trade list'] },
  'grid-trading': { target: ['BNB / USDT', 'BTCB / USDT', 'Custom pair'], policy: ['Wide conservative grid', 'Balanced grid', 'Custom constraints'], output: ['Grid parameters', 'Scenario analysis', 'Risk-bounded plan'] },
};

/**
 * The conservative choice for a category, which is the first in each list.
 *
 * These three selects opened empty on a step where the template had already
 * filled in the name, the description and the outcome — so the one place a
 * beginner had nothing to react to was the one asking about operating policy.
 * Defaults give them something to change rather than something to invent, and
 * the panel says they are starting points.
 */
function defaultRuntimeConfig(category: string) {
  const options = RUNTIME_OPTIONS[category];
  if (!options) return { target: '', policy: '', output: '' };
  return {
    target: options.target[0] ?? '',
    policy: options.policy[0] ?? '',
    output: options.output[0] ?? '',
  };
}

/*
 * Where the builder had got to, kept beside what they had written.
 *
 * The draft itself has always survived a reload; the position in the wizard
 * did not. So someone who had filled in three steps came back to their words
 * intact and the path chooser on screen, and had to click through the
 * branches again to find where they were — which reads as the work having
 * been lost even though none of it was.
 */
const REGISTRATION_RECOVERY_KEY = 'pokter-agent-registration-recovery-v1';

function Icon({ name }: { name: 'registry' | 'spark' | 'check' | 'arrow' | 'wallet' | 'code' | 'idea' }) {
  const className = 'size-5 fill-none stroke-current';
  if (name === 'registry') return <svg viewBox="0 0 24 24" aria-hidden className={className} strokeWidth="1.8"><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/><path d="m4 7 8 4 8-4M12 11v10"/></svg>;
  if (name === 'spark') return <svg viewBox="0 0 24 24" aria-hidden className={className} strokeWidth="1.8"><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></svg>;
  if (name === 'check') return <svg viewBox="0 0 24 24" aria-hidden className={className} strokeWidth="2"><path d="m5 12 4 4L19 6"/></svg>;
  if (name === 'wallet') return <svg viewBox="0 0 24 24" aria-hidden className={className} strokeWidth="1.8"><path d="M4 6.5h14a2 2 0 0 1 2 2v9H6a2 2 0 0 1-2-2v-9Z"/><path d="M4 7V5a2 2 0 0 1 2-2h11M16 12h4"/></svg>;
  if (name === 'code') return <svg viewBox="0 0 24 24" aria-hidden className={className} strokeWidth="1.8"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></svg>;
  if (name === 'idea') return <svg viewBox="0 0 24 24" aria-hidden className={className} strokeWidth="1.8"><path d="M9 18h6M10 21h4M8.5 15.5A7 7 0 1 1 15.5 15.5C14.5 16.2 14 17 14 18h-4c0-1-.5-1.8-1.5-2.5Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden className={className} strokeWidth="1.8"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
}

function Address({ value }: { value: string | null }) {
  if (!value) return <span>Not published</span>;
  return <span className="mono">{value.slice(0, 6)}…{value.slice(-4)}</span>;
}

function StatusMark({ status }: { status: DiagnosticCheck['status'] }) {
  return (
    <span className={cn(
      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
      status === 'pass' && 'bg-[color:var(--positive-dim)] text-[color:var(--positive)]',
      status === 'fail' && 'bg-[color:var(--caution-dim)] text-[color:var(--caution)]',
      status === 'unknown' && 'bg-[color:var(--bg-subtle)] text-[color:var(--text-muted)]',
    )}>
      {status === 'pass' ? '✓' : status === 'fail' ? '!' : '–'}
    </span>
  );
}

function LifecycleStates({
  lifecycle,
  draft = false,
}: {
  lifecycle?: BuilderLifecycle;
  draft?: boolean;
}) {
  const states = draft
    ? [{ id: 'draft', label: 'Private draft', done: true, detail: 'Saved on this device', action: 'Complete the profile and runtime checks.' }, ...builderReadinessSteps(lifecycle)]
    : builderReadinessSteps(lifecycle);
  const next = states.findIndex((state) => !state.done);
  const nextAction = nextBuilderAction(lifecycle);
  const progress = states.filter((state) => state.done).length;

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
      <div className="flex flex-col justify-between gap-4 border-b border-[color:var(--border)] p-4 sm:flex-row sm:items-end sm:p-5">
        <div className="max-w-2xl">
          <p className="mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--brand-strong)]">Agent readiness</p>
          <p className="mt-1 text-[12px] font-semibold">{progress} of {states.length} product checks complete</p>
          {/*
            Says which way this list runs.

            It reads 1 of 6 for every draft, because an identity, a signed
            price and an independent measurement only exist once the agent
            is published and probed. Shown beside a disabled publish button
            it looked like the thing blocking publication, which made the
            flow appear to be a loop with no way out.
          */}
          <p className="mt-1 text-[12px] leading-5 text-[color:var(--text-muted)]">Most of these complete after publishing: Pokter observes them once the agent is registered and reachable. They are not conditions for publishing. Each state comes from an observed registry, endpoint or evidence check, and none of it claims BNB campaign qualification.</p>
        </div>
        <div className="flex items-center gap-2">
          {lifecycle?.enrolled && <span className="w-fit rounded-full border border-[color:var(--info)]/25 bg-[color:var(--info-dim)] px-2 py-1 text-[12px] font-medium text-[color:var(--info)]">Measurement roster</span>}
          <span className="mono text-[12px] text-[color:var(--text-muted)]">{Math.round((progress / states.length) * 100)}%</span>
        </div>
      </div>
      <div className="h-1 bg-[color:var(--bg-subtle)]"><div className="h-full bg-[color:var(--brand)] transition-[width] duration-300" style={{ width: `${(progress / states.length) * 100}%` }} /></div>
      <ol className="grid gap-px bg-[color:var(--border)] sm:grid-cols-5">{states.map((state, index) => <li key={state.id} className={cn('min-w-0 bg-[color:var(--surface)] p-4', index === next && 'bg-[color:var(--brand-highlight-soft)]')}><div className="flex items-center gap-2"><span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold', state.done ? 'border-[color:var(--positive)] bg-[color:var(--positive-dim)] text-[color:var(--positive)]' : index === next ? 'border-[color:var(--brand)] bg-[color:var(--surface)] text-[color:var(--brand-strong)]' : 'border-[color:var(--border-strong)] text-[color:var(--text-muted)]')}>{state.done ? '✓' : index + 1}</span><span className="truncate text-[12px] font-semibold">{state.label}</span></div><p className="mt-3 text-[12px] leading-4 text-[color:var(--text-muted)]">{state.detail}</p></li>)}</ol>
      {nextAction && !draft && <div className="flex flex-col justify-between gap-2 bg-[color:var(--bg-subtle)] px-4 py-3 sm:flex-row sm:items-center sm:px-5"><div><p className="text-[12px] font-semibold text-[color:var(--brand-strong)]">Next action · {nextAction.label}</p><p className="mt-0.5 text-[12px] leading-4 text-[color:var(--text-secondary)]">{nextAction.action}</p></div><Link href="/set-and-earn" className="shrink-0 text-[12px] font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--brand-strong)]">Campaign requirements ↗</Link></div>}
    </div>
  );
}

function ConnectionGuide() {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-6" aria-labelledby="connection-guide-title">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div>
          <p className="mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--brand-strong)]">The simple version</p>
          <h3 id="connection-guide-title" className="mt-2 text-lg font-semibold">Your agent only needs a public HTTPS door.</h3>
          <p className="mt-2 max-w-2xl text-[12px] leading-5 text-[color:var(--text-secondary)]">Keep your model, framework and hosting. Pokter does not need your source code or API key. It needs one standards-based endpoint it can safely discover, test and send jobs to.</p>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ['1', 'Choose how it is called', 'A2A for complete jobs and deliverables; MCP for individual callable tools.'],
              ['2', 'Expose it over HTTPS', 'Publish an A2A Agent Card or an MCP JSON-RPC endpoint on infrastructure you control.'],
              ['3', 'Paste and test', 'Pokter runs a safe handshake and shows exactly what passed or needs attention.'],
              ['4', 'Review and publish', 'Approve the registry transaction only after the buyer-facing profile looks right.'],
            ].map(([number, title, body]) => <li key={number} className="flex gap-3 rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-highlight-soft)] text-[12px] font-semibold text-[color:var(--brand-strong)]">{number}</span><div><p className="text-[11px] font-semibold">{title}</p><p className="mt-1 text-[12px] leading-4 text-[color:var(--text-muted)]">{body}</p></div></li>)}
          </ol>
        </div>
        <div className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4">
          <p className="text-[12px] font-semibold">What you should have ready</p>
          <ul className="mt-3 flex flex-col gap-2 text-[12px] text-[color:var(--text-secondary)]">
            {['A working agent or callable tool', 'A public HTTPS endpoint', 'A wallet for the ERC-8004 identity', 'A clear output, evidence and limitations'].map((item) => <li key={item} className="flex items-center gap-2"><span className="text-[color:var(--positive)]">✓</span>{item}</li>)}
          </ul>
          <details className="mt-4 border-t border-[color:var(--border)] pt-3"><summary className="cursor-pointer text-[12px] font-semibold text-[color:var(--brand-strong)]">Show the connection contract</summary><pre className="mono mt-3 overflow-x-auto rounded-[var(--radius)] bg-[color:var(--bg)] p-3 text-[12px] leading-5 text-[color:var(--text-secondary)]">{`A2A\nGET /.well-known/agent-card.json\nPOST your endpoint · JSON-RPC 2.0\n\nMCP\nPOST your endpoint · initialize\nPOST your endpoint · tools/list`}</pre></details>
        </div>
      </div>
    </section>
  );
}

export function BuilderStudio({ initialIdentity }: { initialIdentity?: { chainId: '56' | '97'; tokenId: string } }) {
  /*
   * Arrivals land on the chooser, with their drafts listed above it.
   *
   * This used to restore the exact step somebody left on, which was right
   * while a browser held one draft and wrong the moment it could hold
   * several: reopening one of them silently is a guess about which, and
   * the guess is unnecessary now that they are all on screen with a
   * Continue beside each.
   */
  const [mode, setMode] = useState<Mode>(initialIdentity ? 'existing' : 'choose');
  const [newStep, setNewStep] = useState(0);
  /*
   * The dismiss button only ever set state, so the notice came back on every
   * reload and the × was decorative. It now remembers, per browser.
   *
   * Read through useSyncExternalStore, the way this codebase already reads
   * the campaign registration flag: the server snapshot is "not dismissed",
   * so the markup hydrates open and corrects itself without a setState in an
   * effect, and a dismissal in one tab closes it in the others.
   */
  const campaignNoticeOpen = !useSyncExternalStore(
    subscribeToCampaignNotice,
    campaignNoticeDismissed,
    () => false,
  );
  const [tokenId, setTokenId] = useState(initialIdentity?.tokenId ?? '');
  const [chainId, setChainId] = useState(initialIdentity?.chainId ?? '56');
  const [report, setReport] = useState<BuilderReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [verificationStep, setVerificationStep] = useState<'idle' | 'registry' | 'signature' | 'verifying'>('idle');
  /*
   * Every draft this browser holds, and which one is open.
   *
   * There used to be one slot, written on every keystroke and never
   * mentioned: a second agent silently overwrote the first, and somebody
   * returning was shown the first-time chooser with their work restored
   * underneath it. The id is what makes more than one possible; the
   * legacy slot is folded in once so nobody mid-build loses theirs.
   */
  const [drafts, setDrafts] = useState<DraftRecord>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem(DRAFTS_KEY);
      const record = stored ? (JSON.parse(stored) as DraftRecord) : {};
      const legacyDraft = localStorage.getItem(LEGACY_DRAFT_KEY);
      if (!legacyDraft) return record;
      const legacyPlace = localStorage.getItem(LEGACY_PLACE_KEY);
      const migrated = migrateLegacyDraft(
        record,
        {
          draft: { ...EMPTY_DRAFT, ...JSON.parse(legacyDraft) },
          ...(legacyPlace ? JSON.parse(legacyPlace) : {}),
        },
        new Date().toISOString(),
        `draft-${Date.now()}`,
      );
      /*
       * Written before the old keys are dropped, and in that order.
       *
       * Migrating in state alone lost the draft outright: the record was
       * only persisted when the open draft changed, the open draft starts
       * empty, and the cleanup that removed the legacy keys ran anyway —
       * so a reload found nothing in either place. Nothing is deleted
       * until its replacement is on disk.
       */
      if (migrated !== record) {
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(migrated));
        localStorage.removeItem(LEGACY_DRAFT_KEY);
        localStorage.removeItem(LEGACY_PLACE_KEY);
      }
      return migrated;
    } catch {
      // A draft is a convenience. Storage being unavailable must not block the flow.
      return {};
    }
  });
  const [draftId, setDraftId] = useState<string>(() => `draft-${Date.now()}`);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [reviewing, setReviewing] = useState(false);
  const [endpointReport, setEndpointReport] = useState<EndpointPreflight | null>(null);
  const [endpointBusy, setEndpointBusy] = useState(false);
  const [endpointError, setEndpointError] = useState<string | null>(null);
  const [trialTask, setTrialTask] = useState('Return a read-only example result with sources, assumptions and explicit limitations.');
  const [trialResult, setTrialResult] = useState<BuilderTrial | null>(null);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [trialBusy, setTrialBusy] = useState(false);
  const [registrationProgress, setRegistrationProgress] = useState<RegistrationProgress | null>(null);
  const [registrationRecovery, setRegistrationRecovery] = useState<RegistrationRecovery | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(REGISTRATION_RECOVERY_KEY);
      return stored ? JSON.parse(stored) as RegistrationRecovery : null;
    } catch { return null; }
  });
  const { wallet: passkeyWallet } = usePasskeyWallet();
  const passkeySigner = usePasskeySigner();
  /*
   * Default to the chain the signer can actually sign for.
   *
   * The select opened on mainnet for everyone. A passkey cannot sign there,
   * so a passkey holder was shown a network they could not use, asked to
   * accept a mainnet gas disclosure for a transaction that would never be
   * sent, and only then refused. Recovery still wins: a half-finished mint
   * belongs to the chain it started on.
   *
   * Keyed on the passkey existing, not on which wallet will sign. Deciding
   * that needs wagmi's connection state, which is not settled on the render
   * this initialiser runs in, and biasing a holder of both toward the chain
   * both can use is the harmless way to be wrong.
   */
  const [registrationChainId, setRegistrationChainId] = useState<RegistryChainId>(
    registrationRecovery?.chainId ?? 97,
  );
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [mainnetConsent, setMainnetConsent] = useState(false);
  const [publishedAgent, setPublishedAgent] = useState<{ chainId: RegistryChainId; tokenId: string } | null>(null);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  /*
   * Connected, not merely installed.
   *
   * This asked whether an injected provider existed, which it does on any
   * machine with a wallet extension — so a passkey holder who had never
   * connected that extension was still routed to it, and the path this
   * exists to offer could not be reached. A connected browser wallet is
   * still preferred, because it is the one that can also publish on
   * mainnet; an unconnected one is not a wallet, it is an installation.
   */
  const externalConnected = useAccount().isConnected;
  const signingAddress = passkeyWallet?.address ?? connected ?? null;
  const identityFunding = useChainFunding(signingAddress as `0x${string}` | null);
  const passkeyCanPublish = Boolean(
    passkeyWallet && passkeySigner && !externalConnected,
  );
  /* Read back what has been written, for the one view that lists it. */
  function refreshDrafts() {
    try {
      const stored = localStorage.getItem(DRAFTS_KEY);
      setDrafts(stored ? (JSON.parse(stored) as DraftRecord) : {});
    } catch {
      setDrafts({});
    }
  }

  function resumeDraft(id: string) {
    const entry = drafts[id];
    if (!entry) return;
    setDraftId(entry.id);
    setDraft({ ...EMPTY_DRAFT, ...entry.draft });
    setMode(entry.mode === 'choose' ? 'new' : entry.mode);
    setNewStep(entry.step);
    setEndpointReport(null);
    setReviewing(false);
  }

  function discardDraft(id: string) {
    const next = removeDraft(drafts, id);
    setDrafts(next);
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
      announceDraftsChanged();
    } catch {}
    /* Discarding the open one leaves the builder on a blank slate, not on
       a form still showing work that no longer exists anywhere. */
    if (id === draftId) {
      setDraft(EMPTY_DRAFT);
      setDraftId(`draft-${Date.now()}`);
      setNewStep(0);
      setMode('choose');
    }
  }

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewViewport, setPreviewViewport] = useState<'mobile' | 'desktop'>('desktop');
  const [brief, setBrief] = useState<LaunchBrief>(EMPTY_BRIEF);
  const [briefApplied, setBriefApplied] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState({ category: '', target: '', policy: '', output: '' });
  const [aiPromptContext, setAiPromptContext] = useState<'discovery' | 'draft' | null>(null);
  const [aiPromptCopied, setAiPromptCopied] = useState(false);

  /*
   * One write covers the draft and the place in it, because they are the
   * same fact: where this particular agent got to. An untouched draft is
   * not recorded at all — a list of blank entries somebody opened and
   * left is noise, not work in progress.
   *
   * Storage is written from here, state is not: an effect that assigns
   * state on every keystroke is the pattern the linter rejects, and the
   * list only has to be accurate at the moment it is shown.
   */
  useEffect(() => {
    if (isDraftEmpty(draft)) return;
    try {
      const stored = localStorage.getItem(DRAFTS_KEY);
      const record = stored ? (JSON.parse(stored) as DraftRecord) : {};
      localStorage.setItem(
        DRAFTS_KEY,
        JSON.stringify(
          upsertDraft(record, {
            id: draftId,
            draft,
            mode: mode === 'choose' ? 'new' : mode,
            step: newStep,
            updatedAt: new Date().toISOString(),
          }),
        ),
      );
      announceDraftsChanged();
    } catch {}
  }, [draft, draftId, mode, newStep]);



  const quality = useMemo(
    () => (report ? summarizeQuality(report.checks) : null),
    [report],
  );
  const ownsAgent = useMemo(() => {
    if (!connected || !report?.owner) return null;
    try { return getAddress(connected) === getAddress(report.owner); } catch { return false; }
  }, [connected, report]);

  const avatarSeeds = useMemo(() => {
    const base = `${draft.category || 'agent'}-${draft.name || 'pokter'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return Array.from({ length: 6 }, (_, index) => `${base}-${index + 1}`);
  }, [draft.category, draft.name]);
  /*
   * One of these is in use whether or not anybody picked it.
   *
   * The image was the only draft check a builder could fail by doing
   * nothing, and it blocked publishing with six avatars on screen that
   * looked like decoration. The first is now the standing choice, derived
   * rather than written into the draft: writing it would mean a keystroke
   * in the name field silently changing a field the builder had chosen,
   * and an effect that sets state on render is what the linter rejects.
   */
  const defaultAvatar = `https://pokter.xyz${avatarUrl(avatarSeeds[0])}`;
  const chosenImage = draft.image.trim() || defaultAvatar;
  const draftChecks = [
    { label: 'Clear name', done: draft.name.trim().length >= 3 && draft.name.trim().length <= 80 },
    { label: 'Outcome-led description', done: draft.description.trim().length >= 40 && draft.description.trim().length <= 600 },
    { label: 'Marketplace category', done: CATEGORIES.some((category) => category.id === draft.category) },
    {
      label: 'Compatible service endpoint',
      done: Boolean(
        endpointReport?.ok &&
        endpointReport.endpoint === draft.endpoint.trim() &&
        endpointReport.protocol === draft.protocol,
      ),
    },
    { label: 'Public agent image', done: /^https:\/\//i.test(chosenImage) && chosenImage.length <= 2_048 },
  ];
  const draftScore = draftChecks.filter((check) => check.done).length;
  const missingDraftChecks = draftChecks
    .filter((check) => !check.done)
    .map((check) => check.label);
  const runtimeOptions = RUNTIME_OPTIONS[draft.category];

  /*
   * The selects' actual values: what the builder picked, falling back to the
   * conservative default for the outcome.
   *
   * Derived rather than seeded into state by an effect. Writing defaults from
   * an effect meant a render that set state and re-rendered immediately, and
   * choices made under a previous outcome had to be cleared by a second
   * writer. Stamping the category onto the stored choices makes a stale set
   * recognisable here, so changing the outcome re-seeds with no extra pass.
   */
  const runtime = useMemo(() => {
    const fallback = defaultRuntimeConfig(draft.category);
    if (runtimeConfig.category !== draft.category) return fallback;
    return {
      target: runtimeConfig.target || fallback.target,
      policy: runtimeConfig.policy || fallback.policy,
      output: runtimeConfig.output || fallback.output,
    };
  }, [draft.category, runtimeConfig]);

  const chooseRuntime = (key: 'target' | 'policy' | 'output', value: string) =>
    setRuntimeConfig({ ...runtime, category: draft.category, [key]: value });
  const aiPromptInput = useMemo(() => ({
    name: draft.name.trim(),
    description: draft.description.trim(),
    category: CATEGORIES.find((category) => category.id === draft.category)?.label ?? draft.category,
    protocol: draft.protocol,
    target: runtime.target,
    policy: runtime.policy,
    output: runtime.output,
  }), [draft, runtime]);
  const visibleAiPrompt = useMemo(() => createAgentBuildPrompt(aiPromptContext === 'draft' ? aiPromptInput : {
    name: '', description: '', category: '', protocol: 'a2a', target: '', policy: '', output: '',
  }), [aiPromptContext, aiPromptInput]);
  /*
   * Only the problems worth stopping on. An empty field is not an error
   * while the builder is still filling the form, and Pokter does not
   * police which host a repository lives on — the campaign asks for it to
   * be public, not for it to be GitHub.
   */
  const repositoryProblem = (() => {
    const value = draft.repository.trim();
    if (!value) return null;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return 'That is not a complete URL. Include https://.';
    }
    if (url.protocol !== 'https:') return 'Use an https:// address.';
    if (/^localhost$|^127\.|^0\.0\.0\.0$|\.local$/i.test(url.hostname)) {
      return 'That address only resolves on your machine. Nobody else could open it.';
    }
    return null;
  })();

  const trialCapability = selectTrialCapability(endpointReport?.capabilities ?? []);
  const registrationPreview = useMemo(() => ({
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: draft.name.trim(),
    description: draft.description.trim(),
    image: chosenImage,
    /*
     * The repository rides along as a named service.
     *
     * The ERC-8004 registration schema is fixed — name, description, image,
     * services, registrations — and has no field for source. The campaign
     * requires the repository to be public, and a claim that lives only in
     * Pokter's database is a claim nobody else can check, which is the
     * opposite of the point.
     *
     * `services` is the one open-ended part of the file, and `probeTarget`
     * reads only the `a2a` and `mcp` entries by name, so an extra entry is
     * published, readable by any ERC-8004 consumer, and never called.
     */
    services: [
      {
        name: draft.protocol.toUpperCase(),
        endpoint: draft.endpoint.trim(),
      },
      ...(draft.repository.trim()
        ? [{ name: 'repository', endpoint: draft.repository.trim() }]
        : []),
    ],
    registrations: [],
    tags: draft.category ? [draft.category] : [],
    categories: draft.category ? [draft.category] : [],
    x402Support: false,
    active: true,
    supportedTrust: ['reputation'],
  }) as Erc8004RegistrationFile, [draft, chosenImage]);

  const registrationStep = registrationProgress?.step;
  const registrationLabel = registrationStep === 'connecting' ? 'Connecting wallet…'
    : registrationStep === 'switching-network' ? 'Checking network…'
    : registrationStep === 'registering' ? 'Approve identity registration…'
    : registrationStep === 'confirming-registration' ? 'Confirming identity…'
    : registrationStep === 'publishing-profile' ? 'Approve profile publication…'
    : registrationStep === 'verifying' ? 'Verifying onchain record…'
    : registrationStep === 'done' ? 'Agent published'
    : registrationRecovery?.agentId ? 'Resume profile publication'
    : registrationRecovery?.registrationHash ? 'Recover registration'
    : 'Publish ERC-8004 identity';

  async function runDiagnostic(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null); setReport(null); setConnected(null); setVerifiedAt(null);
    try {
      const response = await fetch('/api/compatibility', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId: Number(chainId), tokenId: tokenId.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The check could not be completed.');
      setReport(payload as BuilderReport);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The check could not be completed.');
    } finally { setBusy(false); }
  }

  async function verifyOwner() {
    setError(null); setVerifiedAt(null); setVerificationStep('registry');
    try {
      /*
       * Which wallet is in use, said accurately.
       *
       * This told everybody without an extension to install one, including
       * somebody holding a passkey — the wallet Pokter offers so they need
       * not. Verification here is a personal_sign and a secp256k1 recovery,
       * and a passkey signs P256: the SDK's own signer throws rather than
       * produce one. So the passkey case is not an installation problem and
       * must not be described as one.
       */
      if (!hasIdentityWallet()) {
        throw new Error(
          passkeyWallet
            ? 'Proving ownership needs a signature a passkey cannot produce, so this step needs the browser wallet that owns the identity. Publishing and hiring still work from your passkey.'
            : 'Connect the browser wallet that owns this identity to verify it.',
        );
      }
      if (!report) throw new Error('Find the ERC-8004 identity first.');
      const address = await connectIdentityWallet();
      setConnected(address);
      if (!report.owner || getAddress(address) !== getAddress(report.owner)) {
        throw new Error(
          passkeyWallet && report.owner && getAddress(report.owner) === getAddress(passkeyWallet.address)
            ? 'This identity is owned by your passkey wallet, and ownership is proved with a signature a passkey cannot produce. Nothing is wrong with the identity; this step cannot read it yet.'
            : 'The connected wallet is not the current ERC-8004 owner.',
        );
      }
      const challengeResponse = await fetch('/api/builders/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'challenge', chainId: report.chainId, tokenId: report.tokenId }),
      });
      const challengePayload = await challengeResponse.json() as { challenge?: { id: string; message: string }; error?: string };
      if (!challengeResponse.ok || !challengePayload.challenge) throw new Error(challengePayload.error ?? 'Could not prepare ownership verification.');
      setVerificationStep('signature');
      const signature = await signIdentityMessage(address, challengePayload.challenge.message);
      setVerificationStep('verifying');
      const verifyResponse = await fetch('/api/builders/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'verify', challengeId: challengePayload.challenge.id, signature }),
      });
      const verifyPayload = await verifyResponse.json() as { publisher?: { verifiedAt: string }; error?: string };
      if (!verifyResponse.ok || !verifyPayload.publisher) throw new Error(verifyPayload.error ?? 'Ownership verification failed.');
      setVerifiedAt(verifyPayload.publisher.verifiedAt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The wallet could not be connected.');
    } finally { setVerificationStep('idle'); }
  }

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setReviewing(false);
    if (key === 'endpoint' || key === 'protocol') {
      setEndpointReport(null);
      setEndpointError(null);
      setTrialResult(null);
      setTrialError(null);
    }
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function moveToNewStep(step: number) {
    setNewStep(Math.max(0, Math.min(3, step)));
    window.requestAnimationFrame(() => document.getElementById('builder-wizard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function updateBrief<K extends keyof LaunchBrief>(key: K, value: LaunchBrief[K]) {
    setBriefApplied(false);
    setBrief((current) => ({ ...current, [key]: value }));
  }

  function applyLaunchBrief() {
    setDraft((current) => ({ ...current, ...draftFromBrief(brief) }));
    setEndpointReport(null);
    setEndpointError(null);
    setTrialResult(null);
    setTrialError(null);
    setReviewing(false);
    setBriefApplied(true);
  }

  function applyStarterKit(starter: (typeof STARTER_KITS)[number]) {
    setDraft({ ...starter.draft });
    setEndpointReport(null);
    setEndpointError(null);
    setTrialResult(null);
    setTrialError(null);
    setReviewing(false);
    setNewStep(1);
    setMode('new');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function downloadRegistrationFile() {
    const file = new Blob([`${JSON.stringify(registrationPreview, null, 2)}\n`], { type: 'application/json' });
    const href = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent'}-registration.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  function downloadRuntimeConfig() {
    const payload = {
      schema: 'https://pokter.xyz/schemas/starter-config-v1',
      agent: draft.name.trim(),
      category: draft.category,
      protocol: draft.protocol,
      behavior: runtime,
      note: 'Your runtime must implement and enforce these choices. Pokter verifies the public endpoint independently.',
    };
    const file = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
    const href = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent'}-runtime-config.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  async function copyAgentBuildPrompt() {
    try {
      await navigator.clipboard.writeText(visibleAiPrompt);
      setAiPromptCopied(true);
      window.setTimeout(() => setAiPromptCopied(false), 2_500);
    } catch {
      setEndpointError('The prompt could not be copied. Allow clipboard access and try again.');
    }
  }

  async function testDraftEndpoint() {
    setEndpointBusy(true);
    setEndpointError(null);
    setEndpointReport(null);
    try {
      const response = await fetch('/api/builders/preflight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: draft.endpoint.trim(),
          protocol: draft.protocol,
        }),
      });
      const payload = await response.json() as EndpointPreflight & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The endpoint check could not be completed.');
      setEndpointReport(payload);
    } catch (reason) {
      setEndpointError(reason instanceof Error ? reason.message : 'The endpoint check could not be completed.');
    } finally {
      setEndpointBusy(false);
    }
  }

  async function runDraftTrial() {
    if (!endpointReport?.ok) return;
    setTrialBusy(true);
    setTrialResult(null);
    setTrialError(null);
    try {
      const response = await fetch('/api/builders/trial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: draft.endpoint.trim(),
          protocol: draft.protocol,
          task: trialTask.trim(),
        }),
      });
      const payload = await response.json() as BuilderTrial & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.summary ?? 'The preview request failed.');
      setTrialResult(payload);
    } catch (reason) {
      setTrialError(reason instanceof Error ? reason.message : 'The preview request failed.');
    } finally {
      setTrialBusy(false);
    }
  }

  function persistRecovery(progress: RegistrationProgress) {
    const recovery: RegistrationRecovery = {
      chainId: progress.chainId,
      registrationHash: progress.registrationHash,
      agentId: progress.agentId,
    };
    if (!recovery.registrationHash && !recovery.agentId) return;
    setRegistrationRecovery(recovery);
    try { localStorage.setItem(REGISTRATION_RECOVERY_KEY, JSON.stringify(recovery)); } catch {}
  }

  async function publishIdentity() {
    if (draftScore < 5 || !reviewing) return;
    if (registrationChainId === 56 && !mainnetConsent) {
      setRegistrationError('Confirm the BNB Chain identity transaction and gas disclosure before publishing.');
      return;
    }
    setRegistrationBusy(true);
    setRegistrationError(null);
    setPublishedAgent(null);
    try {
      const compatibleRecovery = registrationRecovery?.chainId === registrationChainId
        ? registrationRecovery
        : undefined;
      const result = await registerIdentityFromWallet({
        chainId: registrationChainId,
        file: registrationPreview,
        recovery: compatibleRecovery,
        signer:
          passkeyCanPublish && passkeyWallet && passkeySigner
            ? passkeyRegistrySigner({
                wallet: { address: passkeyWallet.address },
                signer: passkeySigner,
                chainId: registrationChainId,
              })
            : undefined,
        onProgress: (progress) => {
          setRegistrationProgress(progress);
          persistRecovery(progress);
        },
      });
      const published = { chainId: registrationChainId, tokenId: result.agentId.toString() };
      setPublishedAgent(published);
      setTokenId(published.tokenId);
      setChainId(String(published.chainId) as '56' | '97');
      setRegistrationRecovery(null);
      try { localStorage.removeItem(REGISTRATION_RECOVERY_KEY); } catch {}
    } catch (reason) {
      setRegistrationError(reason instanceof Error ? reason.message : 'The identity could not be published.');
    } finally {
      setRegistrationBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16 pt-6 sm:gap-10 sm:pt-10">
      <header className="grid items-end gap-6 border-b border-[color:var(--border)] pb-7 lg:grid-cols-[1fr_auto]">
        <div className="max-w-2xl">
          <p className="mono mb-3 text-[10px] uppercase tracking-[0.18em] text-[color:var(--brand-strong)]">Agent launchpad</p>
          <h1 className="font-[family-name:var(--font-serif)] text-4xl leading-[1.02] tracking-tight sm:text-5xl">Launch a quality agent on BNB Chain.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[color:var(--text-secondary)]">Start from where you are, verify what buyers will see, and build a measurable track record. Registration never counts as proof that an agent works.</p>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-[11px] text-[color:var(--text-muted)]">
          <span className="size-2 rounded-full bg-[color:var(--positive)]" />
          {mode === 'new' ? 'You approve every registry write' : 'Registry checks are read-only'}
        </div>
      </header>

      {campaignNoticeOpen && <aside className="relative rounded-[var(--radius)] border border-[color:var(--brand)]/30 bg-[color:var(--brand-highlight-soft)] px-4 py-3 pr-12" aria-label="Set and Earn notification"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><p className="text-[11px] font-semibold">🔥 Building for Set and Earn?</p><p className="mt-0.5 text-[12px] leading-4 text-[color:var(--text-secondary)]">Register first, then list a reachable agent and build independently verifiable usage.</p></div><Link href="/set-and-earn" className="shrink-0 text-[12px] font-semibold text-[color:var(--brand-strong)] hover:underline">View requirements →</Link></div><button type="button" onClick={dismissCampaignNotice} aria-label="Dismiss Set and Earn notification" className="absolute right-3 top-3 grid size-7 place-items-center rounded-full text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--text)]">×</button></aside>}

      {mode === 'choose' && (
        <DraftList
          drafts={listDrafts(drafts)}
          onResume={resumeDraft}
          onDelete={discardDraft}
        />
      )}

      {mode === 'choose' && (
        <section aria-labelledby="path-title" className="flex flex-col gap-5">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Start here</p>
            <h2 id="path-title" className="mt-2 text-xl font-semibold">What do you have right now?</h2>
            <p className="mt-2 text-[12px] leading-5 text-[color:var(--text-muted)]">Pick the closest answer. You can change paths without losing your draft.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <button type="button" onClick={() => setMode('existing')} className="group flex min-h-56 flex-col items-start rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-6 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--brand)] hover:shadow-[0_16px_48px_var(--brand-shadow)]">
              <span className="flex size-11 items-center justify-center rounded-full bg-[color:var(--info-dim)] text-[color:var(--info)]"><Icon name="registry" /></span>
              <span className="mt-8 text-lg font-semibold">An agent already registered onchain</span>
              <span className="mt-2 max-w-sm text-[13px] leading-5 text-[color:var(--text-secondary)]">Verify ownership, test the published endpoint and add it to Pokter’s measurement roster.</span>
              <span className="mt-auto flex items-center gap-2 pt-6 text-[12px] font-semibold text-[color:var(--brand-strong)]">Check my agent <Icon name="arrow" /></span>
            </button>
            <button type="button" onClick={() => { setNewStep(0); setMode('new'); }} className="group flex min-h-56 flex-col items-start rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-6 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--brand)] hover:shadow-[0_16px_48px_var(--brand-shadow)]">
              <span className="flex size-11 items-center justify-center rounded-full bg-[color:var(--positive-dim)] text-[color:var(--positive)]"><Icon name="code" /></span>
              <span className="mt-8 text-lg font-semibold">Working code or a running AI agent</span>
              <span className="mt-2 max-w-sm text-[13px] leading-5 text-[color:var(--text-secondary)]">Connect its HTTPS endpoint, test the protocol and prepare the public identity.</span>
              <span className="mt-auto flex items-center gap-2 pt-6 text-[12px] font-semibold text-[color:var(--brand-strong)]">Connect my agent <Icon name="arrow" /></span>
            </button>
            <button type="button" onClick={() => setMode('templates')} className="group flex min-h-56 flex-col items-start rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-6 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--brand)] hover:shadow-[0_16px_48px_var(--brand-shadow)]">
              <span className="flex size-11 items-center justify-center rounded-full bg-[color:var(--caution-dim)] text-[color:var(--caution)]"><Icon name="idea" /></span>
              <span className="mt-8 text-lg font-semibold">Only an idea so far</span>
              <span className="mt-2 max-w-sm text-[13px] leading-5 text-[color:var(--text-secondary)]">Start with a focused financial-agent structure, then configure its profile and runtime.</span>
              <span className="mt-auto flex items-center gap-2 pt-6 text-[12px] font-semibold text-[color:var(--brand-strong)]">Choose a starting point <Icon name="arrow" /></span>
            </button>
            <button type="button" onClick={() => { setAiPromptCopied(false); setAiPromptContext('discovery'); }} className="group flex min-h-56 flex-col items-start rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-6 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--brand)] hover:shadow-[0_16px_48px_var(--brand-shadow)]">
              <span className="flex size-11 items-center justify-center rounded-full bg-[#8b5cf6]/10 text-[#7c3aed] dark:bg-[#a78bfa]/15 dark:text-[#c4b5fd]"><Icon name="spark" /></span>
              <span className="mt-8 text-lg font-semibold">Build with an AI assistant</span>
              <span className="mt-2 max-w-sm text-[13px] leading-5 text-[color:var(--text-secondary)]">Use one model-neutral prompt to discover a distinct idea, choose its identity and build it safely.</span>
              <span className="mt-auto flex items-center gap-2 pt-6 text-[12px] font-semibold text-[color:var(--brand-strong)]">View build prompt <Icon name="arrow" /></span>
            </button>
          </div>
          <ConnectionGuide />
          <p className="text-[12px] leading-5 text-[color:var(--text-muted)]">Pokter discovers public ERC-8004 identities. Listing does not endorse an agent; reliability and reputation are measured separately.</p>
        </section>
      )}

      {mode === 'templates' && (
        <section aria-labelledby="starter-title" className="flex flex-col gap-5">
          <div className="max-w-2xl">
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Starter kits</p>
            <h2 id="starter-title" className="mt-2 text-2xl font-semibold">Begin with the outcome buyers need.</h2>
            <p className="mt-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">A starter prepares honest marketplace language—not a working service. You still connect and pass a real A2A or MCP endpoint check before Pokter allows publication.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STARTER_KITS.map((starter) => (
              <button key={starter.id} type="button" onClick={() => applyStarterKit(starter)} className="group flex min-h-48 flex-col rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--brand)] hover:shadow-[0_14px_40px_var(--brand-shadow)]">
                <span className="mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">{CATEGORIES.find((category) => category.id === starter.draft.category)?.label ?? 'Agent'}</span>
                <h3 className="mt-3 text-base font-semibold">{starter.eyebrow}</h3>
                <p className="mt-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">{starter.description}</p>
                <span className="mt-auto flex items-center gap-2 pt-5 text-[11px] font-semibold text-[color:var(--brand-strong)]">Use this structure <Icon name="arrow" /></span>
              </button>
            ))}
          </div>
          <div className="rounded-[var(--radius)] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--bg-subtle)] p-4 text-[12px] leading-5 text-[color:var(--text-secondary)]">Each starter intentionally leaves its endpoint and image empty. A template can help describe an agent; it cannot prove that an agent exists or works.</div>
        </section>
      )}

      {mode !== 'choose' && (
        <button type="button" onClick={() => { refreshDrafts(); setMode('choose'); setError(null); }} className="flex w-fit items-center gap-2 text-[12px] text-[color:var(--text-muted)] hover:text-[color:var(--text)]">
          <span aria-hidden>←</span> Change path
        </button>
      )}

      {mode === 'existing' && (
        <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-7">
            <div className="flex items-center gap-3"><span className="flex size-7 items-center justify-center rounded-full bg-[color:var(--brand)] text-[12px] font-bold text-[color:var(--brand-ink)]">1</span><div><h2 className="font-semibold">Find your identity</h2><p className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">No signature or transaction required</p></div></div>
            <form onSubmit={runDiagnostic} className="mt-6 grid gap-4 sm:grid-cols-[1fr_170px_auto] sm:items-end">
              <label className="flex flex-col gap-2"><span className="text-[11px] font-medium">ERC-8004 agent ID</span><input value={tokenId} onChange={(event) => setTokenId(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="265375" className="mono h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-sm outline-none focus:border-[color:var(--border-focus)]" /></label>
              <label className="flex flex-col gap-2"><span className="text-[11px] font-medium">Identity network</span><select value={chainId} onChange={(event) => setChainId(event.target.value as '56' | '97')} className="h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-[12px] outline-none focus:border-[color:var(--border-focus)]"><option value="56">BNB Chain</option><option value="97">BNB Testnet</option></select></label>
              <button disabled={busy || !tokenId} className="action-primary h-11 rounded-[var(--radius)] px-5 text-[12px] font-semibold disabled:opacity-50">{busy ? 'Checking…' : 'Check agent'}</button>
            </form>
            {busy && <div className="mt-5 flex items-center gap-3 rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-3 text-[12px] text-[color:var(--text-secondary)]"><span className="size-4 animate-spin rounded-full border-2 border-[color:var(--border-strong)] border-t-[color:var(--brand)]" />Calling the published endpoint and requesting a read-only quote…</div>}
            {error && <p role="alert" className="mt-5 rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-3 text-[12px] text-[color:var(--caution)]">{error}</p>}

            {report && quality && (
              <div className="mt-8 flex flex-col gap-6 border-t border-[color:var(--border)] pt-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div><p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Identity found</p><h3 className="mt-1 font-[family-name:var(--font-serif)] text-2xl">{report.name ?? `Agent #${report.tokenId}`}</h3><Link href={`/agents/${report.chainId}/${report.tokenId}`} className="mt-2 inline-flex text-[11px] text-[color:var(--info)] hover:underline">View public profile ↗</Link></div>
                  <div className="rounded-[var(--radius)] bg-[color:var(--bg-subtle)] px-4 py-3 text-right"><p className="text-2xl font-semibold">{quality.score}%</p><p className="text-[12px] text-[color:var(--text-muted)]">checks observed</p></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-[var(--radius)] border border-[color:var(--border)] p-3"><p className="text-[12px] text-[color:var(--text-muted)]">Identity owner</p><p className="mt-1 text-[12px]"><Address value={report.owner} /></p></div><div className="rounded-[var(--radius)] border border-[color:var(--border)] p-3"><p className="text-[12px] text-[color:var(--text-muted)]">Agent signing wallet</p><p className="mt-1 text-[12px]"><Address value={report.agentWallet} /></p></div></div>
                <LifecycleStates lifecycle={report.lifecycle} />
                <div><div className="mb-3 flex items-center justify-between"><h3 className="text-[13px] font-semibold">Marketplace readiness</h3><span className="text-[11px] text-[color:var(--text-muted)]">{quality.passed} passed · {quality.failed} need attention · {quality.unknown} unverified</span></div><ul className="grid gap-2">{report.checks.map((check) => <li key={check.id} className="flex gap-3 rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-3"><StatusMark status={check.status}/><div><p className="text-[12px] font-medium">{check.label}</p><p className="mt-1 text-[12px] leading-5 text-[color:var(--text-secondary)]">{check.detail}</p>{check.remedy && check.status !== 'pass' && <details className="mt-2 text-[11px] text-[color:var(--text-muted)]"><summary className="cursor-pointer font-medium text-[color:var(--brand-strong)]">How to improve</summary><p className="mt-1 leading-5">{check.remedy}</p></details>}</div></li>)}</ul></div>
                {verifiedAt && (
                  <AgentProfileEditor
                    chainId={report.chainId as RegistryChainId}
                    tokenId={report.tokenId}
                  />
                )}
              </div>
            )}
          </div>

          <aside className="h-fit min-w-0 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5 lg:sticky lg:top-20">
            <p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Publish checklist</p>
            <ol className="mt-5 flex flex-col gap-5">{['Find the registry identity','Verify the owner wallet','Fix quality gaps','Build an independent record'].map((label, index) => <li key={label} className="flex gap-3"><span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px]', (index === 0 && report) || (index === 1 && ownsAgent) ? 'border-[color:var(--positive)] bg-[color:var(--positive-dim)] text-[color:var(--positive)]' : 'border-[color:var(--border-strong)] text-[color:var(--text-muted)]')}>{(index === 0 && report) || (index === 1 && ownsAgent) ? '✓' : index + 1}</span><span className="pt-0.5 text-[12px]">{label}</span></li>)}</ol>
            {report && <div className="mt-6 border-t border-[color:var(--border)] pt-5"><button type="button" disabled={verificationStep !== 'idle' || Boolean(verifiedAt)} onClick={verifyOwner} className="flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-4 py-3 text-[12px] font-semibold hover:border-[color:var(--brand)] disabled:opacity-60"><Icon name={verifiedAt ? 'check' : 'wallet'} />{verifiedAt ? 'Publisher verified' : verificationStep === 'registry' ? 'Checking registry owner…' : verificationStep === 'signature' ? 'Waiting for wallet signature…' : verificationStep === 'verifying' ? 'Verifying signature…' : 'Verify ownership'}</button>{verifiedAt && <><p className="mt-3 text-[12px] leading-5 text-[color:var(--positive)]">Ownership verified with an expiring, single-use wallet challenge.</p><Link href="/builder" className="mt-3 flex w-full items-center justify-center rounded-[var(--radius)] bg-[color:var(--brand)] px-4 py-3 text-[12px] font-semibold text-[color:var(--brand-ink)]">Open builder dashboard →</Link>{connected && <Link href={`/builders/${connected}`} className="mt-2 flex w-full items-center justify-center rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 py-3 text-[11px] font-medium">View public profile</Link>}</>}{!verifiedAt && ownsAgent === true && <p className="mt-3 text-[12px] leading-5 text-[color:var(--text-secondary)]">Address matched. Sign the verification message to prove control.</p>}{ownsAgent === false && <p className="mt-3 text-[12px] leading-5 text-[color:var(--caution)]">This wallet does not own the identity. Switch accounts if you manage it.</p>}<p className="mt-3 text-[12px] leading-4 text-[color:var(--text-muted)]">The message names this identity and expires after ten minutes. It cannot move funds or authorize transactions.</p></div>}
          </aside>
        </section>
      )}

      {mode === 'new' && <nav id="builder-wizard" aria-label="Agent launch progress" className="scroll-mt-20 overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><ol className="flex min-w-max items-center">{['Define', 'Profile', 'Connect & test', 'Review & publish'].map((label, index) => <li key={label} className="flex items-center"><button type="button" onClick={() => index <= newStep && moveToNewStep(index)} disabled={index > newStep} aria-current={newStep === index ? 'step' : undefined} className={cn('flex min-h-10 items-center gap-2 rounded-[var(--radius)] px-3 text-[12px] font-semibold transition-colors', newStep === index ? 'bg-[color:var(--brand)] text-[color:var(--brand-ink)]' : index < newStep ? 'text-[color:var(--positive)] hover:bg-[color:var(--surface-hover)]' : 'cursor-not-allowed text-[color:var(--text-faint)]')}><span className="grid size-5 place-items-center rounded-full border border-current text-[12px]">{index < newStep ? '✓' : index + 1}</span>{label}</button>{index < 3 && <span className="mx-1 h-px w-5 bg-[color:var(--border)]" />}</li>)}</ol></nav>}

      {mode === 'new' && newStep === 2 && <ConnectionGuide />}

      {mode === 'new' && (
        <section className={cn('grid min-w-0 gap-6', newStep === 3 && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
          <div className="min-w-0 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-7">
            <div className="flex items-center gap-3 border-b border-[color:var(--border)] pb-5"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand)] text-[12px] font-bold text-[color:var(--brand-ink)]">{newStep + 1}</span><div><h2 className="text-base font-semibold">{['Define what it does', 'Make the profile yours', 'Connect and test the runtime', 'Review before publishing'][newStep]}</h2><p className="mt-0.5 text-[12px] text-[color:var(--text-muted)]">Your progress is saved privately on this device</p></div></div>
            {newStep === 3 && <div className="mt-7"><LifecycleStates draft lifecycle={publishedAgent ? { registered: true, profileReady: true, categoryReady: true, endpointReady: true, quoteReady: false, enrolled: false, measured: false, listed: publishedAgent.chainId === 56, hireable: false, probeCount: 0 } : undefined} /></div>}
            <div className={cn('mt-7 rounded-[var(--radius-lg)] border border-[color:var(--brand)]/30 bg-[color:var(--brand-highlight-soft)] p-4 sm:p-5', newStep !== 0 && 'hidden')}>
              <div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface)] text-[color:var(--brand-strong)]"><Icon name="spark" /></span><div><h3 className="text-[13px] font-semibold">Turn your idea into a clear agent brief</h3><p className="mt-1 text-[12px] leading-5 text-[color:var(--text-secondary)]">Answer five concrete questions. Pokter will prepare editable marketplace copy and recommend A2A or MCP. Nothing is published, and this does not build or host the agent runtime.</p></div></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field id="brief-outcome" label="What financial outcome does it support?" className="min-w-0">
                  <Select
                    id="brief-outcome"
                    value={brief.outcome}
                    onChange={(event) => updateBrief('outcome', event.target.value)}
                    className="bg-surface"
                  >
                    <option value="">Choose an outcome</option>
                    {CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="brief-audience" label="Who is it for?">
                  <Input
                    id="brief-audience"
                    value={brief.audience}
                    maxLength={100}
                    onChange={(event) => updateBrief('audience', event.target.value)}
                    placeholder="BNB Chain treasury teams"
                    className="bg-surface"
                  />
                </Field>
                <Field id="brief-task" label="What single task does it complete?" className="sm:col-span-2">
                  <Input
                    id="brief-task"
                    value={brief.task}
                    maxLength={180}
                    onChange={(event) => updateBrief('task', event.target.value)}
                    placeholder="Compare supported stablecoin positions and produce a risk-adjusted allocation plan"
                    className="bg-surface"
                  />
                </Field>
                <Field id="brief-evidence" label="What evidence is returned?">
                  <Input
                    id="brief-evidence"
                    value={brief.evidence}
                    maxLength={160}
                    onChange={(event) => updateBrief('evidence', event.target.value)}
                    placeholder="sources, assumptions and data timestamps"
                    className="bg-surface"
                  />
                </Field>
                <Field id="brief-limits" label="What will it not do?">
                  <Input
                    id="brief-limits"
                    value={brief.limits}
                    maxLength={160}
                    onChange={(event) => updateBrief('limits', event.target.value)}
                    placeholder="move funds or guarantee returns"
                    className="bg-surface"
                  />
                </Field>
                {/*
                  Two choices, so a segmented control rather than two cards
                  of radio prose. The detail each card carried — who sends
                  what to whom — is the protocol's own definition and reads
                  better once, under the control, than twice beside it.
                */}
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-small font-medium">How will other products use it?</span>
                  <Segmented
                    label="How other products use it"
                    value={brief.interaction}
                    onChange={(value) => updateBrief('interaction', value)}
                    options={[
                      { value: 'task', label: 'Complete a task (A2A)', short: 'A2A' },
                      { value: 'tool', label: 'Expose tools (MCP)', short: 'MCP' },
                    ]}
                    className="w-full sm:w-auto"
                  />
                  <p className="text-small text-ink-muted">
                    {brief.interaction === 'task'
                      ? 'A buyer sends a job and receives a result.'
                      : 'A client discovers and invokes specific functions.'}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3 border-t border-[color:var(--brand)]/20 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-[12px] leading-4 text-[color:var(--text-muted)]">Your endpoint and image are never invented or replaced.</p><button type="button" onClick={applyLaunchBrief} disabled={!brief.outcome || !brief.audience.trim() || !brief.task.trim() || !brief.evidence.trim() || !brief.limits.trim()} className="action-primary min-h-10 rounded-[var(--radius)] px-4 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40">{briefApplied ? 'Brief applied ✓' : 'Prepare editable draft'}</button></div>
            </div>
            <div className={cn('mx-auto mt-6 grid max-w-5xl gap-4 sm:grid-cols-2', (newStep === 0 || newStep === 3) && 'hidden')}>
              <Field id="draft-name" label="Agent name" className={cn(newStep !== 1 && 'hidden')}>
                <Input id="draft-name" value={draft.name} maxLength={80} onChange={(event) => updateDraft('name', event.target.value)} placeholder="Treasury Sentinel" className="bg-canvas" />
              </Field>
              <Field id="draft-category" label="Primary financial outcome" hint="Use the outcome buyers will browse — not the implementation technique." className={cn('min-w-0', newStep !== 1 && 'hidden')}>
                <Select id="draft-category" value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} aria-describedby={describedBy('draft-category')} className="bg-canvas">
                  <option value="">Choose an outcome</option>
                  {CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>{category.label}</option>
                  ))}
                </Select>
              </Field>
              {/*
                Asked here because the campaign asks for it, and because
                somebody deciding whether to trust an agent that moves
                nothing but tells them what to do has a fair claim on seeing
                how it decides.

                Published on chain as a named service rather than held in
                Pokter's database: a repository claim only Pokter can see is
                one nobody can check. It is never called -- the prober reads
                the a2a and mcp entries by name and ignores the rest.
              */}
              <Field
                id="draft-repository"
                label="Public repository"
                hint={repositoryProblem ?? 'Published with the agent so anyone can check it. Pokter never calls this URL.'}
                error={repositoryProblem ?? undefined}
                className={cn('sm:col-span-2', newStep !== 1 && 'hidden')}
              >
                <Input
                  id="draft-repository"
                  value={draft.repository}
                  maxLength={200}
                  onChange={(event) => updateDraft('repository', event.target.value)}
                  placeholder="https://github.com/you/your-agent"
                  inputMode="url"
                  aria-invalid={Boolean(repositoryProblem) || undefined}
                  aria-describedby={describedBy('draft-repository', { error: Boolean(repositoryProblem) })}
                  className="mono bg-canvas"
                />
              </Field>
              <Field
                id="draft-description"
                label="What does it deliver?"
                hint={`${draft.description.trim().length}/600 · 40 minimum`}
                className={cn('sm:col-span-2', newStep !== 1 && 'hidden')}
              >
                <Textarea
                  id="draft-description"
                  value={draft.description}
                  maxLength={600}
                  rows={3}
                  onChange={(event) => updateDraft('description', event.target.value)}
                  placeholder="Explain the buyer’s outcome, the inputs required and the limits. Avoid slogans."
                  aria-describedby={describedBy('draft-description')}
                  className="bg-canvas"
                />
              </Field>
              {newStep === 1 && runtimeOptions && <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4 sm:col-span-2"><div><h3 className="text-[11px] font-semibold">Configure its first job</h3><p className="mt-1 text-[12px] leading-4 text-[color:var(--text-muted)]">Starting points for this outcome—change any that do not match what you are building. Your runtime must enforce whatever you choose.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="flex flex-col gap-2"><span className="text-[12px] font-medium">Scope</span><select value={runtime.target} onChange={(event) => chooseRuntime('target', event.target.value)} className="h-10 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 text-[12px]"><option value="">Choose scope</option>{runtimeOptions.target.map((option) => <option key={option}>{option}</option>)}</select></label><label className="flex flex-col gap-2"><span className="text-[12px] font-medium">Operating policy</span><select value={runtime.policy} onChange={(event) => chooseRuntime('policy', event.target.value)} className="h-10 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 text-[12px]"><option value="">Choose policy</option>{runtimeOptions.policy.map((option) => <option key={option}>{option}</option>)}</select></label><label className="flex flex-col gap-2"><span className="text-[12px] font-medium">Primary deliverable</span><select value={runtime.output} onChange={(event) => chooseRuntime('output', event.target.value)} className="h-10 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 text-[12px]"><option value="">Choose output</option>{runtimeOptions.output.map((option) => <option key={option}>{option}</option>)}</select></label></div></div>}
              {(newStep === 1 || newStep === 2) && <section className={cn('rounded-[var(--radius-lg)] border border-[color:var(--brand)]/30 bg-[color:var(--brand-highlight-soft)] p-4', newStep === 2 && 'sm:col-span-2')} aria-labelledby={`ai-build-title-${newStep}`}>
                <div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface)] text-[color:var(--brand-strong)]"><Icon name="spark" /></span><div><p className="mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--brand-strong)]">Optional shortcut</p><h3 id={`ai-build-title-${newStep}`} className="mt-1 text-[12px] font-semibold">Build the runtime with AI</h3><p className="mt-1 text-[12px] leading-4 text-[color:var(--text-secondary)]">Get a tailored engineering prompt for any coding assistant.</p></div></div>
                <button type="button" onClick={() => { setAiPromptCopied(false); setAiPromptContext('draft'); }} className="mt-4 flex min-h-11 w-full items-center justify-between rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 text-left text-[11px] font-semibold transition hover:-translate-y-0.5 hover:border-[color:var(--brand)]"><span>Review the tailored build prompt</span><span className="text-[12px] text-[color:var(--brand-strong)]">View prompt →</span></button>
                <p className="mt-3 text-[12px] leading-4 text-[color:var(--text-muted)]">Review generated code. Never paste wallet secrets into AI tools.</p>
              </section>}
              <label className={cn('flex flex-col gap-2', newStep !== 2 && 'hidden')}><span className="text-[11px] font-medium">Service protocol</span><select value={draft.protocol} onChange={(event) => updateDraft('protocol', event.target.value as Draft['protocol'])} className="h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-[12px] outline-none focus:border-[color:var(--border-focus)]"><option value="a2a">A2A</option><option value="mcp">MCP</option></select></label>
              <div className={cn('flex flex-col gap-2', newStep !== 2 && 'hidden')}><label htmlFor="builder-endpoint" className="text-[11px] font-medium">HTTPS endpoint</label><div className="flex gap-2"><input id="builder-endpoint" value={draft.endpoint} maxLength={2048} onChange={(event) => updateDraft('endpoint', event.target.value)} placeholder="https://agent.example/a2a" className="h-11 min-w-0 flex-1 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-sm outline-none focus:border-[color:var(--border-focus)]" /><button type="button" onClick={testDraftEndpoint} disabled={endpointBusy || !/^https:\/\//i.test(draft.endpoint.trim())} className="shrink-0 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 text-[11px] font-semibold transition-colors hover:border-[color:var(--brand)] disabled:cursor-not-allowed disabled:opacity-40">{endpointBusy ? 'Testing…' : 'Test'}</button></div><span className="text-[12px] leading-4 text-[color:var(--text-muted)]">Pokter performs the same safe protocol handshake used by marketplace probes.</span></div>
              {newStep === 2 && runtimeOptions && <div className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4 sm:col-span-2"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-[11px] font-semibold">Runtime configuration handoff</p><p className="mt-1 text-[12px] leading-4 text-[color:var(--text-muted)]">Download the exact choices from Profile and apply them to your agent before testing its endpoint.</p></div><button type="button" onClick={downloadRuntimeConfig} disabled={!runtime.target || !runtime.policy || !runtime.output} className="shrink-0 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 py-2 text-[12px] font-semibold disabled:opacity-40">Download config</button></div></div>}
              {(endpointReport || endpointError) && <div className={cn('rounded-[var(--radius)] border p-3 sm:col-span-2', endpointReport?.ok ? 'border-[color:var(--positive)]/30 bg-[color:var(--positive-dim)]' : 'border-[color:var(--caution)]/30 bg-[color:var(--caution-dim)]')} role="status"><div className="flex items-start gap-3"><StatusMark status={endpointReport?.ok ? 'pass' : 'fail'} /><div className="min-w-0"><p className="text-[12px] font-semibold">{endpointReport?.ok ? `${draft.protocol.toUpperCase()} handshake passed` : 'Endpoint is not ready'}</p><p className="mt-1 text-[12px] leading-5 text-[color:var(--text-secondary)]">{endpointError ?? endpointReport?.detail}</p>{endpointReport?.ok && <p className="mt-2 text-[12px] text-[color:var(--text-muted)]">{endpointReport.latencyMs !== null ? `${endpointReport.latencyMs} ms · ` : ''}{endpointReport.capabilities.length} declared {draft.protocol === 'mcp' ? 'tools' : 'skills'} · {endpointReport.quoteCapability ? 'quote capability declared' : 'no quote capability declared yet'}</p>}{endpointReport?.safety && <details className="mt-3 border-t border-current/10 pt-2"><summary className="cursor-pointer text-[12px] font-semibold">Connection safety</summary><ul className="mt-2 grid gap-1 text-[12px] leading-4 text-[color:var(--text-muted)] sm:grid-cols-2"><li>✓ Public HTTPS only</li><li>✓ Credentials rejected</li><li>✓ DNS address pinned</li><li>✓ Private networks rejected</li><li>✓ Redirects blocked</li><li>✓ 10s / 256 KiB limits</li></ul></details>}</div></div></div>}
              {endpointReport?.ok && <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4 sm:col-span-2">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><p className="text-[12px] font-semibold">Run a private sample request</p><p className="mt-1 text-[12px] leading-5 text-[color:var(--text-muted)]">Only an explicitly advertised preview, simulate or dry-run capability can be called. This result stays private and never becomes marketplace evidence.</p></div>{trialCapability && <span className="mono w-fit rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-[12px]">{trialCapability}</span>}</div>
                {trialCapability ? <>
                  <label className="mt-4 flex flex-col gap-2"><span className="text-[12px] font-medium">Sample task</span><textarea rows={3} maxLength={500} value={trialTask} disabled={trialBusy} onChange={(event) => { setTrialTask(event.target.value); setTrialResult(null); setTrialError(null); }} className="resize-none rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-3 text-[12px] leading-5 outline-none focus:border-[color:var(--border-focus)]" /></label>
                  <button type="button" onClick={runDraftTrial} disabled={trialBusy || trialTask.trim().length < 10} className="mt-3 min-h-10 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-4 text-[11px] font-semibold hover:border-[color:var(--brand)] disabled:cursor-not-allowed disabled:opacity-40">{trialBusy ? 'Running private preview…' : 'Run private preview'}</button>
                </> : <p className="mt-4 rounded-[var(--radius)] border border-[color:var(--info)]/20 bg-[color:var(--info-dim)] p-3 text-[12px] leading-5 text-[color:var(--text-secondary)]">No safe preview capability was advertised. Add a dedicated <span className="mono">preview</span>, <span className="mono">simulate</span> or <span className="mono">dry-run</span> skill/tool to test real output here. Pokter will not call execution capabilities such as trade, withdraw or rebalance.</p>}
                {trialError && <p role="alert" className="mt-3 rounded-[var(--radius)] border border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] p-3 text-[12px] leading-5 text-[color:var(--negative)]">{trialError}</p>}
                {trialResult && <div className="mt-4 rounded-[var(--radius)] border border-[color:var(--positive)]/30 bg-[color:var(--positive-dim)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-semibold text-[color:var(--positive)]">Structured preview returned</p><span className="mono text-[12px] text-[color:var(--text-muted)]">{trialResult.latencyMs} ms · {trialResult.protocol.toUpperCase()}</span></div><p className="mt-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">{trialResult.summary}</p><p className="mt-2 text-[12px] leading-4 text-[color:var(--text-muted)]">{trialResult.disclaimer}</p><details className="mt-3 border-t border-[color:var(--positive)]/20 pt-3"><summary className="cursor-pointer text-[12px] font-semibold">Inspect raw response</summary><pre className="mono mt-3 max-h-56 overflow-auto rounded-[var(--radius)] bg-[color:var(--bg)] p-3 text-[12px] leading-5 text-[color:var(--text-secondary)]">{JSON.stringify(trialResult.response, null, 2)}</pre></details></div>}
              </div>}
              <fieldset className={cn('rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4', newStep !== 1 && 'hidden')}><legend className="sr-only">Choose an agent identity</legend><p className="text-[11px] font-semibold">Choose an identity</p><p className="mt-1 text-[12px] leading-4 text-[color:var(--text-muted)]">{draft.image.trim() ? 'This is the image buyers will see.' : 'The first is in use unless you pick another, or add your own below.'}</p><div className="mt-4 flex flex-wrap gap-2">{avatarSeeds.map((seed) => { const publicUrl = `https://pokter.xyz${avatarUrl(seed)}`; const selected = chosenImage === publicUrl; return <button key={seed} type="button" onClick={() => updateDraft('image', publicUrl)} aria-label={`Choose avatar ${seed.slice(-1)}`} aria-pressed={selected} className={cn('relative size-12 rounded-[var(--radius)] border-2 bg-cover bg-center transition-all', selected ? 'border-[color:var(--brand)] ring-2 ring-[color:var(--brand)]/30 ring-offset-2 ring-offset-[color:var(--bg-subtle)]' : 'border-transparent opacity-60 hover:-translate-y-0.5 hover:opacity-100')} style={{ backgroundImage: `url(${avatarUrl(seed)})` }}>{selected && <span aria-hidden className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[color:var(--brand)] text-[11px] font-bold text-[color:var(--brand-ink)] shadow">✓</span>}</button>; })}</div></fieldset>
              <details className={cn('sm:col-span-2', newStep !== 1 && 'hidden')}><summary className="cursor-pointer text-[12px] font-semibold text-[color:var(--brand-strong)]">Use my own image instead</summary><label className="mt-3 flex flex-col gap-2"><span className="text-[12px] text-[color:var(--text-muted)]">Public HTTPS image URL</span><input value={draft.image} maxLength={2048} onChange={(event) => updateDraft('image', event.target.value)} placeholder="https://agent.example/avatar.png" className="h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-sm outline-none focus:border-[color:var(--border-focus)]" /></label></details>
            </div>
            {newStep === 1 && draft.name === QUALITY_EXAMPLE.name && !draft.endpoint && !draft.image && <div className="mt-5 rounded-[var(--radius)] border border-[color:var(--info)]/25 bg-[color:var(--info-dim)] p-4"><p className="text-[11px] font-semibold text-[color:var(--info)]">Example loaded—not a live agent</p><p className="mt-1 text-[12px] leading-5 text-[color:var(--text-secondary)]">The profile demonstrates useful marketplace language. Add an endpoint you operate and an image you control; Pokter will not mark the draft ready until the endpoint passes a real protocol handshake.</p></div>}
            {newStep === 3 && <div className="mt-7 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]"><Icon name="registry" /></span>
                <div><p className="text-[12px] font-semibold">Publish the identity you own</p><p className="mt-1 text-[12px] leading-5 text-[color:var(--text-secondary)]">After the profile passes every check, Pokter opens a focused review with the exact record, network and wallet actions. Publishing never grants Pokter wallet access or funds a hiring escrow.</p></div>
              </div>
            </div>}
            {newStep === 3 && reviewing && (
              <div className="mt-6 rounded-[var(--radius-lg)] border border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)] p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--positive)] text-white"><Icon name="check" /></span>
                  <div>
                    <h3 className="text-sm font-semibold">Registration file ready for review</h3>
                    <p className="mt-1 text-[12px] leading-5 text-[color:var(--text-secondary)]">This is the exact public profile shape Pokter is preparing. It still needs an onchain identity ID before it can be published.</p>
                  </div>
                </div>
                <dl className="mt-5 grid gap-4 border-t border-[color:var(--positive)]/20 pt-5 sm:grid-cols-2">
                  <div><dt className="text-[12px] text-[color:var(--text-muted)]">Agent</dt><dd className="mt-1 text-[12px] font-medium">{registrationPreview.name}</dd></div>
                  <div><dt className="text-[12px] text-[color:var(--text-muted)]">Marketplace outcome</dt><dd className="mt-1 text-[12px] font-medium">{CATEGORIES.find((category) => category.id === draft.category)?.label}</dd></div>
                  <div><dt className="text-[12px] text-[color:var(--text-muted)]">Service</dt><dd className="mt-1 text-[12px] font-medium">{registrationPreview.services[0].name} · HTTPS</dd></div>
                  <div className="sm:col-span-2"><dt className="text-[12px] text-[color:var(--text-muted)]">Public endpoint</dt><dd className="mono mt-1 break-all text-[11px]">{registrationPreview.services[0].endpoint}</dd></div>
                </dl>
                <details className="mt-5 border-t border-[color:var(--positive)]/20 pt-4">
                  <summary className="cursor-pointer text-[11px] font-semibold">Inspect registration JSON</summary>
                  <pre className="mono mt-3 max-h-64 overflow-auto rounded-[var(--radius)] bg-[color:var(--bg)] p-3 text-[12px] leading-5 text-[color:var(--text-secondary)]">{JSON.stringify(registrationPreview, null, 2)}</pre>
                </details>
                <button type="button" onClick={downloadRegistrationFile} className="mt-4 inline-flex min-h-10 items-center rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-4 text-[11px] font-semibold hover:border-[color:var(--brand)]">Download registration JSON</button>
                <div className="mt-5 border-t border-[color:var(--positive)]/20 pt-5">
                  <p className="text-[11px] font-semibold">After the identity is registered</p>
                  <p className="mt-1 text-[12px] leading-5 text-[color:var(--text-secondary)]">Return with its ERC-8004 token ID. Pokter will read the registry, test the public service and ask the owner wallet for a non-transactional signature before opening Builder operations.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('existing');
                      setReport(null);
                      setError(null);
                      setTokenId('');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-[var(--radius)] bg-[color:var(--brand)] px-4 text-[12px] font-semibold text-[color:var(--brand-ink)]"
                  >
                    I have an agent ID <Icon name="arrow" />
                  </button>
                </div>
              </div>
            )}
            <div className="mt-7 flex items-center justify-between border-t border-[color:var(--border)] pt-5"><button type="button" disabled={newStep === 0} onClick={() => moveToNewStep(newStep - 1)} className="min-h-10 rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 text-[11px] font-semibold disabled:opacity-30">← Back</button>{newStep < 3 && <button type="button" onClick={() => moveToNewStep(newStep + 1)} disabled={(newStep === 1 && (!draft.name.trim() || draft.description.trim().length < 40 || !draft.category)) || (newStep === 2 && !endpointReport?.ok)} className="action-primary min-h-10 rounded-[var(--radius)] px-5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40">{newStep === 0 ? 'Continue to profile' : newStep === 1 ? 'Connect runtime' : 'Review agent'} →</button>}</div>
          </div>
          <aside className={cn('h-fit min-w-0 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5 lg:sticky lg:top-20', newStep !== 3 && 'hidden')}>
            <div className="flex items-end justify-between"><div><p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Draft quality</p><p className="mt-2 text-3xl font-semibold">{draftScore}/5</p></div><span className="text-[12px] text-[color:var(--text-muted)]">Auto-saved</span></div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[color:var(--surface)]"><div className="h-full rounded-full bg-[color:var(--brand)] transition-all" style={{ width: `${draftScore * 20}%` }} /></div>
            <ul className="mt-5 flex flex-col gap-3">{draftChecks.map((check) => <li key={check.label} className="flex items-center gap-3 text-[12px]"><span className={cn('flex size-5 items-center justify-center rounded-full border text-[12px]', check.done ? 'border-[color:var(--positive)] bg-[color:var(--positive-dim)] text-[color:var(--positive)]' : 'border-[color:var(--border-strong)] text-[color:var(--text-muted)]')}>{check.done ? '✓' : '·'}</span>{check.label}</li>)}</ul>
            <button type="button" disabled={!draft.name.trim() || !draft.description.trim() || !draft.category} onClick={() => setPreviewOpen(true)} className="mt-6 w-full rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-4 py-3 text-[11px] font-semibold transition-colors hover:border-[color:var(--brand)] disabled:cursor-not-allowed disabled:opacity-40">Preview buyer view</button>
            {!reviewing ? <button type="button" disabled={draftScore < 5} onClick={() => setReviewing(true)} className="action-primary mt-2 w-full rounded-[var(--radius)] px-4 py-3 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40">Review registration</button> : <button type="button" onClick={() => setPublishModalOpen(true)} className="action-primary mt-2 flex w-full items-center justify-center rounded-[var(--radius)] px-4 py-3 text-[12px] font-semibold">Review network & publish</button>}
            {/*
              Name what is missing, and name it from the list that is actually
              the gate.

              This said "complete every readiness check", which is the panel
              beside it — the one that reads 1 of 6 and includes an identity,
              a signed price and an independent measurement. Those are
              consequences of publishing, not conditions for it, so somebody
              who read the sentence and looked where it pointed concluded they
              were permanently stuck. The gate is the draft list on this card,
              and until now it never said which of the five was unmet.
            */}
            <p className="mt-3 text-[12px] leading-4 text-[color:var(--text-muted)]">{reviewing ? 'Choose the network and approve publishing beside its disclosure.' : missingDraftChecks.length > 0 ? `Still needed before publishing: ${missingDraftChecks.join(', ').toLowerCase()}.` : 'Every draft check is met.'}</p>
          </aside>
        </section>
      )}

      <Sheet
        open={Boolean(aiPromptContext)}
        onClose={() => setAiPromptContext(null)}
        title="Build with an AI assistant"
        description="Use this prompt with any capable coding assistant. It begins with discovery and naming before implementation."
        footer={aiPromptContext ? <button type="button" onClick={copyAgentBuildPrompt} className="action-primary w-full rounded-[var(--radius)] px-4 py-3 text-[12px] font-semibold">{aiPromptCopied ? 'Prompt copied ✓' : 'Copy build prompt'}</button> : undefined}
      >
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><p className="mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">Complete prompt</p><span className="rounded-full bg-[color:var(--brand-highlight-soft)] px-2 py-1 text-[12px] font-semibold text-[color:var(--brand-strong)]">Editable after pasting</span></div>
          <pre className="mono max-h-[58vh] whitespace-pre-wrap overflow-auto rounded-[var(--radius)] bg-[color:var(--surface)] p-4 text-[12px] leading-5 text-[color:var(--text-secondary)]">{visibleAiPrompt}</pre>
        </div>
        <p className="mt-4 text-[12px] leading-5 text-[color:var(--text-muted)]">Do not paste private keys, seed phrases, production credentials, or customer data into any AI assistant. Review and test generated code before deploying it.</p>
        {mode === 'choose' && <button type="button" onClick={() => { setAiPromptContext(null); setMode('templates'); }} className="mt-4 flex min-h-11 w-full items-center justify-center rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-4 text-[11px] font-semibold hover:border-[color:var(--brand)]">Prefer a tailored prompt? Choose an agent starter →</button>}
      </Sheet>

      <Sheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Private buyer preview"
        description="Review the marketplace card and profile opening before publishing. Drafts are not discoverable or hireable."
      >
        <div className="flex justify-center rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-1" role="group" aria-label="Preview viewport">
          {(['mobile', 'desktop'] as const).map((viewport) => <button key={viewport} type="button" onClick={() => setPreviewViewport(viewport)} aria-pressed={previewViewport === viewport} className={cn('min-h-9 flex-1 rounded-[calc(var(--radius)-2px)] px-3 text-[10px] font-semibold capitalize transition-colors', previewViewport === viewport ? 'bg-[color:var(--surface)] shadow-sm' : 'text-[color:var(--text-muted)]')}>{viewport}</button>)}
        </div>
        <div className="mt-5 overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg)] p-3 sm:p-5">
          <div className={cn('mx-auto transition-[max-width] duration-200', previewViewport === 'mobile' ? 'max-w-[360px]' : 'max-w-3xl')}>
            <div className={cn('grid gap-4', previewViewport === 'desktop' && 'sm:grid-cols-[minmax(0,1fr)_240px]')}>
              <article className="min-w-0 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--brand-highlight-soft)] bg-cover bg-center text-lg font-semibold text-[color:var(--brand-strong)]" style={/^https:\/\//i.test(draft.image.trim()) ? { backgroundImage: `url(${JSON.stringify(draft.image.trim()).slice(1, -1)})` } : undefined}>{!/^https:\/\//i.test(draft.image.trim()) && (draft.name.trim().charAt(0).toUpperCase() || 'A')}</div>
                  <div className="min-w-0"><p className="text-[12px] font-medium text-[color:var(--caution)]">Awaiting measurement</p><h3 className="mt-1 truncate text-lg font-semibold">{draft.name.trim() || 'Untitled agent'}</h3><p className="mt-1 text-[12px] text-[color:var(--text-muted)]">{CATEGORIES.find((category) => category.id === draft.category)?.label ?? 'Outcome not selected'} · {draft.protocol.toUpperCase()}</p></div>
                </div>
                <p className="mt-5 line-clamp-4 text-[12px] leading-6 text-[color:var(--text-secondary)]">{draft.description.trim() || 'Describe the outcome buyers receive, its evidence and its limits.'}</p>
                <div className="mt-5 border-t border-[color:var(--border)] pt-4"><p className="text-[12px] text-[color:var(--text-muted)]">No independent probes or signed price yet</p><button type="button" disabled className="mt-4 min-h-10 w-full rounded-[var(--radius)] bg-[color:var(--bg-subtle)] px-4 text-[11px] font-semibold text-[color:var(--text-muted)]">Not hireable yet</button></div>
              </article>
              <aside className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4"><p className="mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">Buyer decision</p><dl className="mt-4 flex flex-col gap-4"><div><dt className="text-[12px] text-[color:var(--text-muted)]">Identity</dt><dd className="mt-1 text-[11px] font-medium">Not registered</dd></div><div><dt className="text-[12px] text-[color:var(--text-muted)]">Endpoint</dt><dd className="mt-1 text-[11px] font-medium">{endpointReport?.ok ? 'Handshake passed' : 'Not verified'}</dd></div><div><dt className="text-[12px] text-[color:var(--text-muted)]">Evidence</dt><dd className="mt-1 text-[11px] font-medium">Not measured</dd></div></dl><p className="mt-5 border-t border-[color:var(--border)] pt-4 text-[12px] leading-5 text-[color:var(--text-muted)]">New agents enter as pending. Registration alone never becomes proof of quality.</p></aside>
            </div>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={publishModalOpen}
        onClose={() => { if (!registrationBusy) setPublishModalOpen(false); }}
        title={publishedAgent ? 'Agent published' : 'Review network and publish'}
        description={publishedAgent ? `ERC-8004 identity #${publishedAgent.tokenId} is verified onchain.` : 'Confirm the exact public record and where it will be written.'}
        footer={!publishedAgent ? (
          <button type="button" disabled={registrationBusy || (registrationChainId === 56 && !mainnetConsent)} onClick={publishIdentity} className="action-primary w-full rounded-[var(--radius)] px-4 py-3 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50">{registrationBusy && <span className="mr-2 inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />}{registrationLabel}</button>
        ) : undefined}
      >
        {publishedAgent ? (
          <div className="rounded-[var(--radius-lg)] border border-[color:var(--positive)]/30 bg-[color:var(--positive-dim)] p-5"><span className="flex size-9 items-center justify-center rounded-full bg-[color:var(--positive)] text-white"><Icon name="check" /></span><p className="mt-4 text-sm font-semibold text-[color:var(--positive)]">Agent #{publishedAgent.tokenId} is live.</p><p className="mt-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">Pokter re-read the registry and verified both the owner and exact registration file.</p><div className="mt-5 flex flex-col gap-2 sm:flex-row"><Link href={`/agents/${publishedAgent.chainId}/${publishedAgent.tokenId}`} className="action-primary flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius)] px-4 text-[12px] font-semibold">Open public profile</Link><button type="button" onClick={() => { setPublishModalOpen(false); setMode('existing'); setReport(null); setError(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="min-h-11 flex-1 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-4 text-[11px] font-semibold">Verify ownership</button></div></div>
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="grid gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4 sm:grid-cols-2"><div><dt className="text-[9px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">Agent</dt><dd className="mt-1 text-[12px] font-semibold">{registrationPreview.name}</dd></div><div><dt className="text-[9px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">Outcome</dt><dd className="mt-1 text-[12px] font-semibold">{CATEGORIES.find((category) => category.id === draft.category)?.label}</dd></div><div><dt className="text-[9px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">Protocol</dt><dd className="mt-1 text-[12px] font-semibold">{registrationPreview.services[0].name}</dd></div><div className="min-w-0"><dt className="text-[9px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">Endpoint</dt><dd className="mono mt-1 truncate text-[12px]" title={registrationPreview.services[0].endpoint}>{registrationPreview.services[0].endpoint}</dd></div></dl>
            <IdentityNetworkToggle
              value={registrationChainId}
              disabled={registrationBusy || Boolean(registrationRecovery)}
              funding={identityFunding}
              onChange={(chainId) => { setRegistrationChainId(chainId); setMainnetConsent(false); }}
            />
            {identityFunding[registrationChainId].funded === false && signingAddress && registrationChainId === 97 && (
              <LowBalanceHelp address={signingAddress} />
            )}
            <div className={cn('rounded-[var(--radius)] border p-3 text-[12px] leading-5', registrationChainId === 56 ? 'border-[color:var(--caution)]/30 bg-[color:var(--caution-dim)]' : 'border-[color:var(--info)]/25 bg-[color:var(--info-dim)]')}><strong>{registrationChainId === 56 ? 'Mainnet identity transaction.' : 'Testnet identity.'}</strong> {registrationChainId === 56 ? 'You will pay BNB gas. This only publishes an identity; Pokter hiring remains on BNB Testnet.' : 'Hiring settles here, so this is where an agent earns its own record. Gas is test currency.'}</div>
            {registrationChainId === 56 && <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-[color:var(--border)] p-3"><input type="checkbox" checked={mainnetConsent} onChange={(event) => setMainnetConsent(event.target.checked)} className="mt-0.5 size-4 accent-[color:var(--brand)]"/><span className="text-[12px] leading-5 text-[color:var(--text-secondary)]">I understand this creates a public ERC-8004 identity on BNB Chain and requires two wallet-approved transactions plus BNB gas.</span></label>}
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[var(--radius)] border border-[color:var(--border)] p-3"><span className="flex size-6 items-center justify-center rounded-full bg-[color:var(--brand-highlight-soft)] text-[12px] font-bold">1</span><p className="text-[11px] font-semibold">Mint the identity</p><span /><p className="text-[12px] leading-4 text-[color:var(--text-muted)]">The registry assigns the ERC-8004 agent ID.</p><span className="mt-2 flex size-6 items-center justify-center rounded-full bg-[color:var(--brand-highlight-soft)] text-[12px] font-bold">2</span><p className="mt-2 text-[11px] font-semibold">Bind the completed profile</p><span /><p className="text-[12px] leading-4 text-[color:var(--text-muted)]">The second transaction writes the exact profile with its assigned ID.</p></div>
            {/*
              Which wallet signs, said before the button rather than after it.

              Publishing reached for the injected wallet unconditionally, so
              somebody holding a passkey — the thing Pokter offers precisely
              so they need not hold a key — learned it would not work by
              pressing publish and reading a thrown error.
            */}
            <p className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-3 text-[12px] leading-5 text-[color:var(--text-secondary)]">
              {passkeyCanPublish
                ? <>Signed by your passkey wallet <span className="mono">{passkeyWallet ? `${passkeyWallet.address.slice(0, 6)}…${passkeyWallet.address.slice(-4)}` : ''}</span>. Two confirmations, and it needs {NATIVE_SYMBOL} for gas.</>
                : <>Signed by your browser wallet. Two confirmations, and it needs gas on the selected network.</>}
            </p>
            {registrationRecovery && <div className="rounded-[var(--radius)] border border-[color:var(--info)]/25 bg-[color:var(--info-dim)] p-3 text-[12px] leading-5"><strong className="text-[color:var(--info)]">Recoverable publication found.</strong> Pokter will resume {registrationRecovery.agentId ? `agent #${registrationRecovery.agentId}` : 'the confirmed transaction'} without minting another identity.</div>}
            {registrationError && <p role="alert" className="rounded-[var(--radius)] border border-[color:var(--caution)]/30 bg-[color:var(--caution-dim)] p-3 text-[12px] leading-5 text-[color:var(--caution)]">{registrationError}</p>}
            <details className="rounded-[var(--radius)] border border-[color:var(--border)] px-3 py-2"><summary className="cursor-pointer text-[12px] font-semibold">Inspect registration JSON</summary><pre className="mono mt-3 max-h-48 overflow-auto rounded-[var(--radius)] bg-[color:var(--bg)] p-3 text-[12px] leading-5 text-[color:var(--text-secondary)]">{JSON.stringify(registrationPreview, null, 2)}</pre></details>
          </div>
        )}
      </Sheet>
    </div>
  );
}
