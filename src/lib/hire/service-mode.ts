import { POKTER_TERMS } from '@/lib/erc8183/terms';

/**
 * What a hire buys: a report, a simulation, or execution on the buyer's
 * behalf, decided from what was actually agreed and never from the agent's
 * marketing.
 *
 * Every hire through Pokter sends the agent `POKTER_TERMS`, whose quality
 * standard reads "Read-only analysis only. Execute no transaction and move
 * no funds." When the agent's signed quote carries exactly that standard,
 * its own signature covers it, and the hire is a report on the agent's
 * word. When it signed other terms, Pokter says what it signed and does not
 * name a mode. Delegated execution is not offered: no hire through Pokter
 * grants an agent any authority over the buyer's wallet.
 */
export type ServiceMode = 'report' | 'unknown';

export interface ServiceModeReading {
  mode: ServiceMode;
  /** The row's value, in the buyer's terms. */
  label: string;
  /** Why Pokter says so: whose words, and whether they are signed. */
  basis: string;
  /** What the agent will deliver, as the agreed terms state it. */
  deliverable: string;
}

const READ_ONLY = POKTER_TERMS.quality_standards;

export function serviceModeOf(input: {
  /** The terms inside the agent's signed quote (`anchor.terms`), or null before it signs. */
  signedTerms: { deliverables?: unknown; quality_standards?: unknown } | null;
  /** Delivery relayed by Pokter's own agent, with no quote from the seller. */
  relayed: boolean;
}): ServiceModeReading {
  const signed = input.signedTerms;
  if (signed) {
    const standard = typeof signed.quality_standards === 'string' ? signed.quality_standards : '';
    const deliverable = typeof signed.deliverables === 'string' && signed.deliverables.trim() ? signed.deliverables.trim() : 'Not stated in the signed terms';
    if (standard === READ_ONLY) {
      return {
        mode: 'report',
        label: 'Report: analysis only',
        basis: `The agent’s signed quote includes “${READ_ONLY}”, so its own signature covers it.`,
        deliverable,
      };
    }
    return {
      mode: 'unknown',
      label: 'Not stated as a report',
      basis: standard
        ? `The agent signed its own standard instead of Pokter’s read-only one: “${standard.slice(0, 200)}”. Read it before funding.`
        : 'The agent’s signed quote states no quality standard, so Pokter cannot say what kind of service this is.',
      deliverable,
    };
  }
  if (input.relayed) {
    return {
      mode: 'report',
      label: 'Report: analysis only',
      basis: 'Pokter’s delivery agent sends your brief marked read-only. No quote is signed, so this rests on Pokter’s relay, not on the agent’s signature.',
      deliverable: POKTER_TERMS.deliverables,
    };
  }
  return {
    mode: 'report',
    label: 'Report: analysis only, as asked',
    basis: `Pokter asks the agent to sign “${READ_ONLY}”. You see whether it did when it signs its quote, before anything is funded.`,
    deliverable: `${POKTER_TERMS.deliverables} (as asked; the signed terms are shown when the agent quotes)`,
  };
}
