import { apiJson, apiOptions, apiRateLimit } from '@/lib/api/respond';
import { loadEvaluationChallenge } from '@/lib/evaluators/challenge-server';

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request) {
  const limited = apiRateLimit(request, 'evaluator-challenge', 20);
  if (limited) return limited;
  const challenge = await loadEvaluationChallenge();
  return apiJson({ version: 'v1', ...challenge });
}
