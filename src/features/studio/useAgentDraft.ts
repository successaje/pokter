'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Erc8004RegistrationFile } from '@altananetwork/sdk';
import { useAccount } from 'wagmi';

import { CATEGORIES, NO_CATEGORY } from '@/lib/agents/categories';
import { createAgentBuildPrompt } from '@/lib/builder/ai-prompt';
import { DEFAULT_PLAN, DRAFTS_KEY, announceDraftsChanged, draftSaveStatus, draftsServerSnapshot, draftsSnapshot, failedSavesServerSnapshot, failedSavesSnapshot, isDraftEmpty, readLastStyle, recordDraftSave, rememberStyle, subscribeToDrafts, upsertDraft, type BuildPlan, type BuildStyle, type DraftFields, type DraftRecord, type StoredDraft } from '@/lib/builder/drafts';
import { applyConcept, type AgentConcept } from '@/lib/builder/concepts';
import { selectTrialCapability } from '@/lib/builder/trial';
import { passkeyRegistrySigner } from '@/lib/registry/passkey-signer';
import { registerIdentityFromWallet, type RegistrationProgress, type RegistrationRecovery, type RegistryChainId } from '@/lib/registry/register';
import { avatarUrl } from '@/lib/ui/avatar-art';
import { usePasskeySigner, usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { useChainFunding } from '@/lib/wallet/use-chain-funding';
import {
  forgetActiveRegistration,
  readActiveRegistration,
  rememberActiveRegistration,
} from './active-registration';
import { claimStudioSession, type ClaimOutcome } from './claim-session';
import { siteUrlClient } from './site';
import { builtWithPokter } from '@/lib/brand/built-with';

export type Draft = DraftFields;

export const EMPTY_DRAFT: Draft = { name: '', description: '', category: '', protocol: 'a2a', endpoint: '', image: '', repository: '' };

export interface EndpointPreflight {
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
}

export interface BuilderTrial {
  ok: boolean;
  protocol: Draft['protocol'];
  capability: string;
  latencyMs: number;
  observedAt: string;
  summary: string;
  response: unknown;
  disclaimer: string;
}

export const RUNTIME_OPTIONS: Record<string, { target: string[]; policy: string[]; output: string[] }> = {
  'health-factor': { target: ['Venus', 'Lista'], policy: ['Conservative', 'Balanced', 'Custom thresholds'], output: ['Risk report', 'Stress analysis', 'Action plan'] },
  yield: { target: ['Stablecoins', 'BNB liquid staking', 'All supported assets'], policy: ['Capital preservation', 'Balanced', 'Opportunity seeking'], output: ['Opportunity comparison', 'Allocation research', 'Risk report'] },
  rebalancing: { target: ['Wallet portfolio', 'Treasury', 'Liquidity positions'], policy: ['Drift threshold', 'Scheduled review', 'Custom mandate'], output: ['Rebalancing plan', 'Exposure report', 'Proposed trade list'] },
  'grid-trading': { target: ['BNB / USDT', 'BTCB / USDT', 'Custom pair'], policy: ['Wide conservative grid', 'Balanced grid', 'Custom constraints'], output: ['Grid parameters', 'Scenario analysis', 'Risk-bounded plan'] },
  'token-safety': { target: ['BEP-20 tokens', 'New launches', 'A watchlist'], policy: ['Flag anything uncertain', 'Balanced', 'Only hard failures'], output: ['Safety report', 'Holder risk summary', 'Pass / fail screen'] },
};

const REGISTRATION_RECOVERY_KEY = 'pokter-agent-registration-recovery-v1';

/**
 * The finished registration, kept on disk.
 *
 * `published` used to live only in memory, and success deleted the draft.
 * So anything that remounted this component between the last signature
 * and the reader looking at the screen lost both: no success panel, no
 * draft, back to an empty form — with an identity minted on chain and
 * nothing saying so. A wallet that reloads the page when it switches
 * network does exactly that, and switching network is a step in this
 * flow.
 *
 * Registering twice is the expensive version of that mistake, so the
 * result outlives the render. The name rides along because the draft it
 * came from is deliberately deleted on success.
 */
const REGISTRATION_PUBLISHED_KEY = 'pokter-agent-registration-published-v1';

interface PublishedRecord {
  chainId: RegistryChainId;
  tokenId: string;
  name: string;
}

function publishedKey(draftId: string) {
  return `${REGISTRATION_PUBLISHED_KEY}:${draftId}`;
}

function readPublished(draftId: string): PublishedRecord | null {
  try {
    const stored = window.localStorage.getItem(publishedKey(draftId));
    return stored ? (JSON.parse(stored) as PublishedRecord) : null;
  } catch {
    return null;
  }
}

// Recovery belongs to one draft: resuming another draft's half-finished
// mint would write this profile onto that draft's token.
function recoveryKey(draftId: string) {
  return `${REGISTRATION_RECOVERY_KEY}:${draftId}`;
}

function readRecovery(draftId: string): RegistrationRecovery | null {
  try {
    const stored = window.localStorage.getItem(recoveryKey(draftId));
    return stored ? (JSON.parse(stored) as RegistrationRecovery) : null;
  } catch {
    return null;
  }
}

export function slug(text: string) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent';
}

function download(name: string, payload: unknown) {
  const file = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const href = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(href);
}

/**
 * Everything a new agent needs between "an idea" and "an identity on
 * chain": the draft (autosaved to this device), its readiness checks, the
 * endpoint preflight and trial, and ERC-8004 registration with recovery.
 * The network checks are the same ones a buyer's hire relies on.
 */
export function useAgentDraft(initial?: StoredDraft | null, onBound?: (draftId: string) => void) {
  /*
   * A new draft adopts a registration already in flight, rather than
   * minting a fresh id and losing it.
   *
   * `draft-${Date.now()}` is a different id on every mount, so a remount
   * during registration — which a wallet causes on mainnet, where the
   * flow asks it to switch network — orphaned the saved result and the
   * saved recovery alike, and returned the reader to an empty form with
   * an identity already on chain. See `active-registration`.
   */
  const [draftId] = useState(() => {
    if (initial?.id) return initial.id;
    if (typeof window === 'undefined') return `draft-${Date.now()}`;
    return readActiveRegistration()?.draftId ?? `draft-${Date.now()}`;
  });
  const [draft, setDraft] = useState<Draft>(() => ({ ...EMPTY_DRAFT, ...(initial?.draft ?? {}) }));
  const [step, setStep] = useState(initial?.step ?? 0);
  /*
   * How much of the deciding the builder wants done for them, saved with
   * the draft rather than held in this render.
   *
   * Switching style must not cost anybody their brief or their place in
   * the flow, which is why it lives beside the draft and not inside it:
   * the fields, the step, the preflight and the trial are all untouched
   * by a change of manner. A reload — including the one a wallet causes
   * when it switches network — comes back to the same style and the same
   * accepted concept.
   */
  const [plan, setPlan] = useState<BuildPlan>(() => {
    if (initial?.plan) return { ...DEFAULT_PLAN, ...initial.plan };
    if (typeof window === 'undefined') return DEFAULT_PLAN;
    return { ...DEFAULT_PLAN, style: readLastStyle() };
  });
  const [runtimeChoice, setRuntimeChoice] = useState<{ category: string; target: string; policy: string; output: string }>({ category: '', target: '', policy: '', output: '' });

  const [preflight, setPreflight] = useState<EndpointPreflight | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [trialTask, setTrialTask] = useState('Return a read-only example result with sources, assumptions and explicit limitations.');
  const [trial, setTrial] = useState<BuilderTrial | null>(null);
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);

  const { wallet: passkeyWallet } = usePasskeyWallet();
  const passkeySigner = usePasskeySigner();
  const { address: externalAddress, isConnected: externalConnected } = useAccount();
  const [recovery, setRecovery] = useState<RegistrationRecovery | null>(() => (typeof window === 'undefined' ? null : readRecovery(initial?.id ?? '')));
  const [network, setNetwork] = useState<RegistryChainId>(() => recovery?.chainId ?? 97);
  const [mainnetConsent, setMainnetConsent] = useState(false);
  const [progress, setProgress] = useState<RegistrationProgress | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  /*
   * Whether this browser now has Studio access to what it just registered.
   * Separate from `published` because the mint is final and the claim is
   * not: a declined signature must not make a registered agent look
   * unregistered. Not persisted — the session cookie is the durable part,
   * and on a remount the success panel simply offers the claim again.
   */
  const [claim, setClaim] = useState<ClaimOutcome | 'claiming' | null>(null);
  const [published, setPublished] = useState<PublishedRecord | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = readPublished(draftId);
    if (saved) return saved;
    /*
     * A recovery record that already carries an agent id means the mint
     * landed, whatever happened to the tab afterwards. Treating that as
     * published is the difference between telling somebody they own
     * identity #2599 and letting them pay to mint #2600.
     */
    const r = readRecovery(draftId);
    return r?.agentId
      ? { chainId: r.chainId as RegistryChainId, tokenId: String(r.agentId), name: '' }
      : null;
  });

  // Autosave every meaningful change to this device.
  useEffect(() => {
    if (isDraftEmpty(draft) || published) return;
    try {
      const stored = window.localStorage.getItem(DRAFTS_KEY);
      let record: DraftRecord = {};
      try {
        record = stored ? (JSON.parse(stored) as DraftRecord) : {};
      } catch {
        /* Unreadable old data: keep this draft rather than fail every save. */
      }
      window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(upsertDraft(record, { id: draftId, draft, mode: 'new', step, updatedAt: new Date().toISOString(), plan })));
      recordDraftSave(draftId, true);
      announceDraftsChanged();
      /*
       * Put the draft's id in the address, so a refresh, Back or a shared
       * tab returns to this draft and step instead of an empty form. Only
       * the id: nothing from the draft itself goes into the URL.
       */
      const url = new URL(window.location.href);
      if (url.searchParams.get('draft') !== draftId) {
        url.searchParams.delete('template');
        url.searchParams.set('draft', draftId);
        window.history.replaceState(window.history.state, '', url);
        onBound?.(draftId);
      }
    } catch {
      /* Storage full or blocked: say so, rather than claim it was saved. */
      recordDraftSave(draftId, false);
    }
  }, [draft, draftId, step, published, plan, onBound]);

  const storedDrafts = useSyncExternalStore(subscribeToDrafts, draftsSnapshot, draftsServerSnapshot);
  const failedSaves = useSyncExternalStore(subscribeToDrafts, failedSavesSnapshot, failedSavesServerSnapshot);
  const saveStatus = published ? 'empty' : draftSaveStatus(storedDrafts, draftId, draft, failedSaves.split('\n').includes(draftId));

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    if (key === 'endpoint' || key === 'protocol') {
      setPreflight(null);
      setPreflightError(null);
      setTrial(null);
      setTrialError(null);
    }
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const replace = (next: Partial<Draft>) => {
    setPreflight(null);
    setTrial(null);
    setDraft((current) => ({ ...current, ...next }));
  };

  const avatarSeeds = useMemo(() => {
    const base = `${draft.category || 'agent'}-${draft.name || 'pokter'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return Array.from({ length: 6 }, (_, i) => `${base}-${i + 1}`);
  }, [draft.category, draft.name]);
  // The registration file is public: images must resolve from anywhere.
  const defaultImage = `${siteUrlClient()}${avatarUrl(avatarSeeds[0])}`;
  const image = draft.image.trim() || defaultImage;

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
    if (/^localhost$|^127\.|^0\.0\.0\.0$|\.local$/i.test(url.hostname)) return 'That address only resolves on your machine.';
    return null;
  })();

  const endpointChecked = Boolean(preflight?.ok && preflight.endpoint === draft.endpoint.trim() && preflight.protocol === draft.protocol);
  const checks = [
    { id: 'name', label: 'A clear name', done: draft.name.trim().length >= 3 && draft.name.trim().length <= 80, hint: '3 to 80 characters' },
    { id: 'description', label: 'An outcome-led description', done: draft.description.trim().length >= 40 && draft.description.trim().length <= 600, hint: '40 to 600 characters: what it returns, for whom, and what it will not do' },
    {
      id: 'category',
      label: 'A marketplace category',
      done: CATEGORIES.some((c) => c.id === draft.category) || draft.category === NO_CATEGORY,
      hint: 'So buyers searching by outcome can find it, or say none fits',
    },
    { id: 'endpoint', label: 'An endpoint that answers', done: endpointChecked, hint: 'Checked by Pokter the way a hire would call it' },
    { id: 'image', label: 'A public image', done: /^https:\/\//i.test(image) && image.length <= 2048, hint: 'An https image, or the generated one' },
  ];
  const ready = checks.every((c) => c.done) && !repositoryProblem;

  const runtimeOptions = RUNTIME_OPTIONS[draft.category];
  const runtime = useMemo(() => {
    const fallback = runtimeOptions ? { target: runtimeOptions.target[0], policy: runtimeOptions.policy[0], output: runtimeOptions.output[0] } : { target: '', policy: '', output: '' };
    if (runtimeChoice.category !== draft.category) return fallback;
    return { target: runtimeChoice.target || fallback.target, policy: runtimeChoice.policy || fallback.policy, output: runtimeChoice.output || fallback.output };
  }, [draft.category, runtimeChoice, runtimeOptions]);
  const chooseRuntime = (key: 'target' | 'policy' | 'output', value: string) => setRuntimeChoice({ ...runtime, category: draft.category, [key]: value });

  const buildPrompt = useMemo(
    () =>
      createAgentBuildPrompt({
        name: draft.name.trim(),
        description: draft.description.trim(),
        category: CATEGORIES.find((c) => c.id === draft.category)?.label ?? '',
        protocol: draft.protocol,
        target: runtime.target,
        policy: runtime.policy,
        output: runtime.output,
      }),
    [draft, runtime],
  );

  const registrationFile = useMemo(
    () =>
      ({
        type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
        name: draft.name.trim(),
        description: draft.description.trim(),
        image,
        services: [
          { name: draft.protocol.toUpperCase(), endpoint: draft.endpoint.trim() },
          ...(draft.repository.trim() ? [{ name: 'repository', endpoint: draft.repository.trim() }] : []),
        ],
        registrations: [],
        /*
         * Only a real category is written. `NO_CATEGORY` is the
         * publisher's answer to the form, not a tag — writing "none"
         * into the registry would put the word in front of every reader
         * and every other marketplace's classifier.
         */
        tags: CATEGORIES.some((c) => c.id === draft.category) ? [draft.category] : [],
        categories: CATEGORIES.some((c) => c.id === draft.category) ? [draft.category] : [],
        x402Support: false,
        active: true,
        supportedTrust: ['reputation'],
        // Made here, so it says so in the registry, where every marketplace reads it.
        ...builtWithPokter,
      }) as Erc8004RegistrationFile,
    [draft, image],
  );

  async function runPreflight() {
    setPreflightBusy(true);
    setPreflightError(null);
    setPreflight(null);
    try {
      const response = await fetch('/api/builders/preflight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: draft.endpoint.trim(), protocol: draft.protocol }),
      });
      const payload = (await response.json().catch(() => ({}))) as EndpointPreflight & { error?: string };
      if (response.status === 429) throw new Error('Too many checks from this connection. Wait a minute.');
      if (!response.ok) throw new Error(payload.error ?? 'The endpoint check could not be completed.');
      setPreflight(payload);
    } catch (reason) {
      setPreflightError((reason as Error).message);
    } finally {
      setPreflightBusy(false);
    }
  }

  async function runTrial() {
    if (!endpointChecked) return;
    setTrialBusy(true);
    setTrial(null);
    setTrialError(null);
    try {
      const response = await fetch('/api/builders/trial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: draft.endpoint.trim(), protocol: draft.protocol, task: trialTask.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as BuilderTrial & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.summary ?? 'The preview request failed.');
      setTrial(payload);
    } catch (reason) {
      setTrialError((reason as Error).message);
    } finally {
      setTrialBusy(false);
    }
  }

  const passkeyCanPublish = Boolean(passkeyWallet && passkeySigner && !externalConnected);
  const signingAddress = (externalConnected ? externalAddress : passkeyWallet?.address) ?? null;
  const funding = useChainFunding((signingAddress as `0x${string}` | null) ?? null);

  /*
   * A passkey wallet signs this too, now that the signature asked for is
   * the one its account can make. The owner is the smart account, so the
   * wallet it just registered from is the wallet that must sign — passing
   * it through means an injected wallet also connected to this page
   * cannot be prompted for an identity it does not own.
   */
  async function claimAccessFor(record: PublishedRecord): Promise<ClaimOutcome> {
    return claimStudioSession({
      chainId: record.chainId,
      tokenId: record.tokenId,
      passkey: passkeyCanPublish ? passkeyWallet : null,
    });
  }

  async function publish() {
    if (!ready) return;
    if (network === 56 && !mainnetConsent) {
      setPublishError('Confirm the BNB Chain mainnet transaction and its gas cost first.');
      return;
    }
    setPublishing(true);
    setPublishError(null);
    /* Before the first signature, so a remount at any point after it can
       find this draft again. */
    rememberActiveRegistration(draftId);
    try {
      const compatible = recovery?.chainId === network ? recovery : undefined;
      const result = await registerIdentityFromWallet({
        chainId: network,
        file: registrationFile,
        recovery: compatible,
        signer:
          passkeyCanPublish && passkeyWallet && passkeySigner
            ? passkeyRegistrySigner({ wallet: { address: passkeyWallet.address }, signer: passkeySigner, chainId: network })
            : undefined,
        onProgress: (p) => {
          setProgress(p);
          if (p.registrationHash || p.agentId) {
            const r: RegistrationRecovery = { chainId: p.chainId, registrationHash: p.registrationHash, agentId: p.agentId };
            setRecovery(r);
            try {
              window.localStorage.setItem(recoveryKey(draftId), JSON.stringify(r));
            } catch {
              /* Recovery then only lasts this session. */
            }
          }
        },
      });
      const record: PublishedRecord = {
        chainId: network,
        tokenId: result.agentId.toString(),
        name: draft.name.trim(),
      };
      setPublished(record);
      setRecovery(null);
      try {
        window.localStorage.setItem(publishedKey(draftId), JSON.stringify(record));
      } catch {
        /* Then it only survives this render, as it did before. */
      }
      try {
        window.localStorage.removeItem(recoveryKey(draftId));
        const stored = window.localStorage.getItem(DRAFTS_KEY);
        if (stored) {
          const record = JSON.parse(stored) as DraftRecord;
          delete record[draftId];
          window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(record));
          announceDraftsChanged();
        }
      } catch {
        /* Draft stays listed; harmless. */
      }
      /*
       * Studio access, asked for here rather than on a separate page.
       * Registering and then being told to "verify ownership to manage
       * this agent" is Pokter failing to notice its own transaction. The
       * signature is still required — a registration transaction is
       * public, so accepting its hash as proof would let anyone claim
       * somebody else's agent — but it is asked once, now, while the
       * wallet that paid for the mint is still open.
       *
       * After the record is written, not before: a prompt the reader
       * leaves open is time in which the tab can reload, and losing the
       * registration to that would be the bug this flow already fixed.
       */
      setClaim('claiming');
      setClaim(await claimAccessFor(record));
    } catch (reason) {
      const message = (reason as Error).message ?? 'The identity could not be published.';
      setPublishError(/reject|denied|cancel|NotAllowed/i.test(message) ? 'You declined in the wallet. Nothing was registered.' : message);
    } finally {
      setPublishing(false);
    }
  }

  return {
    draftId,
    saveStatus,
    draft,
    update,
    replace,
    step,
    setStep,
    plan,
    /*
     * A change of manner, and nothing else.
     *
     * Nothing about the draft, the step, the preflight or the trial is
     * touched here, which is the guarantee the switch makes on screen:
     * switching mid-brief keeps the brief. The choice is also remembered
     * for the next draft on this device.
     */
    setStyle: (style: BuildStyle) => {
      rememberStyle(style);
      setPlan((current) => ({ ...current, style }));
    },
    /*
     * Taking a proposed concept fills only what is still blank — a name
     * the builder already typed is never replaced by a suggestion.
     */
    acceptConcept: (concept: AgentConcept) => {
      setPlan((current) => ({ ...current, conceptId: concept.id }));
      setDraft((current) => applyConcept(concept, current));
    },
    /** "I already know what to build": stop offering, and do not guess what. */
    dismissProposals: () => setPlan((current) => ({ ...current, proposalsDismissed: true })),
    /** Back to the proposals, with whatever has been typed left alone. */
    restoreProposals: () => setPlan((current) => ({ ...current, proposalsDismissed: false, conceptId: null })),
    avatarSeeds,
    image,
    repositoryProblem,
    checks,
    ready,
    runtimeOptions,
    runtime,
    chooseRuntime,
    buildPrompt,
    registrationFile,
    downloadRegistrationFile: () => download(`${slug(draft.name)}-registration.json`, registrationFile),
    downloadRuntimeConfig: () =>
      download(`${slug(draft.name)}-runtime-config.json`, {
        schema: 'https://pokter.xyz/schemas/starter-config-v1',
        agent: draft.name.trim(),
        category: draft.category,
        protocol: draft.protocol,
        behavior: runtime,
        note: 'Your runtime must implement and enforce these choices. Pokter verifies the public endpoint independently.',
      }),
    preflight,
    preflightBusy,
    preflightError,
    runPreflight,
    endpointChecked,
    trialCapability: selectTrialCapability(preflight?.capabilities ?? []),
    trialTask,
    setTrialTask,
    trial,
    trialBusy,
    trialError,
    runTrial,
    network,
    setNetwork,
    mainnetConsent,
    setMainnetConsent,
    passkeyCanPublish,
    signingAddress,
    externalConnected,
    funding,
    recovery,
    progress,
    publishing,
    publishError,
    published,
    /*
     * The way out of a finished registration.
     *
     * The in-flight record outlives the flow on purpose, so a remount
     * cannot lose a mint — which means somebody registering a second
     * agent within the hour would otherwise be handed the first one's
     * success panel. This forgets it, clears what was stored for this
     * draft and empties the form. The draft id stays, which is harmless
     * now that nothing is filed under it.
     */
    startAnother: () => {
      forgetActiveRegistration();
      try {
        window.localStorage.removeItem(publishedKey(draftId));
        window.localStorage.removeItem(recoveryKey(draftId));
      } catch {
        /* The state reset below is what the reader sees either way. */
      }
      setPublished(null);
      setRecovery(null);
      setProgress(null);
      setPublishError(null);
      setClaim(null);
      setDraft({ ...EMPTY_DRAFT });
      setStep(0);
      /* A second agent is a second idea: the proposals come back, and the
         style they chose for themselves stays as it is. */
      setPlan((current) => ({ ...DEFAULT_PLAN, style: current.style }));
    },
    claim,
    claimAccess: async () => {
      if (!published) return;
      setClaim('claiming');
      setClaim(await claimAccessFor(published));
    },
    publish,
    discardRecovery: () => {
      forgetActiveRegistration();
      setRecovery(null);
      setProgress(null);
      try {
        window.localStorage.removeItem(recoveryKey(draftId));
      } catch {
        /* Nothing stored. */
      }
    },
  };
}

export type AgentDraft = ReturnType<typeof useAgentDraft>;
