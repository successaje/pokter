import 'server-only';

import { authoriseAgentOwner, type OwnershipRefusal } from '@/lib/builder/diagnostics/authorise';
import { collectBuilderDiagnostics } from '@/lib/builder/diagnostics/collect';
import type { BuilderDiagnostics } from '@/lib/builder/diagnostics/report';
import { registryOwner } from '@/lib/registry/onchain';
import { studioOwner } from './data';

export type DiagnosticsResult =
  | { ok: true; diagnostics: BuilderDiagnostics }
  | (OwnershipRefusal & { kind: 'refused' })
  | { kind: 'unavailable'; ok: false; message: string };

/**
 * The diagnostics panel's data, through the same gate as the API route.
 *
 * Deliberately not read off `loadFleet`, which the rest of this page uses.
 * That lists what the **indexer** says the connected wallet owns, which is
 * right for drawing a fleet and wrong for releasing an agent's private
 * side: the indexer can be minutes behind a transfer, so an agent sold this
 * morning would still answer to its previous owner here. Ownership for this
 * panel is the registry's answer now, and a registry that cannot be read
 * grants nothing.
 */
export async function loadBuilderDiagnostics(chainId: number, tokenId: string): Promise<DiagnosticsResult> {
  const session = await studioOwner();
  const owner = session ? await registryOwner(chainId, tokenId).catch(() => null) : null;
  const decision = authoriseAgentOwner({ sessionOwner: session, registryOwner: owner, chainId, tokenId });
  if (!decision.ok) return { ...decision, kind: 'refused' };

  try {
    return { ok: true, diagnostics: await collectBuilderDiagnostics(decision.proof) };
  } catch {
    /*
     * A panel that cannot be assembled says so. The alternative is a page
     * of zeroes, and a zero on this panel is a claim about the agent — that
     * nobody tried to hire it — which is exactly the thing a failed read
     * cannot support.
     */
    return {
      kind: 'unavailable',
      ok: false,
      message: 'Pokter could not assemble this agent’s diagnostics just now. Nothing below should be read as a count.',
    };
  }
}
