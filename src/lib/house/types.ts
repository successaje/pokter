/**
 * Pokter's house agents: services Pokter runs itself, one wallet each.
 *
 * A house agent is a definition. The engine (card, quote, delivery, A2A)
 * is shared and holds every lesson the first mainnet hires taught, so an
 * agent only says what it does: Sluicegate answered one phrasing and
 * errored on another, so every definition checks a brief before quoting
 * and publishes the phrasings it answers; a job description carrying
 * anything beside the signed quote was refused, so delivery reads either
 * format; a 24-hour mainnet job could never be submitted, so delivery
 * checks the escrow's review window still fits.
 */
import type { Category } from '@/lib/agents/categories';

export type HouseChainId = 56 | 97;
export const HOUSE_CHAINS: readonly HouseChainId[] = [56, 97];

/** What a run produced: an answer, or a plain statement of why there is none. */
export type HouseResult =
  | { ok: true; content: Record<string, unknown> }
  | { ok: false; error: string; need?: string };

export interface HouseAgentDefinition {
  /** URL and secret name: `/house/{slug}`, `HOUSE_AGENT_{SLUG}_KEY`. */
  slug: string;
  name: string;
  version: string;
  category: Category | 'token-safety';
  /** One paragraph: what it covers, what it needs, what it returns, what it cannot do. */
  description: string;
  priceU: number;
  skill: {
    id: string;
    name: string;
    description: string;
    /** Briefs it answers. Published on the card so a buyer starts from one. */
    examples: string[];
    tags: string[];
  };
  deliverables: string;
  qualityStandards: string;
  /**
   * Whether a brief can be answered, decided before any money moves.
   * Returns null when it can, or the reason and what is missing.
   */
  check(brief: string): { error: string; need: string } | null;
  /** The work. Reads live chain data; never signs or moves funds. */
  run(brief: string, context: { chainId: HouseChainId; now: Date }): Promise<HouseResult>;
}

export function slugEnvName(slug: string): string {
  return `HOUSE_AGENT_${slug.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_KEY`;
}
