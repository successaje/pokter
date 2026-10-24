import type { AcceptanceSpec, Criterion, PreparedBrief } from '@/lib/shared/contracts';
import { CopyButton } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';

/**
 * What Pokter will check, stated before the job is funded.
 *
 * Mounted by the hire flow on the review step. The buyer is about to move
 * money, and this is the one moment at which the criteria can be shown
 * *before* the answer exists — which is the whole difference between a
 * standard and a verdict dressed up as one. A buyer who learns the criteria
 * at the same moment they learn the result cannot tell a criterion that
 * always applied from one chosen after the report arrived.
 *
 * ## The binding is the point of this panel
 *
 * Everything else here is a list. The load-bearing claim is whether the
 * **agent agreed** to these criteria or whether **Pokter wrote them down**,
 * and the two are drawn as different things in different words, never as
 * two shades of the same reassurance.
 *
 * `signed-terms` means one specific thing: the agent's own quote signature
 * covers `success_criteria`, those criteria carried the spec hash, and
 * `negotiationTermsBound()` held — see `lib/proofrun/acceptance.ts`, where
 * `bindingFor` decides it and fails closed. Nothing else earns that word.
 *
 * `pokter-asserted` is everything else, and it is said plainly: the agent
 * did not agree. A checkbox ticked in this browser is not an agreement. A
 * row in Pokter's own database is not an agreement. Presenting either as a
 * cryptographically agreed condition would be the worst defect this
 * surface could carry, because it is the one a buyer would rely on and
 * could not check — so the panel names those two cases out loud rather
 * than merely avoiding them.
 */
export function ProofRunCheckPanel({
  brief,
  spec,
  binding,
}: {
  /** The prepared brief the criteria attach to. Null where the flow has none yet. */
  brief?: PreparedBrief | null;
  /** The criteria. Null on a job with none, and then this panel renders nothing. */
  spec: AcceptanceSpec | null;
  /**
   * The binding, where the caller has recomputed it after the quote came
   * back. Omitted, the spec's own binding stands.
   */
  binding?: AcceptanceSpec['binding'] | null;
}) {
  /*
   * No spec, no panel.
   *
   * Most jobs have no criteria, and a panel that rendered an empty "what
   * Pokter will check" would promise a check on a job that will never get
   * one. An absent spec is not an empty spec.
   */
  if (!spec) return null;
  if (spec.criteria.length === 0) return null;

  const resolved = resolveBinding(spec, binding);
  const agreed = resolved.kind === 'signed-terms';

  return (
    /*
      Named with `aria-label` rather than `aria-labelledby`.
      The review step mounts one of these, but ProofRun's own page mounts
      two side by side to show the difference between the bindings, and a
      fixed id on the heading would give both sections the same target —
      so the second section would be announced with the first one's
      heading. A server component cannot call `useId`, and an
      element-level name needs no id at all.
    */
    <section aria-label="What Pokter will check" className="flex flex-col gap-4 rounded-[14px] border border-rule bg-raised p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <span className="t-label flex items-center gap-2">
          <span className="tile" aria-hidden /> Before you fund
        </span>
        <h3 className="t-h3">What Pokter will check</h3>
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Named now, so the standard cannot be chosen after the answer arrives. Each one is recomputed from Venus’s own
          contracts at the block the report names.
        </p>
      </div>

      <BindingStatement binding={resolved} conflict={resolved.conflict} />

      <ol className="ruled overflow-hidden rounded-[12px] border border-rule">
        {spec.criteria.map((criterion) => (
          <li key={criterion.id} className="flex flex-col gap-1 bg-paper px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Icon.Dash size={14} className="mt-0.5 shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink">{criterion.label}</span>
            </div>
            <p className="pl-[26px] text-[12px] leading-relaxed text-ink-3">{criterionRule(criterion)}</p>
          </li>
        ))}
      </ol>

      {/*
        Said once, under the list, rather than squeezed into every row.
        The criteria state a band; the checker allows the larger of that
        band and a floor of its own (`hfTolerance`, `usdTolerance`), so a
        row reading "±0.005" is the agreement and not always the allowance
        that gets applied. Printing only the stated figure and letting the
        result print a wider one is how a page comes to describe a rule the
        code has stopped applying.
      */}
      <p className="text-[12px] leading-relaxed text-ink-3">
        Tolerances read as the criteria state them. The checker allows the larger of the stated band and a floor of its
        own, so the exact allowance depends on the size of the figure — it is printed beside each result rather than
        assumed from this list.
      </p>

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-2">
        <Fact label="Checked against">
          Venus {spec.subject.protocol === 'venus-core-pool' ? 'Core Pool' : spec.subject.protocol} at{' '}
          <span className="t-readout" title={spec.subject.deployment}>
            {shortAddress(spec.subject.deployment)}
          </span>
          , chain {spec.subject.chainId}
        </Fact>
        <Fact label="Criteria set">
          <span className="t-readout">{spec.versions.criteria}</span>
        </Fact>
        <Fact label="Checker">
          <span className="t-readout">{spec.versions.verifier}</span>
        </Fact>
        <Fact label="Criteria hash">
          <span className="inline-flex min-w-0 items-center gap-1">
            <span className="t-readout truncate" title={spec.specHash}>
              {spec.specHash.slice(0, 14)}…
            </span>
            <CopyButton value={spec.specHash} label="Copy the criteria hash" />
          </span>
        </Fact>
      </dl>

      {brief && <BriefSummary brief={brief} />}

      <p className="text-[12px] leading-relaxed text-ink-3">
        {agreed
          ? 'Agreeing to be measured on these is not a promise to pass them. Pokter does not release, refund or dispute escrow on the result of a check: that stays your decision.'
          : 'These checks will run either way, and will say what they found. What is missing is the agent’s own agreement that this is what it was being measured on.'}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * The binding
 * ------------------------------------------------------------------ */

type Resolved = AcceptanceSpec['binding'] & { conflict: boolean };

/**
 * Which binding to show when the caller passes one and the spec carries
 * another.
 *
 * It fails closed: if either source says the agent did not agree, that is
 * what is shown. The alternative — preferring the caller's value, or the
 * newer one, or the more specific one — means a surface can be handed
 * `signed-terms` and display it over a spec that says otherwise, and there
 * is no reading of this panel in which that is safe. A disagreement is also
 * surfaced rather than quietly resolved, because two sources differing
 * about whether a signature exists is itself something the buyer should
 * know before funding.
 */
function resolveBinding(spec: AcceptanceSpec, passed?: AcceptanceSpec['binding'] | null): Resolved {
  const stated = passed ?? spec.binding;
  const conflict = passed != null && passed.kind !== spec.binding.kind;
  if (stated.kind === 'signed-terms' && spec.binding.kind === 'signed-terms') {
    return { ...stated, conflict };
  }
  const asserted: AcceptanceSpec['binding'] = { kind: 'pokter-asserted' };
  return { ...asserted, conflict };
}

function BindingStatement({ binding, conflict }: { binding: AcceptanceSpec['binding']; conflict: boolean }) {
  const agreed = binding.kind === 'signed-terms';
  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'flex flex-col gap-2 rounded-[12px] border px-4 py-3.5',
          agreed
            ? 'border-[color-mix(in_oklab,var(--ok)_30%,transparent)] bg-ok-wash'
            : 'border-[color-mix(in_oklab,var(--watch)_32%,transparent)] bg-watch-wash',
        )}
      >
        <p className="flex items-start gap-2.5 text-[14px] font-medium leading-snug text-ink">
          <span className={cn('mt-px shrink-0', agreed ? 'text-ok' : 'text-watch')} aria-hidden>
            {agreed ? <Icon.Lock size={15} /> : <Icon.Alert size={15} />}
          </span>
          <span>
            {agreed
              ? 'The agent signed these criteria.'
              : 'Pokter recorded these criteria. The agent did not agree to them.'}
          </span>
        </p>
        <div className="flex flex-col gap-2 pl-[26px] text-[13px] leading-relaxed text-ink-2">
          {agreed ? (
            <>
              <p>
                They were sent to the agent inside the terms it priced, and its signature from its registered wallet
                covers the criteria hash below. So what it agreed to can be compared, byte for byte, with what is
                checked afterwards.
              </p>
              {(binding.negotiationHash || binding.boundAt) && (
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-ink-3">
                  {binding.negotiationHash && (
                    <span className="inline-flex items-center gap-1">
                      Signed over{' '}
                      <span className="t-readout" title={binding.negotiationHash}>
                        {binding.negotiationHash.slice(0, 12)}…
                      </span>
                      <CopyButton value={binding.negotiationHash} label="Copy the negotiation hash" />
                    </span>
                  )}
                  {binding.boundAt && <span>Bound {binding.boundAt}</span>}
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                These are Pokter’s own criteria for this kind of job. They were not carried back in anything the agent
                signed, so the agent has made no commitment to them and has not been held to them by anybody but
                Pokter.
              </p>
              <p>
                A box ticked in this browser is not an agreement by the agent. Neither is a row in Pokter’s own
                database. Only a signature from the agent’s registered wallet over the criteria hash is, and there is
                not one here.
              </p>
            </>
          )}
        </div>
      </div>

      {conflict && (
        <Notice tone="bad" title="Two sources disagree about whether the agent signed these criteria.">
          The criteria say one thing and the hire flow passed another. Until they agree, this panel shows the weaker of
          the two — that the agent did not agree — because a signature nobody can point to is not a signature.
        </Notice>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-paper px-4 py-3">
      <dt className="t-label text-[10px]">{label}</dt>
      <dd className="min-w-0 break-words text-[13px] text-ink">{children}</dd>
    </div>
  );
}

/**
 * The machine check under each criterion, in words.
 *
 * `expected` is absent on every criterion in this version, because all of
 * them are settled at check time rather than against a literal — and that
 * absence is said rather than left blank, since a criterion with no stated
 * expectation reads as an unfinished one.
 *
 * What it is settled *against* is not one thing, and an earlier draft of
 * this function said it was. It rendered “Field “account” must equal
 * Venus’s own figure at the named block”, which is false twice over: Venus
 * has no opinion about which account a job asked about, and neither has it
 * one about which chain. Those come from the brief — deliberately, because
 * a report that chose its own subject could be perfectly correct about a
 * position nobody asked for. So the `binding.` criteria are described
 * against the job, and the rest against Venus.
 */
export function criterionRule(criterion: Criterion): string {
  const { field, comparator, expected, tolerance } = criterion.check;
  const bound = criterion.id.startsWith('binding.');
  const against =
    expected !== undefined
      ? `“${String(expected)}”`
      : bound
        ? 'what the job asked about, taken from the brief rather than from the report'
        : 'Venus’s own figure at the named block';
  const unit = field.endsWith('_usd') && tolerance !== undefined ? `${tolerance * 100}%` : tolerance;

  switch (comparator) {
    case 'present':
      return bound
        ? `Field “${field}” must be stated in the report. The chain is then read at that block and no other.`
        : `Field “${field}” must be stated in the report.`;
    case 'equals':
      return `Field “${field}” must match ${against}.`;
    case 'within':
      return `Field “${field}” must be within ±${unit} of ${against}.`;
    case 'at-least':
      return `Field “${field}” must be at least ${against}.`;
    case 'at-most':
      return `Field “${field}” must be at most ${against}.`;
  }
}

/** The task the criteria attach to, so a buyer can see the two together. */
function BriefSummary({ brief }: { brief: PreparedBrief }) {
  return (
    <details className="group rounded-[12px] border border-rule bg-sunken/40 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <Icon.ChevronRight size={14} className="shrink-0 transition-transform duration-150 group-open:rotate-90" />
        The task these criteria are about
      </summary>
      <div className="mt-3 flex flex-col gap-3 border-t border-rule pt-3">
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-2">{brief.task}</p>
        {brief.statement && <p className="text-[12.5px] leading-relaxed text-ink-3">{brief.statement}</p>}
        {brief.inputs.length > 0 && (
          <dl className="ruled text-[12.5px]">
            {brief.inputs.map((input) => (
              <div key={input.label} className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-3">
                <dt className="text-ink-3">
                  {input.label}
                  {!input.declared && <span className="block text-[11px] text-watch">not declared by the agent</span>}
                </dt>
                <dd className="min-w-0 break-words text-ink-2">{input.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </details>
  );
}
