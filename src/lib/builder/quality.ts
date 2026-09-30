import type { DiagnosticCheck } from '@/lib/diagnostic/checks';

export type Readiness = 'ready' | 'attention' | 'incomplete';

export interface QualitySummary {
  readiness: Readiness;
  passed: number;
  failed: number;
  unknown: number;
  score: number;
}

/**
 * A presentation summary, not a trust score.
 *
 * Unknown observations do not become failures and the percentage is always
 * labelled as check completion in the UI. Keeping this separate from ranking
 * prevents an operator-facing checklist from quietly becoming buyer evidence.
 */
export function summarizeQuality(checks: DiagnosticCheck[]): QualitySummary {
  const passed = checks.filter((check) => check.status === 'pass').length;
  const failed = checks.filter((check) => check.status === 'fail').length;
  const unknown = checks.filter((check) => check.status === 'unknown').length;
  const score = checks.length === 0 ? 0 : Math.round((passed / checks.length) * 100);

  return {
    readiness:
      failed > 0 ? 'attention' : unknown > 0 ? 'incomplete' : 'ready',
    passed,
    failed,
    unknown,
    score,
  };
}
