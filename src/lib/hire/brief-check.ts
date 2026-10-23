/**
 * What the agent said about a brief before it was funded, and whether that
 * is enough to fund it.
 *
 * Three outcomes, kept apart. `accepted` is the agent signing a price for
 * this exact text, or answering that it takes it. `declined` is the agent
 * saying no, with or without words. `unverified` is everything else: no
 * card Pokter can read, no way to ask before payment, no answer in time.
 *
 * The third used to be folded into the first. `askIfAgentTakesBrief` and
 * `preflightHireBrief` fail open, so a hire Pokter could not judge went
 * ahead looking exactly like one the agent had agreed to, and the review
 * screen said nothing either way. Failing open stays right for those two
 * — most of the catalogue publishes no way to be asked, and refusing all
 * of it would stop more hires than it saves — but the buyer is the one who
 * decides, and they can only decide what they are told. So an unverified
 * brief is said as that, and funding it takes a tick that says so.
 */

export type BriefCheck =
  | { state: 'accepted'; by: 'signed-quote' | 'agent-answered' }
  | { state: 'declined'; message: string }
  | {
      state: 'unverified';
      message: string;
      /**
       * Whether the buyer may fund anyway. True where the check ran and the
       * agent could not be asked; false where the check itself did not run,
       * or where funding needs the signed price that did not come back.
       */
      overridable: boolean;
    };

/**
 * What a confirmation, quote, check or override was given for.
 *
 * Every one of them is about one text, sent to one agent, delivered by one
 * provider, on one escrow. An edit to any of the four makes it about
 * something else, so it stops counting rather than being cleared at each
 * place an edit can happen.
 */
export interface HireBinding {
  agentChainId: number;
  agentTokenId: string;
  provider: string;
  escrowChainId: number;
  task: string;
}

export function covers(given: HireBinding | null | undefined, now: HireBinding): boolean {
  return Boolean(
    given &&
      given.agentChainId === now.agentChainId &&
      given.agentTokenId === now.agentTokenId &&
      given.provider.toLowerCase() === now.provider.toLowerCase() &&
      given.escrowChainId === now.escrowChainId &&
      given.task === now.task,
  );
}

/** Refusal codes that mean the brief lacks something Pokter knows it needs. */
const MISSING_INPUT = new Set(['subject-missing', 'subject-ambiguous', 'brief-incomplete', 'invalid-task', 'brief-too-short']);
/** Refusal codes that mean the agent itself said no. */
const DECLINED = new Set(['seller-declined', 'brief-declined']);

/** Why the agent could not be asked, in words a buyer can weigh. */
function unaskedReason(code: string | null, agentName: string): string {
  switch (code) {
    case 'no-card':
      return `Pokter could not read ${agentName}'s agent card, so it could not ask whether it takes this brief.`;
    case 'no-price-skill':
      return `${agentName} publishes no way to answer before it is paid, so nobody could ask whether it takes this brief.`;
    case 'no-endpoint':
    case 'unreachable':
      return `${agentName}'s endpoint could not be reached, so nobody could ask whether it takes this brief.`;
    case 'timeout':
      return `${agentName} did not answer in time, so it is not known whether it takes this brief.`;
    default:
      return `${agentName} could not be asked whether it takes this brief.`;
  }
}

/**
 * The outcome of `/api/hire/preflight`, for a hire Pokter's seller carries.
 *
 * `brief: null` is the route reporting that no card could be read at all;
 * `answered: false` is the agent not being asked. Neither is an acceptance.
 */
export function checkFromPreflight(
  result: { brief: unknown | null; accepted?: { answered: boolean; failure: string | null } | null },
  agentName: string,
): BriefCheck {
  if (result.accepted?.answered) return { state: 'accepted', by: 'agent-answered' };
  const code = result.brief === null ? 'no-card' : (result.accepted?.failure ?? null);
  return { state: 'unverified', message: unaskedReason(code, agentName), overridable: true };
}

/**
 * The outcome of a check that failed, from the refusal's code.
 *
 * Null for a missing input: that is the brief's to fix, reported as the
 * questions the review screen already asks, not as something the agent said.
 *
 * Never overridable. On the quote path the agent is the payee and funding
 * needs the price it signs; on the preflight path the check itself did not
 * run, which is a reason to run it again rather than to skip it.
 */
export function checkFromFailure(failure: { message: string; code?: string | null }): BriefCheck | null {
  const code = failure.code ?? null;
  if (code && MISSING_INPUT.has(code)) return null;
  if (code && DECLINED.has(code)) return { state: 'declined', message: failure.message };
  return { state: 'unverified', message: failure.message, overridable: false };
}

/**
 * Why this hire cannot be funded yet, or null when it can.
 *
 * In one place, and in order, so the screen that disables the button and
 * the function that moves the money refuse for the same reason in the
 * same words.
 */
export function fundingBlock(input: {
  /** The brief compiled for the text as it stands, or null when it has not been. */
  compiled: { ok: boolean; payload: string | null; missing: ReadonlyArray<{ label: string }> } | null;
  /** The buyer confirmed the request, and the confirmation still covers it. */
  confirmed: boolean;
  /** Material inputs edited since the confirmation, by label. */
  changed: readonly string[];
  /** What the agent said, for this binding, or null when it has not been asked. */
  check: BriefCheck | null;
  /** The buyer chose to fund an unverified brief, for this binding. */
  overridden: boolean;
  agentName: string;
}): { code: string; message: string } | null {
  if (!input.compiled) {
    return { code: 'request-unchecked', message: 'Check the request before funding: what the agent will be asked has not been worked out for this brief.' };
  }
  if (input.compiled.missing.length > 0) {
    return {
      code: 'inputs-missing',
      message: `${input.agentName} needs ${input.compiled.missing.map((m) => m.label).join(' and ')}, and this brief does not give ${input.compiled.missing.length === 1 ? 'it' : 'them'}. Answer it on the request step before funding.`,
    };
  }
  if (!input.compiled.ok || input.compiled.payload === null) {
    return { code: 'inputs-invalid', message: 'A value in the request does not fit what the agent asked for. Correct it on the request step before funding.' };
  }
  if (input.changed.length > 0) {
    return { code: 'request-changed', message: `You changed ${input.changed.join(' and ')} after confirming the request. Confirm it again before funding.` };
  }
  if (!input.confirmed) {
    return { code: 'request-unconfirmed', message: 'Confirm the request before funding. Editing the brief, the provider or the network asks for a fresh confirmation.' };
  }
  if (!input.check) {
    return { code: 'not-checked', message: `${input.agentName} has not been asked about this request yet. Confirm it again to ask.` };
  }
  if (input.check.state === 'declined') {
    return { code: 'brief-declined', message: input.check.message };
  }
  if (input.check.state === 'unverified' && !(input.check.overridable && input.overridden)) {
    return {
      code: 'check-unverified',
      message: input.check.overridable
        ? `${input.check.message} Say you want to fund it anyway, or change the brief.`
        : `${input.check.message} Nothing can be funded without a signed price; try again, or change the brief.`,
    };
  }
  return null;
}
