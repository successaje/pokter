'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { briefMessage, type BriefContent } from '@/lib/briefs/model';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { escrowMoney } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { Icon } from '@/ui/icons';
import { BnbMark } from '@/ui/Network';
import { RequestTerms } from './RequestTerms';

const DRAFT_KEY = 'pokter.request-draft-v1';

const DELIVERY_OPTIONS = [1, 2, 3, 5, 7, 14, 30];
/* Days from publishing; 0 keeps the request open until a proposal is chosen. */
const CLOSING_OPTIONS = [0, 3, 7, 14, 30];

interface Draft {
  title: string;
  brief: string;
  acceptance: string;
  failSignals: string;
  budget: string;
  chainId: number;
  deliverDays: number;
  closesInDays: number;
  savedAt?: string;
}

type Problems = Partial<Record<'title' | 'brief' | 'acceptance' | 'budget', string>>;

const lines = (value: string) => value.split('\n').map((l) => l.trim()).filter(Boolean);

/**
 * Post a request: a page with the form beside the card builders will see.
 *
 * The first screen asks for five things — title, task, what counts as
 * done, budget and delivery — and folds the rest away. "Done when" stays
 * up front although it is the field people most want to skip: it is what
 * a builder prices against and what a delivery is later checked against,
 * and a request without it is a wish.
 *
 * Publishing is a separate step because it is the one that cannot be
 * undone: the wallet signs these exact terms, and from then on they are
 * public and fixed. The review shows the request through the same
 * component its page uses, so what is approved is what builders read.
 */
export function RequestForm({ networks }: { networks: number[] }) {
  const router = useRouter();
  const { openConnect } = useConnect();
  const { address, canSign, sign } = useActiveSigner();

  const empty: Draft = { title: '', brief: '', acceptance: '', failSignals: '', budget: '', chainId: networks[0] ?? 97, deliverDays: 3, closesInDays: 0 };
  const [draft, setDraft] = useState<Draft>(empty);
  const [restored, setRestored] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [step, setStep] = useState<'write' | 'review'>('write');
  const [problems, setProblems] = useState<Problems>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* A saved draft lives in this browser only, so it is read after mount. */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Draft;
      if (!networks.includes(saved.chainId)) saved.chainId = networks[0] ?? 97;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from browser storage
      setDraft({ ...empty, ...saved });
      setRestored(saved.savedAt ?? null);
    } catch {
      /* Storage unavailable or unreadable: start empty. */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSavedAt(null);
    if (key in problems) setProblems((p) => ({ ...p, [key]: undefined }));
  };

  const content: BriefContent = useMemo(
    () => ({
      title: draft.title.trim(),
      brief: draft.brief.trim(),
      acceptance: lines(draft.acceptance),
      failSignals: lines(draft.failSignals),
      budgetU: Number(draft.budget) > 0 ? Number(draft.budget) : 0,
      chainId: draft.chainId,
      deliverDays: draft.deliverDays,
      closesAt: draft.closesInDays > 0 ? closingFromNow(draft.closesInDays) : null,
    }),
    [draft],
  );

  const saveDraft = () => {
    const at = new Date().toISOString();
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: at }));
      setSavedAt(at);
    } catch {
      setError('This browser would not save the draft.');
    }
  };

  const discardDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* Nothing to remove. */
    }
    setDraft(empty);
    setRestored(null);
    setSavedAt(null);
    setProblems({});
  };

  const review = () => {
    const found: Problems = {};
    if (!content.title) found.title = 'Give the request a title.';
    if (!content.brief) found.brief = 'Describe the work.';
    if (content.acceptance.length === 0) found.acceptance = 'Add at least one line: what the result must include.';
    if (!(Number(draft.budget) > 0)) found.budget = 'Propose a budget above zero.';
    setProblems(found);
    if (Object.keys(found).length > 0) {
      /* Take the poster to the first thing to fix, which may be above the button they pressed. */
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setError(null);
    setStep('review');
    window.scrollTo({ top: 0 });
  };

  const publish = async () => {
    if (!address || !canSign) {
      openConnect('to sign and publish this request');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const postedAt = new Date().toISOString();
      /* The closing time is fixed now, at signing, rather than when the review opened. */
      const terms: BriefContent = { ...content, closesAt: draft.closesInDays > 0 ? closingFromNow(draft.closesInDays) : null };
      const signature = await sign(briefMessage({ ...terms, poster: address, postedAt }));
      const response = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ poster: address, signature, postedAt, content: terms }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; brief?: { id: string } };
      if (!response.ok || !payload.brief) throw new Error(payload.error ?? 'The request was not published.');
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* The request is live either way. */
      }
      router.push(`/requests/${payload.brief.id}?posted=1`);
    } catch (caught) {
      const message = (caught as Error).message || 'The request was not published.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing was published.' : message);
      setBusy(false);
    }
  };

  if (step === 'review') {
    return (
      <div className="flex max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-1.5">
          <span className="t-label">Preview · as builders will see it</span>
          <p className="text-[14px] text-ink-2">Check it reads the way you mean it. Once published, these terms can&rsquo;t be edited.</p>
        </div>
        <div className="rounded-[18px] border border-rule bg-raised p-6 sm:p-8">
          <RequestTerms heading="h2" content={content} byline={address ? <>Posted by your wallet · 0 proposals</> : 'Posted by your wallet'} />
        </div>
        <div className="flex flex-col gap-3">
          <Notice title="Publishing does not fund a job">
            You&rsquo;ll review the price and terms before funding your chosen agent. Choosing a proposal moves no money either.
          </Notice>
          <Notice tone="watch" title="This request will be public">
            Anyone can read it, and it carries your wallet address and signature. It is stored by Pokter, not on chain. You can
            withdraw it while it is open; it then stays visible, marked withdrawn, for the builders who answered it.
          </Notice>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex flex-col-reverse gap-3 border-t border-rule pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button intent="secondary" onClick={() => setStep('write')} disabled={busy} icon={<Icon.ChevronLeft size={15} />}>
            Edit
          </Button>
          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
            <Button onClick={publish} busy={busy}>
              {busy ? 'Approve in your wallet' : address && canSign ? 'Publish request' : 'Connect a wallet to publish'}
            </Button>
            <span className="text-[12px] text-ink-3">A signature, not a transaction. No fee.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        {restored !== null && (
          <Notice
            title="Your saved draft"
            action={
              <Button size="s" intent="ghost" onClick={discardDraft}>
                Discard and start over
              </Button>
            }
          >
            Restored from this browser{restored ? `, saved ${new Date(restored).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}.
          </Notice>
        )}

        <Field label="Task title" error={problems.title}>
          {(p) => <Input {...p} value={draft.title} maxLength={120} onChange={(e) => set('title', e.target.value)} placeholder="Compare lending rates on Venus and Aave" />}
        </Field>

        <Field label="What do you need?" hint="What should the agent do, what information should it use, and what should it deliver?" error={problems.brief}>
          {(p) => (
            <Textarea
              {...p}
              value={draft.brief}
              maxLength={4000}
              onChange={(e) => set('brief', e.target.value)}
              className="min-h-44"
              placeholder="Compare USDT supply rates on Venus and Aave from on-chain data, and deliver a table with each rate and its source."
            />
          )}
        </Field>

        <Field label="Done when" hint="One line each: what the result must include to be accepted. Builders price against this." error={problems.acceptance}>
          {(p) => (
            <Textarea
              {...p}
              value={draft.acceptance}
              onChange={(e) => set('acceptance', e.target.value)}
              className="min-h-24"
              placeholder={'Every market has a rate and a source link\nRates are no older than 24 hours'}
            />
          )}
        </Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1.5 text-sm font-medium text-ink">Your proposed budget</legend>
          <NetworkChoice networks={networks} value={draft.chainId} onChange={(id) => set('chainId', id)} />
          <Field label={<span className="sr-only">Amount</span>} hint="What you expect to pay. Builders may propose another price; you fund only the one you choose." error={problems.budget}>
            {(p) => (
              <div className="relative">
                <Input {...p} value={draft.budget} inputMode="decimal" onChange={(e) => set('budget', decimalOnly(e.target.value))} placeholder="5.00" className="t-readout pr-14 text-[17px]" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">$U</span>
              </div>
            )}
          </Field>
        </fieldset>

        <Field label="Delivery time" hint="How soon after hiring do you need the result?">
          {(p) => (
            <Select {...p} value={draft.deliverDays} onChange={(e) => set('deliverDays', Number(e.target.value))}>
              {DELIVERY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  Within {d === 1 ? '1 day' : `${d} days`} of hiring
                </option>
              ))}
            </Select>
          )}
        </Field>

        <details className="group rounded-[12px] border border-rule">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14px] font-medium [&::-webkit-details-marker]:hidden">
            <span>
              More options
              <span className="ml-2 font-normal text-ink-3">Proposal deadline, what to reject</span>
            </span>
            <Icon.ChevronDown size={16} className="text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-5 border-t border-rule px-4 py-4">
            <Field label="Proposals close" hint="How long builders have to send a proposal. Separate from the delivery time.">
              {(p) => (
                <Select {...p} value={draft.closesInDays} onChange={(e) => set('closesInDays', Number(e.target.value))}>
                  {CLOSING_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d === 0 ? 'When I choose one' : `In ${d} days`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Rejected if" optional hint="One per line. What would make a delivery wrong, not just incomplete.">
              {(p) => (
                <Textarea
                  {...p}
                  value={draft.failSignals}
                  onChange={(e) => set('failSignals', e.target.value)}
                  className="min-h-20"
                  placeholder="Rates are estimated rather than read from the protocol"
                />
              )}
            </Field>
          </div>
        </details>

        {error && <Notice tone="bad">{error}</Notice>}

        <div className="flex flex-col-reverse gap-3 border-t border-rule pt-5 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-3">
            <Button intent="secondary" onClick={saveDraft}>
              Save draft
            </Button>
            {savedAt && (
              <span role="status" className="inline-flex items-center gap-1 text-[12.5px] text-ok">
                <Icon.Check size={13} /> Saved in this browser
              </span>
            )}
          </span>
          <Button onClick={review} trailing={<Icon.Arrow size={15} />}>
            Preview request
          </Button>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24 flex flex-col gap-5">
          <span className="t-label">On the Requests board</span>
          <BoardCard content={content} />
          <ol className="flex flex-col gap-3 text-[13px] leading-snug text-ink-2">
            {[
              ['Builders send proposals', 'Each names an agent, a price and a delivery time, signed by the agent’s owner.'],
              ['You choose one', 'Compare price, approach and delivery record. Choosing moves no money.'],
              ['You fund the hire', 'The agent signs a quote for this exact task; you review it and fund the escrow yourself.'],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="t-readout grid size-5 shrink-0 place-items-center rounded-full bg-sunken text-[11px] text-ink">{i + 1}</span>
                <span>
                  <span className="font-medium text-ink">{title}.</span> {body}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-[12.5px] text-ink-3">
            Or skip the wait: <Link href="/discover" className="text-ink-2 underline underline-offset-2 hover:text-ink">hire a listed agent directly</Link>.
          </p>
        </div>
      </aside>
    </div>
  );
}

/** Mainnet and testnet as two unmistakable options: the mark, the name, and whether the money is real. */
function NetworkChoice({ networks, value, onChange }: { networks: number[]; value: number; onChange: (chainId: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Network" className={cn('grid gap-2', networks.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
      {networks.map((chainId) => {
        const selected = chainId === value;
        const money = escrowMoney(chainId);
        return (
          <button
            key={chainId}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={networks.length === 1}
            onClick={() => onChange(chainId)}
            className={cn(
              'flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-[border-color,box-shadow] disabled:cursor-default',
              networks.length === 1 ? 'border-rule bg-raised' : selected ? 'border-ink bg-raised shadow-[0_0_0_1px_var(--ink)]' : 'border-rule-strong bg-raised hover:border-ink-3',
            )}
          >
            <BnbMark size={22} />
            <span className="flex min-w-0 flex-col">
              <span className="text-[14px] font-semibold text-ink">{chainId === 56 ? 'BNB Chain' : 'BNB Testnet'}</span>
              <span className={cn('text-[12px]', money.real === false ? 'font-medium text-watch' : 'text-ink-3')}>
                {money.real === false ? 'Test tokens, no real value' : 'Real $U'}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The request as it will sit on /requests, updating as the poster types. */
function BoardCard({ content }: { content: BriefContent }) {
  const money = escrowMoney(content.chainId);
  return (
    <div aria-hidden className="flex flex-col gap-3 rounded-[16px] border border-rule bg-raised p-5 shadow-lift">
      <span className="flex items-start justify-between gap-3">
        <span className={cn('break-words text-[16px] font-semibold tracking-[-0.015em]', !content.title && 'text-ink-3')}>{content.title || 'Your title'}</span>
        <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-ok/30 bg-ok-wash px-2.5 text-[12px] font-medium text-ok">Open</span>
      </span>
      <span className={cn('line-clamp-3 break-words text-[13.5px] leading-relaxed', content.brief ? 'text-ink-2' : 'text-ink-3')}>
        {content.brief || 'What you need, in a sentence or two.'}
      </span>
      <span className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-rule pt-3 text-[12.5px] text-ink-3">
        <span className="t-readout text-[15px] text-ink">{content.budgetU > 0 ? formatQuotedPrice(content.budgetU) : '— $U'}</span>
        <span>deliver in {content.deliverDays === 1 ? '1 day' : `${content.deliverDays} days`}</span>
        <span className={money.real === false ? 'font-medium text-watch' : undefined}>{money.network}</span>
        <span className="ml-auto">0 proposals</span>
      </span>
    </div>
  );
}

/** Digits and one decimal point, so a stray keystroke cannot make the amount unreadable. */
function decimalOnly(value: string): string {
  const [whole, ...rest] = value.replace(/[^\d.]/g, '').split('.');
  return rest.length > 0 ? `${whole}.${rest.join('')}` : whole;
}

function closingFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
