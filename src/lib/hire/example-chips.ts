import { WALLET_PLACEHOLDER, nonAccountAddresses } from './example-wallet';

/**
 * Examples offered as small chips under the brief, each filling the field.
 *
 * The chips replaced three cards that repeated the same provenance sentence
 * and cut each example off mid-word ("Venus health factor for 0x0…"). A
 * chip needs a name a buyer can choose by, so the label says what the
 * example asks for, read from its own words. Nothing is invented: a label
 * that cannot be read falls back to the example's opening words.
 */
const INTENTS: Array<[RegExp, string]> = [
  // Before "health factor": an example that asks for the repay mentions both.
  [/\b(repay|restore[sd]?)\b/i, 'Repayment target'],
  [/\bliquidat/i, 'Liquidation distance'],
  [/\bhealth factor\b/i, 'Health factor'],
  [/\bcheck the \w+ position\b|\bposition of\b/i, 'Position check'],
  [/\b(in|out of) range\b|\bposition range\b/i, 'Position range'],
  [/\brebalanc/i, 'Rebalance plan'],
  [/\bgrid\b/i, 'Grid plan'],
  [/\b(yield|apy|apr)\b/i, 'Yield comparison'],
  [/\b(honeypot|rug|token safety|token risk)\b/i, 'Token safety'],
];

const ADDRESS = /0x[0-9a-fA-F]{40}|0x(?:…|\.{2,})(?![0-9a-fA-F])/g;

/**
 * The example with every account address replaced by a placeholder the
 * buyer fills; token and contract addresses stay. In a JSON example the
 * field is emptied instead, so the editor shows it as a field to fill and
 * offers the connected wallet (`withWallet` fills only empty fields).
 */
export function withWalletPlaceholder(example: string): string {
  const keep = nonAccountAddresses(example);
  const blank = example.trim().startsWith('{') ? '' : WALLET_PLACEHOLDER;
  return example.replace(ADDRESS, (match) => (keep.has(match.toLowerCase()) ? match : blank));
}

function openingWords(example: string, max = 26): string {
  const words = withWalletPlaceholder(example).replace(/\[wallet address\]/g, '').replace(/\s+/g, ' ').trim();
  if (words.length <= max) return words;
  return `${words.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

export function exampleLabel(example: string): string {
  if (example.trim().startsWith('{')) return openingWords(example);
  return INTENTS.find(([pattern]) => pattern.test(example))?.[1] ?? openingWords(example);
}

/** Labels for a set of examples, read together so no two chips share a name. */
export function exampleLabels(examples: readonly string[]): string[] {
  const read = examples.map(exampleLabel);
  return read.map((label, i) => (read.indexOf(label) === i && read.lastIndexOf(label) === i ? label : openingWords(examples[i])));
}
