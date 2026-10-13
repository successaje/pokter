import { apiOptions, apiRateLimit } from '@/lib/api/respond';
import { receiptVerifierResponse } from '@/lib/proof/verifier';

export function OPTIONS() {
  return apiOptions();
}

export function GET(request: Request) {
  const limited = apiRateLimit(request, 'receipt-verifier');
  if (limited) return limited;
  return receiptVerifierResponse();
}
