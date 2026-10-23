import { scopeRefusal, type AutomationScope } from '@/lib/builders/automation-token';
import type { OwnerConfirmation } from '@/lib/builders/provider-ownership';

/**
 * The two gates every provider tool passes through, as functions that hold
 * the work inside them.
 *
 * Both of these used to be statements in `/api/mcp/provider/route.ts` with
 * the work beside them, and the route is `server-only`, so the only
 * coverage they had was a source regex in
 * `tests/provider-route-wiring.test.mts`. A regex cannot see ordering, and
 * mutation proved it: moving the scope check to run *after* the tool body
 * left all 1,875 assertions passing, so a token with no
 * `deliverables:prepare` scope would have written the staged row and *then*
 * been refused — and deleting `confirmAgentOwner` from `prepare_deliverable`
 * also passed, because `assert.match(PROVIDER, /confirmAgentOwner\(/)` was
 * satisfied by the surviving call inside another helper.
 *
 * So the ordering is no longer something the route gets right. The work is
 * a callback these functions decide whether to invoke, which makes "the
 * gate ran first" a property of a pure module a test can drive with a spy,
 * and makes "the gate is still wired up" the only thing left for the source
 * regex to assert.
 */

/** What a tool hands back: `answerMcp`'s shape, nothing more. */
export interface ToolAnswer {
  data: unknown;
  isError?: boolean;
}

/**
 * Wrap a tool body so it is unreachable without the scope it needs.
 *
 * The body is a callback rather than a statement after a check, so there is
 * no edit that leaves the refusal in place and the work running anyway. A
 * null scope is a tool any live token may call, and it runs.
 *
 * The listing is deliberately *not* filtered by scope elsewhere: `answerMcp`
 * answers a tool it was not given with `-32602 Unknown tool`, so filtering
 * told an assistant that prepare_proposal does not exist — a false claim
 * about what Pokter offers, which sends the user hunting for a tool instead
 * of for a scope. Every tool is listed and refused here by name.
 */
export function scopeGuarded<A>(
  scope: AutomationScope | null,
  token: { scopes: readonly string[] },
  body: (args: A) => Promise<ToolAnswer>,
): (args: A) => Promise<ToolAnswer> {
  return async (args: A) => {
    const refusal = scopeRefusal(token.scopes, scope);
    if (refusal) return { data: { error: refusal, grantedScopes: token.scopes }, isError: true };
    return body(args);
  };
}

/**
 * Run `body` only once the ERC-8004 registry has confirmed this wallet owns
 * the agent, right now.
 *
 * Same posture as `/api/builders/deliveries`: ownership is read from the
 * registry and never from the catalogue, and "could not check" is reported
 * as exactly that rather than as "not yours" — an RPC failure must not read
 * as a revoked permission, and a stale index must not read as a live one.
 * A read that throws is not a confirmation and the body does not run.
 */
export async function withConfirmedAgent(
  agent: { chainId: number; tokenId: string },
  confirm: (chainId: number, tokenId: string) => Promise<OwnerConfirmation>,
  body: () => Promise<ToolAnswer>,
): Promise<ToolAnswer> {
  const confirmed = await confirm(agent.chainId, agent.tokenId).catch(
    (): OwnerConfirmation => ({
      ok: false,
      unavailable: true,
      reason:
        `Pokter could not reach the ERC-8004 registry on chain ${agent.chainId} to confirm that this wallet owns ` +
        `agent ${agent.chainId}:${agent.tokenId}. Nothing was changed; try again shortly.`,
    }),
  );
  if (!confirmed.ok) return { data: { error: confirmed.reason }, isError: true };
  return body();
}
