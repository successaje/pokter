import { apiJson, apiOptions, apiRateLimit, originOf } from '@/lib/api/respond';
import { sealChain } from '@/lib/seals/anchor';
import { getSealStore } from '@/lib/seals/store';
import { explorerBaseFor } from '@/lib/network/presentation';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 100;

export function OPTIONS() {
  return apiOptions();
}

/**
 * Pokter's own claims, fixed in time.
 *
 * The rest of this API reports what Pokter currently believes. Nothing
 * in it stops those beliefs being revised: an agent whose verdict was
 * raised after it did well, or lowered after a hire went badly, would
 * read today as though it had always been so. A track record assembled
 * that way is worthless, and a reader cannot tell one from the real
 * thing by looking.
 *
 * So the claims are hashed and the hash goes on a chain. The block's
 * timestamp is not Pokter's to set, which makes it the one part of this
 * record that cannot be backdated. Fetch the sealed document, hash it
 * yourself, read the transaction, compare.
 *
 * It proves when a claim was published. It does not prove the claim was
 * right — a wrong verdict seals just as firmly as a correct one. What it
 * removes is the quiet edit afterwards.
 */
export function GET(request: Request) {
  const limited = apiRateLimit(request, 'seals');
  if (limited) return limited;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 30) || 30, 1), MAX_LIMIT);
  const origin = originOf(request);
  const explorer = explorerBaseFor(sealChain());

  const seals = getSealStore()
    .recent(limit)
    .map((seal) => ({
      hash: seal.hash,
      sealedAt: seal.sealedAt,
      claims: seal.claimCount,
      anchor: seal.anchor
        ? {
            chainId: seal.anchor.chainId,
            transactionHash: seal.anchor.transactionHash,
            blockNumber: seal.anchor.blockNumber,
            /* The figure that does the work: a time Pokter did not choose. */
            blockTime: seal.anchor.blockTime,
            explorer: `${explorerBaseFor(seal.anchor.chainId)}/tx/${seal.anchor.transactionHash}`,
          }
        : null,
      /* Published rather than hidden: an unanchored seal with no reason
         is indistinguishable from one somebody chose not to anchor. */
      anchorError: seal.anchor ? null : seal.anchorError,
      document: `${origin}/api/v1/seals/${seal.hash}`,
    }));

  return apiJson({
    seals,
    anchorChainId: sealChain(),
    anchorExplorer: explorer,
    howToVerify: [
      'Fetch the document URL. Those bytes are exactly what was hashed; do not reformat them before hashing.',
      'keccak256 the UTF-8 bytes of the document. The result must equal the seal hash.',
      'Call eth_getTransactionByHash on the anchor transaction. Its input data is that same hash, and its block timestamp is when the claim was fixed.',
      'Compare an old seal against today\'s /api/v1/agents to see exactly which claims Pokter has changed since.',
      'Download /api/v1/seals/verifier to do all of it without installing anything.',
    ],
    scope:
      'Each seal covers Pokter\'s own measurements and judgments: verdict, category, probe counts, observed days, the signed price, and the attestation count. Operator-declared text is not sealed, because it is not Pokter\'s to commit to. A seal proves when a claim was published, never that it was true.',
  });
}
