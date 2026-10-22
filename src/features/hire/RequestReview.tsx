'use client';

import { useState } from 'react';

import { briefIsVerbatim, briefSummary, type CompiledBrief, type MissingInput } from '@/lib/hire/brief-compiler';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Field, Input } from '@/ui/Field';
import { Icon } from '@/ui/icons';

/**
 * The step where a buyer sees the request before anyone is paid for it.
 *
 * Pokter used to take a brief, send something else, and show the buyer the
 * price. Job 1585 was funded that way: the brief named its subject in prose,
 * the skill read it from a structured field, and the mismatch surfaced a day
 * later with the escrow locked. The fix cannot be a better guess — it has to
 * be showing the buyer both texts and letting them say yes.
 *
 * So this screen holds two things side by side: what they wrote, verbatim,
 * and what the agent will receive, in full. Nothing is summarised away. A
 * summary that dropped a field would be asking for consent to something
 * unseen, which is the hole the whole step closes.
 *
 * It also says what Pokter could *not* work out, in those words. Of 96 live
 * agents surveyed, five publish a format their input can be checked against;
 * the rest publish prose examples or nothing. Telling a buyer their brief
 * was validated against a contract that does not exist would be the more
 * comfortable lie and the more expensive one.
 */

/** What Pokter knows about this skill's input, said plainly. */
function contractNote(brief: CompiledBrief, agentName: string, verbatim: boolean): { tone: 'ok' | 'neutral' | 'watch'; title: string; body: string } {
  /*
   * A prose brief that took an answer is no longer word for word what the
   * buyer wrote: an "Account: 0x…" line was added from what they gave. The
   * note said "nothing has been rewritten" over the top of the added line,
   * which is the one kind of inaccuracy this screen exists to prevent.
   */
  if (brief.contract === 'prose' && !verbatim) {
    return {
      tone: 'ok',
      title: 'Your words, with the account you gave',
      body: `${agentName} publishes example requests in words rather than a format Pokter can check against, so your brief is not rewritten. The account you answered with is added on its own line, and the whole thing is below exactly as it will be sent.`,
    };
  }
  switch (brief.contract) {
    case 'adapter':
      return {
        tone: 'ok',
        title: 'Checked against what this skill publishes',
        body: `${agentName} documents the input its skill reads, and Pokter fills that field from your brief. Your brief is sent whole alongside it.`,
      };
    case 'structured':
      return {
        tone: 'ok',
        title: 'Built in the format this agent publishes',
        body: `${agentName}'s card publishes an example request, so your brief has been rewritten into that exact shape. The text below is what it receives — check every value before you confirm it.`,
      };
    case 'prose':
      return {
        tone: 'neutral',
        title: 'Sent as you wrote it',
        body: `${agentName} publishes example requests in words rather than a format Pokter can check against, so nothing has been rewritten. Whether the wording is enough is the agent's to judge, and it is asked before you pay.`,
      };
    default:
      return {
        tone: 'watch',
        title: 'Pokter could not establish what this agent accepts',
        body: `${agentName} publishes no example request, so there is no format to check your brief against. It is sent exactly as you wrote it. If the agent cannot use it, it declines and nothing is paid.`,
      };
  }
}

export function RequestReview({
  brief,
  agentName,
  approved,
  changed,
  onAnswer,
  answers,
  busy,
  onEditBrief,
  onConfirm,
  confirming,
  failure,
}: {
  brief: CompiledBrief;
  agentName: string;
  /** Already confirmed, and still covering this request. */
  approved: boolean;
  /** Material inputs edited since the confirmation, by label. */
  changed: string[];
  onAnswer: (missing: MissingInput, answer: string) => void;
  /** Answers already given, by field key, so a rejected one comes back as typed. */
  answers: Readonly<Record<string, string>>;
  /** A compilation is in flight: an answer is being taken. */
  busy: boolean;
  onEditBrief: () => void;
  onConfirm: () => void;
  confirming: boolean;
  failure: string | null;
}) {
  /* What is in the boxes right now. Seeded from the answers already given,
     so a value rejected for its type comes back as the buyer typed it
     rather than as an empty box beside the same question. */
  const [typed, setTyped] = useState<Record<string, string>>({});
  const valueFor = (key: string) => typed[key] ?? answers[key] ?? '';

  const rows = briefSummary(brief);
  const ready = brief.ok && brief.payload !== null;
  /* Where the brief travels unchanged, the two halves of this screen are the
     same paragraph. Said once, rather than printed twice under two headings:
     only the routing rows are left, since those are the part the buyer has
     not already read above. */
  const verbatim = briefIsVerbatim(brief);
  const shown = rows.filter((row) => !verbatim || row.declared);
  const note = contractNote(brief, agentName, verbatim);

  return (
    <div className="anim-fade flex flex-col gap-6">
      <div>
        <h1 className="t-h2">Check the request</h1>
        <p className="mt-1 text-sm text-ink-2">
          Nothing has been signed, sent or paid. This is what {agentName} will be asked, beside what you wrote.
        </p>
      </div>

      {/*
        The buyer's own words first, and unedited.

        Shown above the compiled request rather than below it: the thing they
        can recognise has to come before the thing they are being asked to
        check, or there is nothing to check it against.
      */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">What you asked for</h2>
          <Button size="s" intent="ghost" onClick={onEditBrief} icon={<Icon.ChevronLeft size={14} />}>
            Edit
          </Button>
        </div>
        {/* `break-words`: a brief is mostly prose, but the one token in it that
            never wraps is the 42-character address, and on a phone it ran
            straight out of the right edge of its own box. */}
        <p className="whitespace-pre-wrap break-words rounded-[12px] border border-rule bg-paper px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
          {brief.intent || 'Nothing written yet.'}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">What {agentName} receives</h2>
        <Notice tone={note.tone} title={note.title}>
          {note.body}
        </Notice>

        {shown.length > 0 && (
          <div className="overflow-hidden rounded-[12px] border border-rule">
            <dl className="ruled bg-raised text-sm">
              {shown.map((row) => (
                <div key={row.label} className="grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <dt className="text-ink-3">{row.label}</dt>
                  <dd className="min-w-0 break-words">
                    <span className="t-readout">{row.value}</span>
                    {/* Whose decision each value was. A figure from the operator's
                        own routing is not the buyer's choice and must not read
                        as one. */}
                    {row.declared && <span className="ml-2 text-[12px] text-ink-3">required by the agent</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/*
          The exact bytes, available and not forced on anyone.

          The rows above are the readable version; this is the thing the
          signature covers. A buyer who wants to check a brief character by
          character before committing money on chain is entitled to see it.

          Not shown when the brief travels unchanged: it is already on this
          screen, in full, under the buyer's own heading, and a second copy
          of the same paragraph makes the screen longer without making it
          say anything more.
        */}
        {verbatim ? (
          <p className="text-[12.5px] text-ink-3">
            Word for word what you wrote above, with nothing added and nothing removed.
          </p>
        ) : (
          brief.payload !== null && (
            <details className="group rounded-[12px] border border-rule bg-paper">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[13px] text-ink-2 marker:content-none">
                <Icon.ChevronRight size={14} className="transition-transform group-open:rotate-90" />
                The exact request, as sent
              </summary>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-rule px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
                {brief.payload}
              </pre>
            </details>
          )
        )}
      </section>

      {/*
        What is missing, as questions.

        Each one is something Pokter will not decide: an address, an amount, a
        limit. Brinkwatch's card names a real wallet in its example and
        Gridloom's names 1000 USDT, and a buyer who funded either unchanged
        paid for a report on somebody else's position at somebody else's size.
        The example is offered as a hint and the answer is the buyer's.
      */}
      {brief.missing.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[14px] border border-[color-mix(in_oklab,var(--watch)_35%,transparent)] bg-watch-wash/70 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-watch">
            <Icon.Alert size={16} />
            {brief.missing.length === 1 ? 'One thing is missing' : `${brief.missing.length} things are missing`}
          </p>
          {brief.missing.map((missing) => (
            <Field
              key={missing.key}
              label={missing.question}
              hint={missing.hint ? `The agent's own example uses “${missing.hint}”. It is an example, not a default.` : undefined}
            >
              {(field) => (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    {...field}
                    className="max-w-[26rem] flex-1"
                    value={valueFor(missing.key)}
                    onChange={(e) => setTyped((prior) => ({ ...prior, [missing.key]: e.target.value }))}
                    placeholder={missing.hint ?? ''}
                  />
                  <Button
                    size="s"
                    busy={busy}
                    disabled={!valueFor(missing.key).trim()}
                    onClick={() => onAnswer(missing, valueFor(missing.key))}
                  >
                    Add
                  </Button>
                  {/* Offered, never written in: an address nobody chose has no
                      business inside a brief that goes on chain. */}
                  {missing.suggestion && (
                    <Button size="s" intent="secondary" busy={busy} onClick={() => onAnswer(missing, missing.suggestion!)}>
                      Use my wallet {shortAddress(missing.suggestion)}
                    </Button>
                  )}
                </div>
              )}
            </Field>
          ))}
        </section>
      )}

      {/*
        Notes, and whether they are the reason nothing can be confirmed.

        A value that does not fit its field — "ten" where the card declares
        a number, "my main wallet" where it declares an account — is why
        nothing can be confirmed, so it is said as the blocker rather than
        printed in grey beside a dead control. Shown whether or not anything
        is still missing: a rejected answer leaves its own question standing,
        and the buyer was being shown that question again with no hint that
        what they had just typed was the problem.
      */}
      {brief.notes.length > 0 &&
        (ready ? (
          <ul className="flex flex-col gap-1.5 text-[12.5px] text-ink-3">
            {brief.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : (
          <Notice tone="bad" title={brief.notes.length === 1 ? 'One value does not fit what the agent asked for' : 'Some values do not fit what the agent asked for'}>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {brief.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <span className="mt-2 block">Go back to the brief and correct it, or change the value you gave.</span>
          </Notice>
        ))}

      {/*
        A confirmation that no longer covers what would be sent.

        The old quote was signed over the old text, so it buys work nobody is
        asking for. Named rather than counted: "account to report on changed"
        is something a buyer can act on; "your quote is stale" is not.
      */}
      {changed.length > 0 && (
        <Notice tone="watch" title="You changed the request after confirming it">
          {changed.join(' and ')} {changed.length === 1 ? 'is' : 'are'} different now, so the price {agentName} signed for the
          earlier request no longer applies. Confirm again and it is asked for a fresh one.
        </Notice>
      )}

      {failure && (
        <Notice tone="bad" title="The agent did not take this request">
          {failure} Your brief is kept as you wrote it.
        </Notice>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button intent="ghost" onClick={onEditBrief} icon={<Icon.ChevronLeft size={16} />}>
          Back
        </Button>
        <Button
          size="l"
          onClick={onConfirm}
          busy={confirming}
          disabled={!ready}
          trailing={<Icon.Arrow size={16} />}
        >
          {confirming
            ? 'Asking the agent'
            : approved && changed.length === 0
              ? 'Continue'
              : brief.missing.length > 0
              ? 'Answer what is missing'
              : !ready
                ? 'Correct the values first'
                : 'Confirm this request'}
        </Button>
      </div>
      {!ready && brief.missing.length > 0 && (
        <p className={cn('-mt-4 text-right text-[12.5px] text-ink-3')}>
          Nothing is quoted or funded until every question above is answered.
        </p>
      )}
    </div>
  );
}
