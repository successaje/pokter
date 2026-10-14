import { apiOptions, apiRateLimit } from '@/lib/api/respond';
import { sealVerifierResponse } from '@/lib/seals/verifier';

export function OPTIONS() {
  return apiOptions();
}

export function GET(request: Request) {
  const limited = apiRateLimit(request, 'seal-verifier');
  if (limited) return limited;
  return sealVerifierResponse();
}
