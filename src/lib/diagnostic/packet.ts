import type { DiagnosticReport } from './checks';

/**
 * A plain-text summary of a check, for a builder to paste into an issue or
 * a message to whoever runs their agent.
 *
 * Built from what the report already shows, and redacted on the way out:
 * query strings (where API keys tend to ride), bearer tokens and anything
 * labelled as a key or secret are replaced. Copying it sends nothing
 * anywhere; it only fills the clipboard.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s?#"']+)\?[^\s#"']*/gi, '$1?[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(api[-_]?key|apikey|token|secret|password|authorization)(["']?\s*[:=]\s*["']?)[^\s"',;]+/gi, '$1$2[redacted]');
}

const MARK: Record<string, string> = { pass: 'PASS', fail: 'FAIL', unknown: 'UNKNOWN' };

export function diagnosticPacket(report: DiagnosticReport, origin = 'https://pokter.xyz'): string {
  const lines = [
    `Pokter check: ${report.name ?? 'unnamed agent'} (ERC-8004 ${report.chainId}:${report.tokenId})`,
    `Observed: ${report.observedAt}`,
    report.agentWallet ? `Agent wallet: ${report.agentWallet}` : 'Agent wallet: none registered',
    '',
    ...report.checks.flatMap((check) => [
      `[${MARK[check.status] ?? check.status.toUpperCase()}] ${check.label}${check.code ? ` (code: ${check.code})` : ''}`,
      `  Seen: ${check.detail}`,
      ...(check.remedy ? [`  Fix: ${check.remedy}`] : []),
      ...(check.fixUrl ? [`  Docs: ${check.fixUrl.startsWith('/') ? `${origin}${check.fixUrl}` : check.fixUrl}`] : []),
    ]),
    '',
    `Re-run: ${origin}/studio/import`,
  ];
  return redactSecrets(lines.join('\n'));
}
