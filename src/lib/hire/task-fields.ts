/**
 * A task the agent declared as a JSON example, edited as fields.
 *
 * Agents that take a structured input publish an example on their card,
 * such as {"skill":"health_factor","wallet":"0x0000…0000"}, and the hire
 * form used to drop it into a textarea as raw JSON, zero address included.
 * A buyer had to know to find the address inside the braces and replace
 * it. Here each key becomes a field of the type the example used, values
 * that are plainly placeholders start empty and required, and the JSON the
 * agent receives is written back with the same keys, order and types.
 */
export type TaskFieldKind = 'text' | 'number' | 'boolean' | 'json';

export interface TaskField {
  key: string;
  kind: TaskFieldKind;
  /** Current value, as typed. Empty when the example held a placeholder. */
  value: string;
  /** The example's own value, shown as a hint. */
  example: string;
  /** An address the buyer is likely to mean their own wallet for. */
  wallet: boolean;
  /** Routing the agent needs as written (e.g. `skill`); shown, not edited. */
  fixed: boolean;
  /** Must be filled before the job can be funded. */
  required: boolean;
}

const FIXED_KEYS = /^(skill|method|action|type|version)$/i;
const WALLET_KEYS = /^(wallet|address|account|owner|user|borrower|holder|position_owner)$/i;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/i;
const PLACEHOLDER = /^(<.*>|\{\{.*\}\}|your[_ -].*|0x\.\.\.|\.\.\.|x+)$/i;

function isPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text === '' || ZERO_ADDRESS.test(text) || PLACEHOLDER.test(text);
}

/** Fields for a flat JSON object task, or null when the task is prose or not editable as fields. */
export function taskFields(task: string): TaskField[] | null {
  const trimmed = task.trim();
  if (!trimmed.startsWith('{')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 12) return null;
  return entries.map(([key, raw]) => {
    const kind: TaskFieldKind =
      typeof raw === 'string' ? 'text' : typeof raw === 'number' ? 'number' : typeof raw === 'boolean' ? 'boolean' : 'json';
    const example = kind === 'json' ? JSON.stringify(raw) : String(raw);
    const placeholder = isPlaceholder(raw);
    const wallet = kind === 'text' && (WALLET_KEYS.test(key) || ADDRESS.test(String(raw)));
    const fixed = kind === 'text' && FIXED_KEYS.test(key) && !placeholder;
    return { key, kind, value: placeholder ? '' : example, example, wallet, fixed, required: placeholder || wallet };
  });
}

/** The JSON the agent receives, with each value back in the example's type. */
export function composeTask(fields: TaskField[]): string {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = field.value.trim();
    if (field.kind === 'number') {
      const number = Number(value);
      out[field.key] = value !== '' && Number.isFinite(number) ? number : value;
    } else if (field.kind === 'boolean') {
      out[field.key] = value === 'true';
    } else if (field.kind === 'json') {
      try {
        out[field.key] = JSON.parse(value);
      } catch {
        out[field.key] = value;
      }
    } else {
      out[field.key] = value;
    }
  }
  return JSON.stringify(out);
}

/** Required fields still empty, and wallet fields that are not an address. */
export function taskFieldProblems(fields: TaskField[]): string[] {
  return fields.flatMap((field) => {
    const value = field.value.trim();
    if (field.required && value === '') return [`${field.key} is required`];
    if (field.wallet && value !== '' && !ADDRESS.test(value)) return [`${field.key} must be a 0x address`];
    if (field.kind === 'number' && value !== '' && !Number.isFinite(Number(value))) return [`${field.key} must be a number`];
    return [];
  });
}

/** Fill empty wallet fields with the buyer's connected wallet. Returns null when nothing changes. */
export function withWallet(fields: TaskField[], address: string): TaskField[] | null {
  let changed = false;
  const next = fields.map((field) => {
    if (!field.wallet || field.value.trim() !== '') return field;
    changed = true;
    return { ...field, value: address };
  });
  return changed ? next : null;
}
