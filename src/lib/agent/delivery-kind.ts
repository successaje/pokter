/**
 * What a delivered file shows.
 *
 * - `agent`: delivered by the agent itself, from its own wallet.
 * - `relayed`: the agent's own answer, carried to the job by Pokter's delivery
 *   agent; the file holds that answer and who gave it.
 * - `lifecycle`: Pokter's seller submitting a receipt with no answer from the
 *   agent in it. Early demonstrations did this to prove funding, delivery and
 *   settlement work; it shows nothing about whether the agent can do the task,
 *   and must never be presented as if it did.
 */
export type DeliveryKind = 'agent' | 'relayed' | 'lifecycle';

export function deliveryKind(producer: string | null, content: unknown): DeliveryKind {
  // Only Pokter's own delivery agent stands in for an agent. A builder's
  // Studio delivery ("Pokter verified provider") is the builder's own work,
  // merely hosted by Pokter.
  const fromPokterSeller = typeof producer === 'string' && /pokter delivery agent/i.test(producer);
  if (!fromPokterSeller) return 'agent';
  const object = content && typeof content === 'object' && !Array.isArray(content) ? (content as Record<string, unknown>) : null;
  return object && 'answer' in object && 'answered_by' in object ? 'relayed' : 'lifecycle';
}

/** The two fields of a delivered manifest that say what it is. */
export interface DeliveredManifest {
  kind: DeliveryKind;
  /** The agent the manifest names as the author of the answer, `chainId:tokenId`. */
  answeredBy: string | null;
}

/**
 * Classify a delivered manifest from its stored text.
 *
 * Null for anything that will not parse. A manifest Pokter cannot read is
 * not evidence in either direction, and every caller treats it as the
 * absence of evidence rather than as a default.
 */
export function readDeliveredManifest(manifestText: string): DeliveredManifest | null {
  let parsed: {
    response?: { content?: unknown };
    metadata?: { producer?: unknown; answered_by?: unknown };
  };
  try {
    parsed = JSON.parse(manifestText);
  } catch {
    return null;
  }
  const producer = typeof parsed.metadata?.producer === 'string' ? parsed.metadata.producer : null;
  const raw = parsed.response?.content;
  let content: unknown = raw;
  if (typeof raw === 'string') {
    try {
      content = JSON.parse(raw);
    } catch {
      content = null;
    }
  }
  return {
    kind: deliveryKind(producer, content),
    answeredBy: typeof parsed.metadata?.answered_by === 'string' ? parsed.metadata.answered_by : null,
  };
}

/**
 * Whether a delivery carried this agent's own answer to the escrow.
 *
 * The escrow records who submitted, and for a courier delivery that is a
 * Pokter wallet whichever agent produced the answer — so the provider
 * address can only ever say "a Pokter wallet delivered this". The manifest
 * says the rest, and has since the courier was written: the endpoint and
 * skill the answer came from, and the agent it belongs to.
 *
 * Both halves must agree before this is claimed. The manifest has to be a
 * relayed answer rather than a lifecycle receipt, and the agent it names
 * has to be the agent whose record is being described — job 97/1585 names
 * `97:2599`, which is the agent that job was indexed against. A manifest
 * naming nobody, or naming somebody else, says nothing about this agent.
 */
export function carriesRelayedAnswerFor(
  manifest: DeliveredManifest | null,
  agent: { chainId?: number | null; tokenId?: string | null },
): boolean {
  if (manifest?.kind !== 'relayed') return false;
  if (agent.chainId === null || agent.chainId === undefined || !agent.tokenId) return false;
  return manifest.answeredBy === `${agent.chainId}:${agent.tokenId}`;
}
