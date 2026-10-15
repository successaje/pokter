/**
 * Guided fields for a prose brief format an agent publishes.
 *
 * Stockroom's card gives one example and nothing else: "Desk brief for
 * shorting 0.01 NVDAB against 10 USDT over the weekend". Offered as a
 * template, its figures read as a suggestion, and a buyer who funds it
 * unchanged pays for a brief on the operator's example position. The
 * format holds five decisions (side, size, bStock, collateral, horizon);
 * asked as questions, each is the buyer's.
 *
 * A recipe applies only where an agent's own example matches its pattern,
 * so it never invents a format an agent did not publish. The example's
 * values become placeholders, never defaults.
 */

export interface RecipeField {
  key: string;
  label: string;
  kind: 'choice' | 'number' | 'symbol' | 'text';
  options?: Array<{ value: string; label: string }>;
  hint?: string;
}

export interface BriefRecipe {
  id: string;
  title: string;
  fields: RecipeField[];
  /** The values in a brief written in this format, or null when it is not. */
  parse(text: string): Record<string, string> | null;
  compose(values: Record<string, string>): string;
}

const LENDING_DESK = /^Desk brief for (shorting|borrowing) (\d+(?:\.\d+)?) ([A-Za-z0-9]{2,15}) against (\d+(?:\.\d+)?) ([A-Za-z0-9]{2,15}) (.{3,80}?)\.?$/i;

const lendingDesk: BriefRecipe = {
  id: 'lending-desk',
  title: 'Borrow desk brief',
  fields: [
    { key: 'side', label: 'Side', kind: 'choice', options: [{ value: 'shorting', label: 'Short it' }, { value: 'borrowing', label: 'Borrow it' }] },
    { key: 'size', label: 'Size', kind: 'number', hint: 'How many units of the bStock' },
    { key: 'asset', label: 'bStock', kind: 'symbol', hint: 'The Binance bStock symbol' },
    { key: 'collateral', label: 'Collateral', kind: 'number', hint: 'How much you would post' },
    { key: 'collateralToken', label: 'Collateral token', kind: 'symbol' },
    { key: 'horizon', label: 'Horizon', kind: 'text', hint: 'For how long, in your words' },
  ],
  parse(text) {
    const m = text.trim().match(LENDING_DESK);
    if (!m) return null;
    return { side: m[1].toLowerCase(), size: m[2], asset: m[3].toUpperCase(), collateral: m[4], collateralToken: m[5].toUpperCase(), horizon: m[6].trim() };
  },
  compose(v) {
    return `Desk brief for ${v.side} ${v.size} ${v.asset.toUpperCase()} against ${v.collateral} ${v.collateralToken.toUpperCase()} ${v.horizon.trim()}`;
  },
};

const RECIPES: BriefRecipe[] = [lendingDesk];

/** The recipe an agent's own example is written in, if any. */
export function recipeForExample(example: string): BriefRecipe | null {
  return RECIPES.find((recipe) => recipe.parse(example) !== null) ?? null;
}

export function recipeById(id: string | undefined): BriefRecipe | null {
  return RECIPES.find((recipe) => recipe.id === id) ?? null;
}

/** What is missing or malformed, by field label, before the brief can be composed. */
export function recipeProblems(recipe: BriefRecipe, values: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const field of recipe.fields) {
    const value = (values[field.key] ?? '').trim();
    // "bStock" keeps its capital; "Collateral token" reads as a phrase.
    const name = field.label[0].toLowerCase() + field.label.slice(1);
    if (!value) problems.push(field.kind === 'choice' ? `choose a ${name}` : `${name} is empty`);
    else if (field.kind === 'number' && !(/^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0)) problems.push(`${name} must be a positive number`);
    else if (field.kind === 'symbol' && !/^[A-Za-z0-9]{2,15}$/.test(value)) problems.push(`${name} must be a token symbol`);
    else if (field.kind === 'choice' && !field.options?.some((o) => o.value === value)) problems.push(`choose a ${name}`);
    else if (field.kind === 'text' && (value.length < 3 || value.length > 80)) problems.push(`${name} must be 3 to 80 characters`);
  }
  return problems;
}
