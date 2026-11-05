/** Route ordinary conversation before touching the catalogue. */
export function namedAgentQuery(text: string): string | null {
  const match = text.match(/\b(?:called|named|heard (?:of|about)|know (?:about|of))\s+(?:an?\s+)?(?:agent\s+)?(.+)$/i);
  const name = match?.[1]?.replace(/[?.!\s]+$/, '').trim();
  return name && name.length >= 3 && name.length <= 100 ? name : null;
}

/** A broad catalogue search is only a candidate set, never proof of a named match. */
export function matchingNamedAgents<T extends { name: string }>(name: string, candidates: T[]): T[] {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const wanted = normalize(name);
  if (!wanted) return [];
  const exact = candidates.filter((candidate) => normalize(candidate.name) === wanted);
  return exact.length ? exact : candidates.filter((candidate) => normalize(candidate.name).includes(wanted));
}

export function isMoreAgentsFollowUp(text: string): boolean {
  return /^(?:aren['’]?t there (?:others?|more)|are there (?:others?|more)|any (?:others?|more)|show (?:me )?more|more (?:agents?|options?)|what about (?:the )?others?)[?!.\s]*$/i.test(text.trim());
}

export function isConversationQuestion(text: string): boolean {
  return /\b(?:hold|have|keep|continue)\s+(?:a\s+)?conversation\b|\b(?:chat|talk)\s+with\s+you\b|\bdid you read my message\b|\bwhat did i (?:say|ask)\b/i.test(text);
}

export function shouldSearchAgents(text: string): boolean {
  if (isConversationQuestion(text) || isMoreAgentsFollowUp(text)) return false;
  return /\b(?:find|search|show me|recommend|suggest|browse|looking for|who can|agents? (?:for|to|that|who)|(?:need|want) (?:an? |some )?agents?\b|(?:need|want|looking)\b.{0,80}\b(?:research|trade|trading|build|monitor|check|write|create|analyse|analyze|manage))\b/i.test(text);
}
