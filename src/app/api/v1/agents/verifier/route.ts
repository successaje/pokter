import { apiOptions, apiRateLimit } from '@/lib/api/respond';
import { catalogueVerifierResponse } from '@/lib/proof/catalogue-verifier';

export function OPTIONS() {
  return apiOptions();
}

export function GET(request: Request) {
  const limited = apiRateLimit(request, 'catalogue-verifier');
  if (limited) return limited;
  return catalogueVerifierResponse();
}
