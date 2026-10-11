import { feedbackDocument } from '@/lib/reviews/onchain';
import { getReviewStore } from '@/lib/reviews/store';

export const dynamic = 'force-dynamic';

/**
 * One review as the document its ERC-8004 feedback entry points at.
 *
 * Served as exact text, byte for byte what was hashed, so anyone holding
 * the on-chain entry can fetch this and check the hash. Hidden reviews are
 * not served.
 */
export async function GET(_request: Request, context: { params: Promise<{ chainId: string; jobId: string }> }): Promise<Response> {
  const { chainId, jobId } = await context.params;
  if (!/^\d{1,6}$/.test(chainId) || !/^\d{1,18}$/.test(jobId)) {
    return Response.json({ error: 'A numeric chain and job id are required.' }, { status: 400 });
  }
  const review = getReviewStore().get(Number(chainId), jobId);
  if (!review || review.visibility === 'hidden') return Response.json({ error: 'No published review for this job.' }, { status: 404 });
  return new Response(feedbackDocument(review), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}
