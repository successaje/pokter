/**
 * The agent's answer, out of an ERC-8183 deliverable manifest, as text an
 * email can carry.
 *
 * A manifest carries the delivery in `response.content`. When Pokter's
 * seller carried the brief, that content is JSON with the agent's own
 * `answer` in it; other sellers put the answer there directly, as text or
 * as JSON. Nothing is rewritten: structured answers are shown as indented
 * JSON, prose as it came.
 */
export function answerFromManifest(manifestText: string): string | null {
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return manifestText.trim() || null;
  }
  const response = (manifest as { response?: { content?: unknown } } | null)?.response;
  const content = response?.content;
  if (typeof content !== 'string' || !content.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content.trim();
  }
  const body = parsed !== null && typeof parsed === 'object' && 'answer' in parsed ? (parsed as { answer: unknown }).answer : parsed;
  if (typeof body === 'string') return body.trim() || null;
  if (body === null || body === undefined) return null;
  return JSON.stringify(body, null, 2);
}

/** The first part of an answer, on one line, for an email preview. */
export function previewOf(answer: string, max = 600): string {
  const flat = answer.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max).replace(/\s+\S*$/, '')}…` : flat;
}
