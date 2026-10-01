const TEST_CAPABILITY = /^(?:pokter[-_ ]preview|dry[-_ ]run|simulate|preview)$/i;

export function selectTrialCapability(capabilities: string[]): string | null {
  return capabilities.find((capability) => TEST_CAPABILITY.test(capability.trim())) ?? null;
}

export function interpretTrialResponse(payload: unknown): {
  valid: boolean;
  summary: string;
} {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, summary: 'The response was not a JSON object.' };
  }
  const root = payload as Record<string, unknown>;
  if (root.jsonrpc !== '2.0') {
    return { valid: false, summary: 'The response did not declare JSON-RPC 2.0.' };
  }
  if (root.error && typeof root.error === 'object') {
    return { valid: false, summary: 'The endpoint returned a protocol error.' };
  }
  if (!('result' in root)) {
    return { valid: false, summary: 'The response did not contain a result.' };
  }
  return { valid: true, summary: 'A structured JSON-RPC result was returned.' };
}
