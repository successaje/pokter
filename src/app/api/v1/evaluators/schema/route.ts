import { EVALUATOR_ATTESTATION_EXAMPLE, EVALUATOR_ATTESTATION_SCHEMA } from '@/lib/evaluators/schema';
import { apiJson, apiOptions, apiRateLimit } from '@/lib/api/respond';

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request) {
  const limited = apiRateLimit(request, 'evaluator-schema');
  if (limited) return limited;
  return apiJson({
    schema: EVALUATOR_ATTESTATION_SCHEMA,
    example: EVALUATOR_ATTESTATION_EXAMPLE,
    identityRule: 'The on-chain transaction sender is the evaluator identity. method.measuredBy is display text and cannot establish independence.',
    independenceRule: 'The sender must be readable from chain and must be neither a declared Pokter wallet nor the agent owner. Distinct labels from one sender remain one measurer.',
    publication: 'Encode the JSON as a data:application/json;base64 URI and publish it as ERC-8004 feedback with the matching numeric value and decimals.',
  });
}
