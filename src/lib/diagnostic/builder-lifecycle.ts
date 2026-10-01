import type { DiagnosticCheck } from './checks';

export interface BuilderLifecycle {
  registered: boolean;
  enrolled: boolean;
  measured: boolean;
  listed: boolean;
  hireable: boolean;
  probeCount: number;
}

function passed(checks: DiagnosticCheck[], id: string) {
  return checks.some((check) => check.id === id && check.status === 'pass');
}

/** Derive builder-facing states only from observations Pokter can substantiate. */
export function deriveBuilderLifecycle({
  chainId,
  checks,
  enrolled,
  probeCount,
}: {
  chainId: number;
  checks: DiagnosticCheck[];
  enrolled: boolean;
  probeCount: number;
}): BuilderLifecycle {
  const registered = passed(checks, 'identity');
  const independentlyAttested = passed(checks, 'attestations');
  const measured = probeCount > 0 || independentlyAttested;
  const listed = chainId === 56 && registered;
  const hireable = ['identity', 'endpoint', 'liveness', 'quote'].every((id) => passed(checks, id));
  return { registered, enrolled, measured, listed, hireable, probeCount };
}
