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
  /**
   * Declared as the buyer's own wallet by its key (wallet, account, owner,
   * user, borrower…): the only field filled from the connected wallet.
   */
  wallet: boolean;
  /**
   * Holds some other address (a token, pool or contract). Validated as an
   * address, never auto-filled: a zero-address token placeholder used to be
   * filled with the buyer's own wallet because it looked like an address.
   */
  address: boolean;
  /** Routing the agent needs as written (e.g. `skill`); shown, not edited. */
  fixed: boolean;
  /** Must be filled before the job can be funded. */
  required: boolean;
}

const FIXED_KEYS = /^(skill|method|action|type|version)$/i;
const WALLET_KEYS = /^(wallet|wallet_address|account|owner|user|user_address|borrower|holder|position_owner)$/i;
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
    const wallet = kind === 'text' && WALLET_KEYS.test(key);
    const address = kind === 'text' && !wallet && (ADDRESS.test(String(raw)) || /(^|_)(address|token|pool|contract)$/i.test(key));
    const fixed = kind === 'text' && FIXED_KEYS.test(key) && !placeholder;
    return { key, kind, value: placeholder ? '' : example, example, wallet, address, fixed, required: placeholder || wallet || (address && placeholder) };
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

/** Required fields still empty, and values that are not of their field's type. */
export function taskFieldProblems(fields: TaskField[]): string[] {
  return fields.flatMap((field) => {
    const value = field.value.trim();
    if (field.required && value === '') return [`${field.key} is required`];
    if ((field.wallet || field.address) && value !== '' && !ADDRESS.test(value)) return [`${field.key} must be a 0x address`];
    if ((field.wallet || field.address) && ZERO_ADDRESS.test(value)) return [`${field.key} needs a real address, not the zero address`];
    if (field.kind === 'number' && value !== '' && !Number.isFinite(Number(value))) return [`${field.key} must be a number`];
    if (field.kind === 'json' && value !== '') {
      try {
        JSON.parse(value);
      } catch {
        return [`${field.key} must be valid JSON`];
      }
    }
    return [];
  });
}

/**
 * The current task read against a fixed field layout.
 *
 * The editor used to infer field types from the task as it changed: typing
 * "eight" into a number field wrote a string, the next reading made it a
 * text field, and the error vanished. The layout now comes from the
 * template the buyer started from and stays put; values are read into it,
 * so a wrong type stays wrong, and visible, until it is fixed.
 */
export function fieldsWithValues(schema: TaskField[], task: string): TaskField[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(task.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const values = parsed as Record<string, unknown>;
  return schema.map((field) => {
    if (!(field.key in values)) return { ...field, value: '' };
    const raw = values[field.key];
    const value = field.kind === 'json' ? (typeof raw === 'string' ? raw : JSON.stringify(raw)) : raw === null || raw === undefined ? '' : String(raw);
    return { ...field, value };
  });
}

/**
 * Everything wrong with a task against its layout: not JSON, a required key
 * missing, a value of the wrong type. Raw JSON edits are held to the same
 * rules as the fields, so switching modes cannot bypass them.
 */
export function taskProblems(schema: TaskField[] | null, task: string): string[] {
  if (!schema) {
    const own = taskFields(task);
    return own ? taskFieldProblems(own) : [];
  }
  const fields = fieldsWithValues(schema, task);
  if (!fields) return ['The task must stay a JSON object with the fields the agent asked for'];
  return taskFieldProblems(fields);
}

/** Fill empty fields declared as the buyer's wallet, and no other, with the connected wallet. Returns null when nothing changes. */
export function withWallet(fields: TaskField[], address: string): TaskField[] | null {
  let changed = false;
  const next = fields.map((field) => {
    if (!field.wallet || field.value.trim() !== '') return field;
    changed = true;
    return { ...field, value: address };
  });
  return changed ? next : null;
}
