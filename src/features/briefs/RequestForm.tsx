'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { amountWithinLimits, budgetLimitsFor } from '@/lib/hire/budget-limits';
import { amountToRaw, briefMessage, listProblem, REQUEST_CATEGORIES, type BriefContent, type RequestCategory } from '@/lib/briefs/model';
import { escrowMoney } from '@/lib/network/presentation';
import { defaultHireToken, displaySymbol, hireTokenAt, offeredTokens, tokenIdentity, tokenName, type PaymentToken } from '@/lib/network/tokens';
import { cn } from '@/lib/ui/cn';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { Icon } from '@/ui/icons';
import { BnbMark } from '@/ui/Network';
import { RequestRow } from './RequestRow';
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
  /**
   * The token the budget is in, by address; null is the chain's $U. Drafts
   * saved before requests had a token have none, and $U is the only thing
   * that form could have meant.
   */
  paymentToken?: string | null;
  deliverDays: number;
  closesInDays: number;
  category: RequestCategory | null;
  savedAt?: string;
}

type Problems = Partial<Record<'title' | 'brief' | 'acceptance' | 'failSignals' | 'budget', string>>;

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
export function RequestForm({ networks, initialTitle = '' }: { networks: number[]; initialTitle?: string }) {
  const router = useRouter();
  const { openConnect } = useConnect();
  const { address, canSign, sign } = useActiveSigner();

  const empty: Draft = { title: initialTitle, brief: '', acceptance: '', failSignals: '', budget: '', chainId: networks[0] ?? 97, paymentToken: null, deliverDays: 3, closesInDays: 0, category: null };
  const [draft, setDraft] = useState<Draft>(empty);
  const [restored, setRestored] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [step, setStep] = useState<'write' | 'review'>('write');
  const [openedAt] = useState(() => Date.now());
  const moreOptions = useRef<HTMLDetailsElement>(null);
  const [problems, setProblems] = useState<Problems>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* A saved draft lives in this browser only, so it is read after mount. */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Draft;
      /*
       * Arriving from a search with nothing typed into this form before:
       * the search is the title. A draft somebody was writing wins over it,
       * because overwriting unfinished work to save typing a title is the
       * wrong trade; the search is a click away.
       */
      if (initialTitle && !saved.title?.trim() && !saved.brief?.trim()) return;
      if (!networks.includes(saved.chainId)) saved.chainId = networks[0] ?? 97;
      /* A token turned off since the draft was saved, or one on the other network, is dropped rather than kept unpayable. */
      if (saved.paymentToken && !hireTokenAt(saved.chainId, saved.paymentToken)) saved.paymentToken = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from browser storage
      setDraft({ ...empty, ...saved });
      setRestored(saved.savedAt ?? null);
    } catch {
      /* Storage unavailable or unreadable: start empty. */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The money the budget is in: the chosen token if it is offered on the chosen network, else that network's $U. */
  const token: PaymentToken | null = (draft.paymentToken ? hireTokenAt(draft.chainId, draft.paymentToken) : null) ?? defaultHireToken(draft.chainId);
  const tokens = offeredTokens(draft.chainId);
  const limits = token ? budgetLimitsFor(token) : null;
  const symbol = token ? displaySymbol(token) : '';

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      /* Switching network keeps the token only where it is offered on the new one. */
      if (key === 'chainId' && next.paymentToken && !hireTokenAt(next.chainId, next.paymentToken)) next.paymentToken = null;
      return next;
    });
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
      paymentToken: token?.address ?? null,
      budgetRaw: (token && Number(draft.budget) > 0 ? amountToRaw(Number(draft.budget), token.decimals) : null)?.toString() ?? '0',
      chainId: draft.chainId,
      deliverDays: draft.deliverDays,
      closesAt: draft.closesInDays > 0 ? closingFromNow(draft.closesInDays) : null,
      category: draft.category,
    }),
    [draft, token],
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
    else if (listProblem(content.acceptance)) found.acceptance = listProblem(content.acceptance)!;
    if (listProblem(content.failSignals)) found.failSignals = listProblem(content.failSignals)!;
    /* The limits in the chosen token's own units, checked on the exact amount that will be signed. */
    const raw = token ? amountToRaw(Number(draft.budget), token.decimals) : null;
    if (!token || !limits) found.budget = 'This network has no token Pokter can fund a hire with.';
    else if (raw === null || !draft.budget || !amountWithinLimits(token, raw).ok) found.budget = `Propose between ${limits.min} and ${limits.max} ${symbol}, the most one hire can be funded with today.`;
    setProblems(found);
    if (Object.keys(found).length > 0) {
      /* A problem under More options is opened up, or the focus below would land on a hidden field. */
      if (found.failSignals && moreOptions.current) moreOptions.current.open = true;
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

        {/* One tap, and optional: it is what the board filters on, so it earns its place on the first screen. */}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 flex w-full items-baseline justify-between text-sm font-medium text-ink">
            <span>Category</span>
            <span className="text-xs font-normal text-ink-3">Optional</span>
          </legend>
          <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-2">
            {REQUEST_CATEGORIES.map((c) => {
              const on = draft.category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set('category', on ? null : c.id)}
                  className={cn(
                    'h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                    on ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:border-ink-3 hover:text-ink',
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </fieldset>

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

        {/* Amount and network as one line — "1.50 $U on BNB Chain" — with what the money is said right under it. */}
        <Field
          label="Your proposed budget"
          error={problems.budget}
          hint={
            <>
              <span className={escrowMoney(draft.chainId).real === false ? 'font-medium text-watch' : undefined}>
                {escrowMoney(draft.chainId).real === false ? 'Test tokens, no real value.' : `Real ${symbol} on BNB Chain.`}
              </span>{' '}
              {token?.disclosure ? `${symbol} here is ${token.disclosure}. ` : ''}
              Up to {limits?.max} {symbol} per job. Builders propose in the same token; you fund only the one you choose.
            </>
          }
        >
          {(p) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="relative">
                <Input {...p} value={draft.budget} inputMode="decimal" onChange={(e) => set('budget', decimalOnly(e.target.value))} placeholder="1.00" className="t-readout pr-16 text-[17px]" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">{symbol}</span>
              </div>
              <NetworkChoice networks={networks} value={draft.chainId} onChange={(id) => set('chainId', id)} />
            </div>
          )}
        </Field>

        {/* Only when there is a choice: with $U alone offered, a one-option picker is noise. */}
        {tokens.length > 1 && token && (
          <TokenChoice tokens={tokens} value={token.address} onChange={(address) => set('paymentToken', address)} />
        )}

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

        <details ref={moreOptions} className="group rounded-[12px] border border-rule">
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
            <Field label="Rejected if" optional hint="One per line. What would make a delivery wrong, not just incomplete." error={problems.failSignals}>
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
          <RequestRow preview now={openedAt} request={{ ...content, id: 'preview', poster: address ?? 'new-request', postedAt: '', proposals: 0, state: 'open' }} />
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

/**
 * The network, beside the amount it qualifies. A segmented pair, mainnet
 * first; the line under the field says whether the money is real, in the
 * warning colour when it is not, so the two never look alike.
 */
function NetworkChoice({ networks, value, onChange }: { networks: number[]; value: number; onChange: (chainId: number) => void }) {
  const ordered = [...networks].sort((a, b) => (a === 56 ? -1 : b === 56 ? 1 : 0));
  if (ordered.length === 1) {
    return (
      <span className="inline-flex h-11 items-center gap-2 rounded-[9px] border border-rule bg-sunken px-3 text-[13.5px] font-medium text-ink-2">
        <BnbMark size={16} /> {ordered[0] === 56 ? 'BNB Chain' : 'Testnet'}
      </span>
    );
  }
  return (
    <div role="radiogroup" aria-label="Network" className="inline-flex h-11 rounded-[9px] border border-rule-strong bg-sunken p-1">
      {ordered.map((chainId) => {
        const selected = chainId === value;
        return (
          <button
            key={chainId}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(chainId)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 text-[13.5px] font-medium transition-colors',
              selected ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-3 hover:text-ink',
            )}
          >
            {chainId === 56 && <BnbMark size={15} />}
            {chainId === 56 ? 'BNB Chain' : 'Testnet'}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The money the budget is in, when this network offers more than $U.
 *
 * Separate from the amount on purpose: the proposals answering the request,
 * and the hire that follows, are all in this token, so it is a term of the
 * request and not a display unit. Each option is named by symbol and the
 * contract it is, since a symbol alone is only a label.
 */
function TokenChoice({ tokens, value, onChange }: { tokens: PaymentToken[]; value: string; onChange: (address: string) => void }) {
  const selected = tokens.find((t) => t.address === value);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-ink">Paid in</legend>
      <div role="radiogroup" aria-label="Paid in" className="flex flex-wrap gap-2">
        {tokens.map((t) => {
          const on = t.address === value;
          return (
            <button
              key={t.address}
              type="button"
              role="radio"
              aria-checked={on}
              title={t.address}
              onClick={() => onChange(t.address)}
              className={cn(
                'h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                on ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:border-ink-3 hover:text-ink',
              )}
            >
              {tokenName(t)}
            </button>
          );
        })}
      </div>
      {selected && (
        <span className="t-readout wrap-anywhere text-[12px] text-ink-3">
          {tokenIdentity(selected)}{selected.disclosure ? ` · ${selected.disclosure}` : ''}
        </span>
      )}
    </fieldset>
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
