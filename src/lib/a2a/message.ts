/**
 * The one shape of a message Pokter sends to an agent.
 *
 * A2A v0.3 names every object by a `kind`, the message itself included:
 * `{ kind: 'message', role, messageId, parts }`. Six call sites built the
 * message by hand and all left the message-level `kind` out. Permissive
 * agents accepted it; one validating against the schema could refuse the
 * request before reading the brief, and Pokter recorded that as the agent
 * not quoting. Built here once so no request can drift from the schema.
 */
export interface A2AUserMessage {
  kind: 'message';
  role: 'user';
  messageId: string;
  parts: unknown[];
}

export function a2aUserMessage(parts: unknown[], messageId: string = crypto.randomUUID()): A2AUserMessage {
  return { kind: 'message', role: 'user', messageId, parts };
}
