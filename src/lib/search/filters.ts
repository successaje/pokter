import { CATEGORIES } from '@/lib/agents/categories';

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

export const FILTER_GROUPS: FilterGroup[] = [
  {
    label: 'Evidence',
    hint: 'What has been observed about the agent',
    options: [
      { query: 'is:proven', label: 'Proven' },
      { query: 'is:reliable', label: 'Reliable' },
      { query: 'is:emerging', label: 'Intermittent' },
      { query: 'is:observed', label: 'Observed' },
      { query: 'is:unproven', label: 'Not measured' },
      { query: 'is:failing', label: 'Failing' },
    ],
  },
  {
    /*
     * Added when the catalogue grew to both chains the campaign accepts.
     *
     * The two behave differently and the difference is the one a buyer
     * most needs: an agent on the escrow chain receives the job and
     * delivers it itself, while one registered away from it cannot see
     * the job at all and Pokter's seller stands in.
     *
     * It is a filter rather than a change to the ranking. Testnet agents
     * are new and mostly unmeasured, so evidence-first ordering puts them
     * below agents with records — which is correct, and is the whole
     * argument of the product. What they needed was a way to be found on
     * purpose, not a thumb on the scale.
     */
    label: 'Who delivers',
    hint: 'Whether the agent runs the job or Pokter stands in',
    options: [
      { query: 'is:testnet', label: 'The agent itself' },
      { query: 'is:mainnet', label: "Pokter's seller" },
    ],
  },
  {
    label: 'Endpoint',
    hint: 'Whether it answers when called',
    options: [
      { query: 'is:live', label: 'Has answered' },
      { query: 'is:responsive', label: 'Answered recently' },
      { query: 'is:offline', label: 'No probe answered' },
      { query: 'is:measured', label: 'Probed by Pokter' },
      { query: 'is:unmeasured', label: 'Never probed' },
      { query: 'has:endpoint', label: 'Publishes an endpoint' },
    ],
  },
  {
    label: 'Hiring',
    hint: 'Price and the action Pokter can safely offer',
    options: [
      { query: 'is:hireable', label: 'Available to hire' },
      { query: 'has:price', label: 'Has current signed price' },
      { query: 'has:price<=0.1', label: 'Priced at 0.10 $U or less' },
      { query: 'is:escrow-only', label: 'No standing wallet access' },
    ],
  },
  {
    label: 'Category',
    /* Worth saying: this is the only group sourced from the publisher. */
    hint: 'Publisher-declared, not observed',
    /*
       * One row per category, not one per alias. The parser accepts
       * `tag:rebalance` and `tag:rebalancing` alike — that is what the alias
       * table is for — but offering both in the shelf listed "Rebalancing 15"
       * above "Rebalance 15", two rows for one set, which reads as a counting
       * bug rather than as a synonym.
       */
    options: CATEGORIES.map(({ id, label }) => ({
      query: `tag:${id}`,
      label,
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
