import { shortAddress } from '@/lib/ui/format';
import type { VerifiedReview } from '@/lib/reviews/model';
import { ReportReview } from './ReportReview';

export function VerifiedReviewsPanel({ reviews }: { reviews: VerifiedReview[] }) {
  if (reviews.length === 0) return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-5">
      <p className="text-sm font-medium">No verified buyer reviews yet</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-muted)]">A review appears only after an ERC-8183 job is completed and the on-chain buyer signs the review.</p>
    </div>
  );

  const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  return <div className="flex flex-col gap-4">
    <div className="flex items-end gap-3">
      <strong className="tabular text-3xl">{average.toFixed(1)}</strong>
      <span className="pb-1 text-[11px] text-[color:var(--text-muted)]">out of 5 · {reviews.length} verified {reviews.length === 1 ? 'job' : 'jobs'}</span>
    </div>
    <ul className="flex flex-col gap-3">
      {reviews.map((review) => <li key={`${review.chainId}:${review.jobId}`} className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="font-medium">{'★'.repeat(review.rating)}<span className="text-[color:var(--text-faint)]">{'★'.repeat(5 - review.rating)}</span></span>
          <span className="text-[color:var(--positive)]">Verified job #{review.jobId}</span>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[color:var(--text-muted)]">
          <div><dt className="inline text-[color:var(--text-faint)]">Delivered </dt><dd className="inline">{review.deliveredAsPromised ? 'as promised' : 'not as promised'}</dd></div>
          <div><dt className="inline text-[color:var(--text-faint)]">Timing </dt><dd className="inline">{review.speed}</dd></div>
          <div><dt className="inline text-[color:var(--text-faint)]">Hire again </dt><dd className="inline">{review.wouldHireAgain ? 'yes' : 'no'}</dd></div>
        </dl>
        {review.comment && <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">{review.comment}</p>}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[10px] text-[color:var(--text-faint)]">Signed by {shortAddress(review.buyer)}</p>
          <ReportReview chainId={review.chainId} jobId={review.jobId} />
        </div>
      </li>)}
    </ul>
  </div>;
}
