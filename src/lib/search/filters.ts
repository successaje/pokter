import { VOCABULARY } from './query';

/**
 * The filter shelf, defined once.
 *
 * It used to live inside the search component, which meant only the browser
 * could see it — so the page that already holds every agent could not say how
 * many of them each option would match. A filter that does not tell you what
 * it will do costs a page load to find out.
 *
 * Each option carries the query it applies and the words a person reads.
 * `is:proven` is precise and also jargon; the shelf shows "Proven" and puts
 * the query in the title attribute for anyone who wants to type it.
 */
export interface FilterOption {
  /** The qualifier appended to the search query. */
  query: string;
  label: string;
}

export interface FilterGroup {
  label: string;
  hint: string;
  options: FilterOption[];
}

/** Title-cases a registry tag for display: `grid-trading` → `Grid trading`. */
function tagLabel(tag: string): string {
  const spaced = tag.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const FILTER_GROUPS: FilterGroup[] = [
  {
    label: 'Evidence',
    hint: 'What has been observed about the agent',
    options: [
      { query: 'is:proven', label: 'Proven' },
      { query: 'is:emerging', label: 'Emerging' },
      { query: 'is:unproven', label: 'Unproven' },
      { query: 'is:failing', label: 'Failing' },
    ],
  },
  {
    label: 'Endpoint',
    hint: 'Whether it answers when called',
    options: [
      { query: 'is:live', label: 'Answering now' },
      { query: 'is:offline', label: 'Not answering' },
      { query: 'is:measured', label: 'Probed by Pokter' },
      { query: 'is:unmeasured', label: 'Never probed' },
      { query: 'has:endpoint', label: 'Publishes an endpoint' },
    ],
  },
  {
    label: 'Category',
    /* Worth saying: this is the only group sourced from the publisher. */
    hint: 'Publisher-declared, not observed',
    options: VOCABULARY.tags.map((tag) => ({
      query: `tag:${tag}`,
      label: tagLabel(tag),
    })),
  },
  {
    label: 'Depth',
    hint: 'How much evidence exists',
    options: [
      { query: 'has:attestations', label: 'Has attestations' },
      { query: 'has:attestations>1', label: 'More than one attestation' },
      { query: 'has:probes>10', label: 'Over 10 probes' },
      { query: 'has:measurers>1', label: 'More than one measurer' },
      { query: 'has:days>1', label: 'Observed over a day' },
    ],
  },
];
