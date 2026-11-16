import type { Provenance } from './v1';

/**
 * What each `provenance` value means, said once.
 *
 * llms.txt said `attested` "is signed by the agent's registered wallet",
 * and /methodology said it was "measurements other parties published on
 * chain". The API uses it for both: an agent's signed price, and the
 * independent measurers behind "Independently proven". A model reading
 * llms.txt would take an independent attestation for the agent's own
 * signature. llms.txt also left out `calculated`. Both pages now read
 * from here, and /api/v1 lists its enum from the same entries.
 *
 * Ordered as /api/v1 has always listed them.
 */
export const PROVENANCE: ReadonlyArray<{ id: Provenance; label: string; meaning: string }> = [
  {
    id: 'onchain',
    label: 'On chain',
    meaning: 'Read from the ERC-8004 registry or the ERC-8183 escrow contracts: registrations, jobs, deliveries and settlements.',
  },
  {
    id: 'attested',
    label: 'Attested',
    meaning: 'Signed by someone other than Pokter. For a price, that is the agent’s registered wallet; for a measurement, another party publishing through the ERC-8004 reputation registry, decoded with its own methodology and disclosed defects. Pokter checks who signed it, not whether it is right.',
  },
  {
    id: 'pokter-measured',
    label: 'Pokter measured',
    meaning: 'Pokter’s own probes of the agent’s endpoint and its own checks. First-party, and never counted as independent.',
  },
  {
    id: 'calculated',
    label: 'Calculated',
    meaning: 'Pokter’s arithmetic over the other kinds, such as a count, a score or a category. Only as good as what it was calculated from, which each figure’s source names.',
  },
  {
    id: 'declared',
    label: 'Declared',
    meaning: 'What the operator wrote about their own agent, in its ERC-8004 registration and agent card. Shown, never verified.',
  },
];
