'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Erc8004RegistrationFile } from '@altananetwork/sdk';
import { useAccount } from 'wagmi';

import { CATEGORIES } from '@/lib/agents/categories';
import { createAgentBuildPrompt } from '@/lib/builder/ai-prompt';
import { DRAFTS_KEY, announceDraftsChanged, isDraftEmpty, upsertDraft, type DraftFields, type DraftRecord, type StoredDraft } from '@/lib/builder/drafts';
import { selectTrialCapability } from '@/lib/builder/trial';
import { passkeyRegistrySigner } from '@/lib/registry/passkey-signer';
import { registerIdentityFromWallet, type RegistrationProgress, type RegistrationRecovery, type RegistryChainId } from '@/lib/registry/register';
import { avatarUrl } from '@/lib/ui/avatar-art';
import { usePasskeySigner, usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { useChainFunding } from '@/lib/wallet/use-chain-funding';
import { siteUrlClient } from './site';

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

function readRecovery(): RegistrationRecovery | null {
  try {
    const stored = window.localStorage.getItem(REGISTRATION_RECOVERY_KEY);
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
export function useAgentDraft(initial?: StoredDraft | null) {
  const [draftId] = useState(() => initial?.id ?? `draft-${Date.now()}`);
  const [draft, setDraft] = useState<Draft>(() => ({ ...EMPTY_DRAFT, ...(initial?.draft ?? {}) }));
  const [step, setStep] = useState(initial?.step ?? 0);
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
  const [recovery, setRecovery] = useState<RegistrationRecovery | null>(null);
  const [network, setNetwork] = useState<RegistryChainId>(97);
  const [mainnetConsent, setMainnetConsent] = useState(false);
  const [progress, setProgress] = useState<RegistrationProgress | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ chainId: RegistryChainId; tokenId: string } | null>(null);

  useEffect(() => {
    const r = readRecovery();
    if (r) {
      setRecovery(r);
      setNetwork(r.chainId);
    }
  }, []);

  // Autosave every meaningful change to this device.
  useEffect(() => {
    if (isDraftEmpty(draft) || published) return;
    try {
      const stored = window.localStorage.getItem(DRAFTS_KEY);
      const record = stored ? (JSON.parse(stored) as DraftRecord) : {};
      window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(upsertDraft(record, { id: draftId, draft, mode: 'new', step, updatedAt: new Date().toISOString() })));
      announceDraftsChanged();
    } catch {
      /* Storage full or blocked: the draft lives for this session only. */
    }
  }, [draft, draftId, step, published]);

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
    { id: 'category', label: 'A marketplace category', done: CATEGORIES.some((c) => c.id === draft.category), hint: 'So buyers searching by outcome can find it' },
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
        category: CATEGORIES.find((c) => c.id === draft.category)?.label ?? draft.category,
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
        tags: draft.category ? [draft.category] : [],
        categories: draft.category ? [draft.category] : [],
        x402Support: false,
        active: true,
        supportedTrust: ['reputation'],
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

  async function publish() {
    if (!ready) return;
    if (network === 56 && !mainnetConsent) {
      setPublishError('Confirm the BNB Chain mainnet transaction and its gas cost first.');
      return;
    }
    setPublishing(true);
    setPublishError(null);
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
              window.localStorage.setItem(REGISTRATION_RECOVERY_KEY, JSON.stringify(r));
            } catch {
              /* Recovery then only lasts this session. */
            }
          }
        },
      });
      setPublished({ chainId: network, tokenId: result.agentId.toString() });
      setRecovery(null);
      try {
        window.localStorage.removeItem(REGISTRATION_RECOVERY_KEY);
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
    } catch (reason) {
      const message = (reason as Error).message ?? 'The identity could not be published.';
      setPublishError(/reject|denied|cancel|NotAllowed/i.test(message) ? 'You declined in the wallet. Nothing was registered.' : message);
    } finally {
      setPublishing(false);
    }
  }

  return {
    draftId,
    draft,
    update,
    replace,
    step,
    setStep,
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
    publish,
  };
}

export type AgentDraft = ReturnType<typeof useAgentDraft>;
