/**
 * The terms every Pokter negotiation is conducted under.
 *
 * Exported because the hire path has to negotiate under exactly these and
 * then fund under exactly these: the seller's signature covers the terms, so
 * two copies that drifted apart would produce a quote that does not match
 * the job it was obtained for, and the seller would be right to refuse it.
 *
 * In its own module so the hire page can show these words in the browser;
 * `quote.ts` reaches agent endpoints and is not for the client bundle.
 */
export const POKTER_TERMS = {
  deliverables: 'A JSON assessment with assumptions and data sources.',
  quality_standards:
    'Read-only analysis only. Execute no transaction and move no funds.',
} as const;
