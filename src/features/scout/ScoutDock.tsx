'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { agentRefFromPath, CONSENT_VERSION, handoffMailto, MESSAGE_LIMIT, TURN_LIMIT, type AgentRef, type ScoutLink, type ScoutTurn } from '@/lib/scout/web-chat';
import { SUPPORT_EMAIL } from '@/lib/support/contact';
import { holdsWalletSecret } from '@/lib/telegram/scout-routing';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/icons';

import { SCOUT_OPEN_EVENT, type ScoutOpen } from './open';
import { ScoutFigure } from './ScoutFigure';

/**
 * Scout, on every page: a quiet figure in the corner, and a chat beside it.
 *
 * Closed until someone asks. It never opens itself, never badges, and on a
 * phone it is a tab in the bar rather than a bubble over the page. On a
 * phone the panel takes the screen; on a wider one it sits above the
 * corner and leaves the page usable beside it.
 *
 * The conversation is kept in this browser and nowhere else. Each question
 * carries the last few turns to the server, which answers and forgets. The
 * first question waits for the visitor to accept a notice saying where it
 * goes, as Scout's Telegram chat does.
 */

type Subject = AgentRef & { name: string };
type Message =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string; links: ScoutLink[]; handoff: boolean; failed?: boolean }
  /** A line in the conversation that is not a turn: who it is about now. */
  | { id: string; role: 'note'; content: string };

type Saved = { consent: number; messages: Message[]; about: Subject | null };

const STORAGE_KEY = 'pokter.scout';
/* The corner figure: its width, its height at the mark's proportions, and its gap from the right edge. */
const FIGURE_W = 72;
const FIGURE_H = (FIGURE_W * 86) / 128;
const EDGE = 20;
/* How much of the figure stays in view while it is tucked aside: a hand and an eye. */
const PEEK = 26;
const KEEP = 40;

let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter += 1)}`;

function load(): Saved {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { consent: 0, messages: [], about: null };
    const saved = JSON.parse(raw) as Partial<Saved>;
    return {
      consent: typeof saved.consent === 'number' ? saved.consent : 0,
      messages: Array.isArray(saved.messages) ? saved.messages.slice(-KEEP) : [],
      about: saved.about && typeof saved.about.name === 'string' ? saved.about : null,
    };
  } catch {
    return { consent: 0, messages: [], about: null };
  }
}

function store(saved: Saved): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, messages: saved.messages.slice(-KEEP) }));
  } catch {
    /* Private windows and full storage: the chat still works, it just is not kept. */
  }
}

const sameAgent = (a: AgentRef | null, b: AgentRef | null) => !!a && !!b && a.chainId === b.chainId && a.tokenId === b.tokenId;
const phone = () => window.matchMedia('(max-width: 767px)').matches;

function suggestionsFor(about: Subject | null): string[] {
  if (about) return [`Explain ${about.name} in simple terms`, 'What have Pokter’s checks found?', 'How would I hire it?'];
  return ['How does hiring an agent work?', 'Find me an agent for research', 'What does “Replies reliably” mean?', 'What happens to my money when I hire?'];
}

export function ScoutDock() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [about, setAbout] = useState<Subject | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [met, setMet] = useState(false);
  const [tucked, setTucked] = useState(false);
  /* What Scout stands on: the bottom of the window, or a bar a page pins there. */
  const [floor, setFloor] = useState(0);

  const opener = useRef<HTMLElement | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);

  const consented = consent === CONSENT_VERSION;
  /* Read by the open listener, which is subscribed once. */
  const aboutNow = useRef<Subject | null>(null);
  const sendNow = useRef<(text: string, subject: Subject | null) => Promise<void>>(async () => {});
  const consentNow = useRef(0);
  const busyNow = useRef(false);
  useEffect(() => {
    aboutNow.current = about;
  }, [about]);

  useEffect(() => {
    const saved = load();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from browser storage after hydration; the server cannot know it
    setConsent(saved.consent);
    setMessages(saved.messages);
    setAbout(saved.about);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) store({ consent, messages, about });
  }, [ready, consent, messages, about]);

  /* Opened from a button elsewhere: maybe about an agent, maybe with a question. */
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<ScoutOpen>).detail ?? {};
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (detail.about) {
        const next = detail.about;
        if (!sameAgent(aboutNow.current, next)) setMessages((list) => (list.length ? [...list, { id: nextId(), role: 'note', content: `Now asking about ${next.name}` }] : list));
        setAbout(next);
      }
      setOpen(true);
      if (!detail.ask) return;
      /* Asked at once when the notice is already accepted; otherwise it waits for the notice. */
      if (consentNow.current !== CONSENT_VERSION) setPending(detail.ask);
      else if (busyNow.current) setDraft(detail.ask);
      else void sendNow.current(detail.ask, detail.about ?? null);
    };
    window.addEventListener(SCOUT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SCOUT_OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setAsking(false);
    const back = opener.current ?? launcher.current;
    opener.current = null;
    window.requestAnimationFrame(() => back?.focus());
  }, []);

  /* Escape closes; a phone's page does not scroll behind a panel that covers it. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    const root = document.documentElement;
    const locked = phone();
    if (locked) root.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      if (locked) root.style.overflow = '';
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const target = consented ? input.current : panel.current?.querySelector<HTMLElement>('[data-scout-accept]');
    target?.focus();
  }, [open, consented]);

  /*
   * Scout looks over the bottom edge of the window, the way the figure is
   * drawn: hands on the edge, face above it. Where a page pins a hire bar to
   * the bottom (an agent page between tablet and desktop width), it looks
   * over the bar instead.
   *
   * It never sits on something a page marks as not to be covered, the hire
   * panel above all: a figure over the money step is the one place it must
   * not be. Over one, Scout slides into the side of the screen with a hand
   * and an eye showing, and comes back out on hover or focus.
   */
  useEffect(() => {
    if (open) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const button = launcher.current;
      /* Hidden below tablet width, where Scout is a tab instead. Not offsetParent: a fixed element has none. */
      if (!button || button.getClientRects().length === 0) return setTucked(false);
      const bar = [...document.querySelectorAll<HTMLElement>('[data-hire-bar]')].map((el) => el.getBoundingClientRect()).find((r) => r.height > 0 && r.bottom >= window.innerHeight - 1);
      const base = bar ? Math.round(window.innerHeight - bar.top) : 0;
      setFloor(base);
      const own = { right: window.innerWidth - EDGE, left: window.innerWidth - EDGE - FIGURE_W, bottom: window.innerHeight - base, top: window.innerHeight - base - FIGURE_H };
      const covers = [...document.querySelectorAll<HTMLElement>('[data-scout-avoid]')].some((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.left < own.right && r.right > own.left && r.top < own.bottom && r.bottom > own.top;
      });
      setTucked(covers);
    };
    const soon = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };
    soon();
    window.addEventListener('scroll', soon, { passive: true });
    window.addEventListener('resize', soon);
    /* Pages render their panels after navigation; look again when the page changes. */
    const watch = new MutationObserver(soon);
    watch.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('scroll', soon);
      window.removeEventListener('resize', soon);
      watch.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages, busy, asking, open]);

  const send = useCallback(
    async (text: string, subject: Subject | null = about) => {
      const message = text.trim().slice(0, MESSAGE_LIMIT);
      if (!message || busy) return;
      if (holdsWalletSecret(message)) {
        setWarning('That looks like a wallet secret, so it was not sent. Scout never needs a seed phrase or private key.');
        return;
      }
      setWarning(null);
      setAsking(false);
      const turns: ScoutTurn[] = messages
        .flatMap((m): ScoutTurn[] => (m.role === 'user' || (m.role === 'assistant' && !m.failed) ? [{ role: m.role, content: m.content }] : []))
        .slice(-TURN_LIMIT);
      const lastAnswer = [...messages].reverse().find((m) => m.role === 'assistant');
      const recent = lastAnswer && lastAnswer.role === 'assistant' ? lastAnswer.links.map((link) => agentRefFromPath(link.href)).filter((ref): ref is AgentRef => ref !== null).slice(0, 3) : [];
      setMessages((list) => [...list, { id: nextId(), role: 'user', content: message }]);
      setBusy(true);
      try {
        const response = await fetch('/api/scout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message, turns, about: subject ? { chainId: subject.chainId, tokenId: subject.tokenId } : null, recent, consent: CONSENT_VERSION }),
        });
        const data = (await response.json().catch(() => null)) as { answer?: string; links?: ScoutLink[]; handoff?: boolean; error?: string; retryAfterSeconds?: number } | null;
        if (response.ok && data?.answer) {
          setMessages((list) => [...list, { id: nextId(), role: 'assistant', content: data.answer!, links: data.links ?? [], handoff: data.handoff === true }]);
        } else {
          const wait = response.status === 429 && data?.retryAfterSeconds ? ` Try again in about ${Math.max(1, Math.ceil(data.retryAfterSeconds / 60))} min.` : '';
          setMessages((list) => [...list, { id: nextId(), role: 'assistant', content: `${data?.error ?? 'Scout couldn’t answer that.'}${wait}`, links: [], handoff: false, failed: true }]);
        }
      } catch {
        setMessages((list) => [...list, { id: nextId(), role: 'assistant', content: 'Scout couldn’t reach Pokter. Check your connection and try again.', links: [], handoff: false, failed: true }]);
      } finally {
        setBusy(false);
      }
    },
    [about, busy, messages],
  );

  useEffect(() => {
    sendNow.current = send;
    consentNow.current = consent;
    busyNow.current = busy;
  }, [send, consent, busy]);

  /* Accepting the notice asks the question a button queued, if there is one. */
  const accept = () => {
    setConsent(CONSENT_VERSION);
    if (!pending) return;
    const question = pending;
    setPending(null);
    void send(question);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft;
    if (!text.trim() || busy) return;
    setDraft('');
    if (input.current) input.current.style.height = '';
    void send(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const restart = () => {
    setMessages([]);
    setAbout(null);
    setPending(null);
    setAsking(false);
    setWarning(null);
    input.current?.focus();
  };

  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user')?.content ?? null;
  const onLink = () => {
    if (phone()) setOpen(false);
  };

  return (
    <>
      {!open && (
        <button
          ref={launcher}
          type="button"
          onClick={() => setOpen(true)}
          onPointerEnter={() => setMet(true)}
          onPointerLeave={() => setMet(false)}
          aria-label="Ask Scout"
          title="Ask Scout about agents and hiring"
          data-tucked={tucked || undefined}
          style={{ bottom: floor, right: EDGE, ['--scout-tuck' as string]: `${FIGURE_W + EDGE - PEEK}px` }}
          className="scout-launcher fixed z-40 hidden rounded-[10px] transition-transform duration-200 ease-out hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink data-[tucked]:translate-x-(--scout-tuck) data-[tucked]:hover:translate-x-0 data-[tucked]:focus-visible:translate-x-0 md:block motion-reduce:transition-none print:hidden"
        >
          <ScoutFigure size={FIGURE_W} mood={met ? 'met' : 'watching'} near={480} />
        </button>
      )}

      {open && (
        <section
          ref={panel}
          role="dialog"
          aria-modal="false"
          aria-labelledby="scout-title"
          className="anim-rise fixed inset-0 z-[55] flex flex-col bg-raised md:inset-auto md:bottom-6 md:right-6 md:h-[min(640px,calc(100dvh-6rem))] md:w-[400px] md:overflow-hidden md:rounded-[16px] md:border md:border-rule md:shadow-float print:hidden"
        >
          <header className="flex items-center gap-3 border-b border-rule px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] md:pt-3">
            <span className="flex h-8 w-11 shrink-0 items-end justify-center overflow-hidden">
              <ScoutFigure size={44} mood={busy ? 'reading' : 'watching'} near={900} className="translate-y-[2px]" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="scout-title" className="text-[15px] font-semibold leading-tight text-ink">
                Scout
              </h2>
              <p className="truncate text-[12px] text-ink-3">Answers from Pokter&rsquo;s records</p>
            </div>
            {consented && messages.length > 0 && (
              <Button intent="ghost" size="s" onClick={restart}>
                New chat
              </Button>
            )}
            <button type="button" onClick={close} aria-label="Close Scout" className="grid h-8 w-8 place-items-center rounded-[7px] text-ink-2 hover:bg-sunken hover:text-ink">
              <Icon.Close size={18} />
            </button>
          </header>

          {about && consented && (
            <div className="flex items-center gap-2 border-b border-rule bg-sunken px-4 py-2 text-[12.5px] text-ink-2">
              <span className="min-w-0 truncate">
                Asking about{' '}
                <Link href={`/agents/${about.chainId}/${about.tokenId}`} onClick={onLink} className="font-medium text-ink underline-offset-2 hover:underline">
                  {about.name}
                </Link>
              </span>
              <button type="button" onClick={() => setAbout(null)} aria-label={`Stop asking about ${about.name}`} className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-ink-3 hover:bg-raised hover:text-ink">
                <Icon.Close size={14} />
              </button>
            </div>
          )}

          {!consented ? (
            <Welcome onAccept={accept} pending={pending} onLink={onLink} />
          ) : (
            <>
              <div ref={log} role="log" aria-label="Conversation with Scout" className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                {messages.length === 0 && !busy ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-[14px] leading-relaxed text-ink-2">
                      {about ? `Ask me anything about ${about.name}, or how hiring it works.` : 'Ask me about an agent, what Pokter’s evidence means, or how hiring works.'}
                    </p>
                    <ul className="flex flex-col gap-2">
                      {suggestionsFor(about).map((s) => (
                        <li key={s}>
                          <button type="button" onClick={() => void send(s)} className="w-full rounded-[10px] border border-rule px-3 py-2 text-left text-[13.5px] text-ink hover:border-rule-strong hover:bg-sunken">
                            {s}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <ol className="flex flex-col gap-4">
                    {messages.map((m) => (
                      <li key={m.id}>
                        {m.role === 'note' ? (
                          <p className="text-center text-[12px] text-ink-3">{m.content}</p>
                        ) : m.role === 'user' ? (
                          <p className="ml-auto w-fit max-w-[85%] whitespace-pre-line break-words rounded-[12px] rounded-br-[4px] bg-sunken px-3 py-2 text-[14px] leading-relaxed text-ink">{m.content}</p>
                        ) : (
                          <div className="flex flex-col gap-2.5">
                            <p className={cn('whitespace-pre-line break-words text-[14px] leading-relaxed', m.failed ? 'text-ink-2' : 'text-ink')}>{m.content}</p>
                            {m.links.length > 0 && (
                              <ul className="flex flex-wrap gap-1.5" aria-label="Pages Scout used">
                                {m.links.map((link) => (
                                  <li key={link.href}>
                                    <Link href={link.href} onClick={onLink} className="inline-flex h-7 items-center gap-1 rounded-full border border-rule-strong px-2.5 text-[12.5px] font-medium text-ink hover:border-ink">
                                      {link.label}
                                      <Icon.ChevronRight size={13} />
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {m.handoff && <Handoff question={lastQuestion} />}
                          </div>
                        )}
                      </li>
                    ))}
                    {busy && (
                      <li className="text-[13px] text-ink-3" aria-live="polite">
                        Reading Pokter&rsquo;s records&hellip;
                      </li>
                    )}
                    {asking && (
                      <li>
                        <Handoff question={lastQuestion} />
                      </li>
                    )}
                  </ol>
                )}
              </div>

              <form onSubmit={submit} className="border-t border-rule px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:pb-3">
                {warning && (
                  <p role="alert" className="mb-2 rounded-[8px] bg-sunken px-3 py-2 text-[12.5px] text-ink">
                    {warning}
                  </p>
                )}
                <div className="flex items-end gap-2 rounded-[12px] border border-rule-strong bg-raised px-3 py-2 focus-within:border-ink">
                  <label htmlFor="scout-input" className="sr-only">
                    Ask Scout
                  </label>
                  <textarea
                    id="scout-input"
                    ref={input}
                    rows={1}
                    value={draft}
                    maxLength={MESSAGE_LIMIT}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      if (warning) setWarning(null);
                      event.target.style.height = 'auto';
                      event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
                    }}
                    onKeyDown={onKeyDown}
                    placeholder={about ? `Ask about ${about.name}…` : 'Ask about an agent or hiring…'}
                    className="max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent py-0.5 text-[16px] leading-snug text-ink outline-none placeholder:text-ink-3 md:text-[14px]"
                  />
                  <button type="submit" disabled={!draft.trim() || busy} aria-label="Send" className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-ink text-paper disabled:bg-ink/30">
                    <Icon.Send size={16} />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-[11.5px] text-ink-3">
                  <span>Scout can be wrong. Check the pages it links.</span>
                  <button type="button" onClick={() => setAsking(true)} className="shrink-0 font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">
                    Ask a person
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      )}
    </>
  );
}

function Welcome({ onAccept, pending, onLink }: { onAccept: () => void; pending: string | null; onLink: () => void }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-5 py-6">
      <div className="flex justify-center pb-2">
        <ScoutFigure size={112} mood="met" />
      </div>
      <h3 className="t-h3 mt-4 text-ink">Hi, I&rsquo;m Scout.</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
        I explain agents and how hiring works on Pokter, from the evidence Pokter keeps. I can&rsquo;t see your wallet, contact agents or move money.
      </p>
      <p className="mt-4 rounded-[10px] border border-rule bg-sunken px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2">
        My answers are written by Google Gemini. Each question, a few recent turns and the public Pokter evidence I use are sent to it, and Google&rsquo;s free tier may use them to improve its products. Don&rsquo;t share keys, passwords or private briefs. This chat is kept only in your browser.
      </p>
      <Button data-scout-accept intent="primary" className="mt-5 w-full" onClick={onAccept}>
        {pending ? 'Agree and ask' : 'Start chatting'}
      </Button>
      <p className="mt-3 text-center text-[12px] text-ink-3">
        <Link href="/privacy#scout" onClick={onLink} className="link">
          How Scout uses your messages
        </Link>
        {' · '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="link">
          Ask a person instead
        </a>
      </p>
    </div>
  );
}

/**
 * Handing over to a person.
 *
 * An email the visitor writes in their own mail app, with their question
 * already in it, so nothing is collected here and they see exactly what is
 * sent. It says the team replies by email, and promises nothing about when.
 */
function Handoff({ question }: { question: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The address is on screen to copy by hand. */
    }
  };
  return (
    <div className="rounded-[12px] border border-rule bg-sunken px-3.5 py-3">
      <p className="text-[13.5px] font-medium text-ink">A person can help with this.</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
        Email the Pokter team at <span className="font-medium text-ink">{SUPPORT_EMAIL}</span> and they&rsquo;ll reply by email. Your mail app opens with your question filled in, so you can check it before sending.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <a href={handoffMailto(question)} className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-ink px-3 text-[13px] font-medium text-paper hover:bg-[color-mix(in_oklab,var(--ink)_86%,var(--paper))]">
          <Icon.Send size={14} />
          Email the team
        </a>
        <button type="button" onClick={() => void copy()} className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-rule-strong bg-raised px-3 text-[13px] font-medium text-ink hover:border-ink">
          <Icon.Copy size={14} />
          {copied ? 'Copied' : 'Copy address'}
        </button>
      </div>
    </div>
  );
}
