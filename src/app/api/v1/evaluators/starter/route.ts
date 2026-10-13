import { apiOptions, apiRateLimit } from '@/lib/api/respond';
import { evaluatorStarterResponse } from '@/lib/evaluators/starter-response';

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request) {
  const limited = apiRateLimit(request, 'evaluator-starter');
  if (limited) return limited;

  return evaluatorStarterResponse();
}
