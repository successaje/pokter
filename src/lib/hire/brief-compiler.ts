import { pickWorkSkill } from '@/lib/erc8183/courier-parse';
import { skillRequestData } from '@/lib/erc8183/skill-request';
import { subjectKeyForSkill } from '@/lib/erc8183/brief-subject';
import { nonAccountAddresses } from './example-wallet';
import { composeTask, fieldsWithValues, taskFields, taskFieldProblems, type TaskField } from './task-fields';
import type { ChainId } from '@/lib/scan/types';

/**
 * Turning what a buyer wrote into the request an agent will actually read.
 *
 * Pokter asked buyers to type a brief and then sent it on without ever
 * establishing what the agent on the other end accepts. Job 1585 was the
 * bill for that: quoted, signed and funded with prose, while its skill read
 * its subject from a structured field nothing filled. The repair (see
 * `skill-request`) covers one skill. This is the general question asked for
 * every agent, before the money moves: what does this skill say it takes,
 * what did the buyer actually supply, and what is still missing.
 *
 * Three things it refuses to do, each of them a way the old flow lost money.
 *
 *  - **It invents nothing.** No wallet, chain, asset, amount, risk limit or
 *    subject is ever supplied by Pokter. A value reaches the payload only
 *    from the buyer's own words or from the agent's own routing declaration;
 *    anything else is reported as missing and asked for. That includes the
 *    operator's own example figures: Brinkwatch's card names a real wallet
 *    and Gridloom's names 1000 USDT, and a buyer who funded either unchanged
 *    paid for a report on somebody else's position at somebody else's size.
 *  - **It does not pretend.** Where the skill publishes no input format, or
 *    no skill could be read at all, that is said in those words and the
 *    brief travels exactly as written. A compiler that reported success for
 *    an agent it could not read would be the old failure with a new screen
 *    in front of it.
 *  - **It reads a card as data.** An agent's `examples` are consulted for
 *    their shape — which keys, of which types — and for nothing else. No
 *    text out of a card becomes an instruction, and a key that would
 *    overwrite one of Pokter's own envelope fields (`read_only`,
 *    `constraints`, the job id) is dropped rather than honoured. An
 *    operator cannot widen what their own hire is permitted to do by
 *    publishing a field name.
 *
 * Pure, and in `lib/hire` rather than behind `server-only`, because the
 * buyer's review screen, all three server hire surfaces and the tests have
 * to reach the same verdict. The skill is chosen through the courier's own
 * `pickWorkSkill`, so "the skill the buyer was shown" and "the skill the
 * brief is delivered to" are the same choice rather than two that agree
 * until one of them is edited.
 */

/** A skill as the card declared it, from either the server's card read or the page's props. */
export interface DeclaredSkillLike {
  /** The card's own skill id. Absent on an older reading; the name is then matched instead. */
  id?: string;
  name: string;
  kind?: string;
  description?: string | null;
  examples: readonly string[];
}

/**
 * How well Pokter knows what this skill takes.
 *
 * - `adapter` — a skill Pokter has written an adapter for (`agent_evidence`).
 *   Its contract is known exactly, because the card states it and Pokter
 *   reads the same field the agent does.
 * - `structured` — the skill publishes an example that parses as a JSON
 *   object. Of 96 live agents surveyed on 22 October 2026, five do; the
 *   other 91 do not, which is why the three weaker states below exist and
 *   are not treated as faults.
 * - `prose` — the skill publishes example requests in words. The shape
 *   cannot be checked, so the buyer's text travels verbatim and only what
 *   every example plainly names is asked for.
 * - `unpublished` — a skill was resolved and it documents no input at all.
 * - `unestablished` — no skill could be read: no card, no endpoint, or
 *   nothing on it but escrow plumbing.
 */
export type BriefContract = 'adapter' | 'structured' | 'prose' | 'unpublished' | 'unestablished';

/** Where a value in the compiled request came from. Never "Pokter decided". */
export type InputSource =
  /** Read out of what the buyer wrote. */
  | 'buyer'
  /** Routing the agent declared and requires as written, e.g. `"skill": "vault_overview"`. */
  | 'declared-routing';

export interface CompiledInput {
  key: string;
  /** The key as a reader should see it: `targetHealthFactor` reads as "target health factor". */
  label: string;
  value: string;
  kind: TaskField['kind'];
  source: InputSource;
  /**
   * Changing it changes the work, so a price signed for the old value does
   * not cover the new one. Everything the buyer supplied is material;
   * declared routing is not, because it cannot differ without the skill
   * differing too.
   */
  material: boolean;
}

export interface MissingInput {
  key: string;
  label: string;
  /** What to ask the buyer. A question, never a filled-in guess. */
  question: string;
  /** The operator's own example value, shown as a hint and never as a default. */
  hint: string | null;
  /**
   * The buyer's connected wallet, offered for a field the card declares as
   * the caller's own account and for no other.
   *
   * Offered rather than written in. `withWallet` fills these silently today,
   * and silence is how an address nobody chose ends up inside a signed
   * brief — the same class of defect as the example wallet that funded two
   * mainnet jobs that can never complete.
   */
  suggestion: string | null;
}

export interface CompiledBrief {
  /**
   * What the buyer typed, byte for byte.
   *
   * Kept whole and separate from the payload so the review screen can show
   * both. A compiler that only returned its own output would ask the buyer
   * to confirm a request with nothing to compare it against.
   */
  intent: string;
  skill: { id: string; name: string } | null;
  contract: BriefContract;
  /** Whether Pokter established what this skill takes. False is reported, not hidden. */
  established: boolean;
  /**
   * The exact text the agent receives as its task, or null when a required
   * input is still missing.
   *
   * This string is what gets quoted, written on chain and delivered. It is
   * The binding itself is asserted where it is actually held: `outboundTask`
   * is this payload, the quote is signed over it, and the courier reads it
   * back. A helper that merely compared the string to itself was removed —
   * it was labelled as the invariant and caught nothing, because every
   * caller already had the same string on both sides.
   */
  payload: string | null;
  inputs: CompiledInput[];
  missing: MissingInput[];
  /**
   * What Pokter knows about this skill's input, in one sentence.
   *
   * Separate from `notes` because the review screen writes its own, longer
   * version of this and printing both put the same statement on the screen
   * twice in two wordings. Kept here so a caller that is not the screen —
   * `/api/hire/compile`, a log, another client — still gets the honest
   * sentence rather than having to infer it from `contract`.
   */
  statement: string | null;
  /** Exceptions: a field dropped, a value that does not fit its type. Not the statement above. */
  notes: string[];
  /** Nothing is missing, so this can go on to a price. */
  ok: boolean;
}

/*
 * The instructions Pokter sends with every brief, which a card may not set.
 *
 * `outboundBriefData` writes `read_only: true` and a constraints line that
 * forbids transactions. A compiled field named `read_only` or `constraints`
 * is an operator writing over the instruction Pokter attaches to their own
 * hire, from a document they control — so it is dropped here, where the
 * payload is built, rather than trusted not to be spread somewhere
 * downstream. `protocol`, `job_id`, `task` and `category` are Pokter's for
 * the same reason: whose job this is, and which, is not the card's to say.
 *
 * `skill` is deliberately **not** on this list. An example that routes
 * itself — HyperliquidVault publishes `{"skill":"list_vaults"}` — is naming
 * the skill it is an example of, which is the skill Pokter resolved anyway.
 * Dropping it compiled that agent's only request down to `{}`: a guard that
 * emptied a real payload in the name of a hazard the payload does not carry,
 * since it travels as a string in `task` and is never spread.
 */
const RESERVED = new Set(['task', 'task_description', 'category', 'read_only', 'constraints', 'protocol', 'job_id']);

/**
 * Keys where offering the buyer their own connected wallet is honest.
 *
 * `task-fields` already separates an account from a token, pool or contract,
 * and that distinction is load-bearing: a zero-address token placeholder
 * once got filled with the buyer's own wallet because it looked like an
 * address. So the offer is limited to the keys that name an account —
 * `wallet`, `account`, `owner` and the like, plus a bare `address`, which in
 * every structured card surveyed means the account being reported on. A
 * `vault_address` or `token` is never offered it, and even here it is a
 * labelled button showing the address, not a value written in behind the
 * buyer.
 */
const OWN_ACCOUNT_KEY = /^address$/i;

const ACCOUNT_ADDRESS = /0x[0-9a-fA-F]{40}/g;

/** `targetHealthFactor` and `target_health_factor` both read as "target health factor". */
function readable(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The words a key is made of, for finding the value the buyer wrote beside it. */
function keyWords(key: string): string[] {
  return readable(key).split(/\s+/).filter((word) => word.length >= 3);
}

/**
 * A number the buyer wrote next to this field's own name, or null.
 *
 * Deliberately narrow. "11 levels" and "levels: 11" are the buyer naming the
 * field; a loose number anywhere in the brief is not, and binding one would
 * be Pokter choosing an amount — the exact thing it must never do. More than
 * one match is treated as none, because two candidates is not an answer.
 */
function numberNamedBy(intent: string, key: string): string | null {
  const words = keyWords(key);
  if (words.length === 0) return null;
  const name = words.map((word) => word.replace(/[^a-z0-9]/g, '')).join('[\\s_-]*');
  /*
   * Bounded on both sides, or an address supplies the number.
   *
   * "account: 0x0aEe…9aB7\ntarget health factor 1.5" matched twice: once on
   * the 1.5 the buyer wrote, and once on the 7 that ends the hex, because
   * the pattern that reads "11 levels" saw "7" immediately before "target
   * health factor". Two candidates is treated as none, so the field the
   * buyer had just filled in came back as still missing.
   *
   * The trailing guard refuses a word character and a further decimal, and
   * allows a full stop: briefs end in one, and "restores 1.5." read as no
   * number at all — which failed the same field for the opposite reason.
   */
  const number = '(?<![\\w.])(\\d+(?:\\.\\d+)?)(?!\\w)(?!\\.\\d)';
  const found = new Set<string>();
  for (const pattern of [
    new RegExp(`${name}\\s*[:=]?\\s*${number}`, 'gi'),
    new RegExp(`${number}\\s*(?:%\\s*)?${name}`, 'gi'),
  ]) {
    for (const match of intent.matchAll(pattern)) found.add(match[1]);
  }
  return found.size === 1 ? [...found][0] : null;
}

/** Account addresses the buyer named, in order, excluding ones their own words call a token or pool. */
function accountsIn(intent: string): string[] {
  const notAccounts = nonAccountAddresses(intent);
  const seen = new Set<string>();
  for (const match of intent.matchAll(ACCOUNT_ADDRESS)) {
    const address = match[0];
    if (notAccounts.has(address.toLowerCase())) continue;
    if (!seen.has(address.toLowerCase())) seen.add(address.toLowerCase());
  }
  return [...seen].map((lower) => {
    const found = [...intent.matchAll(ACCOUNT_ADDRESS)].find((m) => m[0].toLowerCase() === lower);
    return found ? found[0] : lower;
  });
}

/** Any address the buyer named, account or not: a token or pool field takes one of these. */
function addressesIn(intent: string): string[] {
  const seen = new Map<string, string>();
  for (const match of intent.matchAll(ACCOUNT_ADDRESS)) {
    if (!seen.has(match[0].toLowerCase())) seen.set(match[0].toLowerCase(), match[0]);
  }
  return [...seen.values()];
}

/** The skills that are work, with the card's declaration order kept. */
function resolveSkill(
  skills: readonly DeclaredSkillLike[],
  { skillId, category }: { skillId?: string | null; category?: string },
): { id: string; name: string; examples: readonly string[] } | null {
  const named = skillId ? skills.find((skill) => (skill.id ?? skill.name) === skillId) : undefined;
  if (named) return { id: named.id ?? named.name, name: named.name, examples: named.examples };
  /*
   * The courier's own chooser, not a second one that agrees with it today.
   * The skill a buyer confirms a request for has to be the skill the brief
   * is delivered to, and the only way to be sure is to ask the same code.
   */
  const chosen = pickWorkSkill(skills, category);
  if (!chosen) return null;
  const found = skills.find((skill) => (skill.id ?? skill.name) === chosen.id);
  /*
   * A caller that knows the skill id but whose skill list does not carry it
   * — `declaredCapabilities` dropped ids until this change — still gets the
   * skill, with no examples to read. Reported as `unpublished`, which is
   * honest: Pokter has no input format for it here.
   */
  return { id: chosen.id, name: chosen.name, examples: found?.examples ?? [] };
}

/** A card example that parses as a flat JSON object, with the fields it declares. */
function structuredExample(examples: readonly string[]): { example: string; fields: TaskField[] } | null {
  for (const example of examples) {
    const fields = taskFields(example);
    if (fields) return { example, fields };
  }
  return null;
}

/**
 * An example that is plainly structured but that Pokter cannot read as
 * fields: more than the twelve keys `taskFields` compiles, nested as an
 * array, or not an object at all.
 *
 * Asked separately so the reading can say the true reason. Such a card used
 * to come back as `prose` — "publishes example requests in words", which is
 * a statement about the operator that is simply false, and the buyer has no
 * way to tell a card Pokter chose not to read from one it could not.
 */
function hasUnreadableJsonExample(examples: readonly string[]): boolean {
  return examples.some((example) => {
    const trimmed = example.trim();
    if (!/^[[{]/.test(trimmed)) return false;
    try {
      JSON.parse(trimmed);
    } catch {
      return false;
    }
    return taskFields(trimmed) === null;
  });
}

function summarySkill(skill: { id: string; name: string } | null): { id: string; name: string } | null {
  return skill ? { id: skill.id, name: skill.name } : null;
}

/**
 * Compile a plain-language request into the request the agent will read.
 *
 * `skillId` is passed by the server, which has already resolved the skill
 * through `prepareAgent`; the page passes none and the same `pickWorkSkill`
 * resolves it. Both arrive at one answer by calling one function.
 */
export function compileBrief(input: {
  intent: string;
  skills: readonly DeclaredSkillLike[];
  /** The skill the courier resolved, when the caller already knows it. */
  skillId?: string | null;
  /** The agent's category, which decides which work skill is chosen. */
  category?: string;
  /** The buyer's connected wallet. Offered for a declared account field; never written in. */
  wallet?: string | null;
  /** The chains an adapter skill serves, for reading a subject out of the brief. */
  chains?: readonly ChainId[];
  /**
   * Values the buyer gave in answer to this compiler's own questions, by
   * field key. Used as given, for the key they were given for.
   */
  answers?: BriefAnswers;
}): CompiledBrief {
  const intent = input.intent.trim();
  const answers = input.answers ?? {};
  const skill = resolveSkill(input.skills, { skillId: input.skillId, category: input.category });

  if (!skill) {
    /*
     * Said in these words on purpose. "Could not be established" is a
     * different fact from "this agent takes no input", and reporting the
     * second when the first is true is how a buyer comes to believe a brief
     * was checked that nobody checked.
     */
    return {
      intent,
      skill: null,
      contract: 'unestablished',
      established: false,
      payload: intent,
      inputs: [],
      missing: [],
      statement:
        'Pokter could not establish what inputs this agent accepts: it publishes no readable skill to send a brief to. Your brief is sent exactly as you wrote it, and nothing about its shape has been checked.',
      notes: [],
      ok: true,
    };
  }

  const named = summarySkill(skill);

  /*
   * A skill Pokter has an adapter for. One, today — and it is the one that
   * cost a funded day, so its contract is read through the same
   * `skillRequestData` the courier runs rather than re-derived here.
   */
  if (subjectKeyForSkill(skill.id)) {
    const request = input.chains
      ? skillRequestData({ skillId: skill.id, task: intent, chains: input.chains })
      : skillRequestData({ skillId: skill.id, task: intent });
    if (!request.ok) {
      return {
        intent,
        skill: named,
        contract: 'adapter',
        established: true,
        payload: null,
        inputs: [],
        /* The adapter's own wording, so the buyer reads one sentence here,
           at the quote, and in the courier's refusal if it ever gets there. */
        missing: [{ key: 'agent', label: 'agent to report on', question: request.message, hint: '56/303779', suggestion: null }],
        statement: null,
        notes: [],
        ok: false,
      };
    }
    return {
      intent,
      skill: named,
      contract: 'adapter',
      established: true,
      /* The brief travels whole: the structured field is added beside it by
         the courier, and replaces none of it. */
      payload: intent,
      inputs: request.subject
        ? [{ key: request.subject.key, label: 'agent to report on', value: request.subject.value, kind: 'text', source: 'buyer', material: true }]
        : [],
      missing: [],
      statement: null,
      notes: [],
      ok: true,
    };
  }

  const structured = structuredExample(skill.examples);

  if (structured) {
    const inputs: CompiledInput[] = [];
    const missing: MissingInput[] = [];
    const notes: string[] = [];
    /*
     * The brief may already be a request in this skill's own shape.
     *
     * It is, every time the compiled payload is compiled again — which the
     * server does on the way to a price, to check that the text a buyer
     * confirmed is still the text this skill resolves to. Read through the
     * editor's own `fieldsWithValues` so the second reading is the first
     * reading: extracting the values back out of the JSON as prose lost
     * every number, because `"levels":11` does not read as "levels 11", and
     * a payload that does not survive its own recompilation cannot be bound
     * to anything.
     */
    const already = fieldsWithValues(structured.fields, intent);
    const accounts = accountsIn(intent);
    const addresses = addressesIn(intent);
    /* One address and one field wanting one is an answer. Two of either is a
       pairing Pokter would have to guess at, so it asks instead. */
    const accountFields = structured.fields.filter((field) => field.wallet).length;
    const addressFields = structured.fields.filter((field) => field.address).length;

    const filled: TaskField[] = [];
    for (const field of structured.fields) {
      if (RESERVED.has(field.key.toLowerCase())) {
        notes.push(
          `This agent's example declares a field called “${field.key}”, which is one Pokter sets itself on every brief. It is ignored rather than sent, so a card cannot change what a hire is allowed to do.`,
        );
        continue;
      }

      if (field.fixed) {
        /* Routing the agent requires as written. Not the buyer's to set, and
           not material: it cannot change while the skill does not. */
        inputs.push({ key: field.key, label: readable(field.key), value: field.example, kind: field.kind, source: 'declared-routing', material: false });
        filled.push({ ...field, value: field.example });
        continue;
      }

      /*
       * The buyer's own answer to this field's own question wins over
       * anything read out of the brief. It is not a better guess, it is not
       * a guess: they were asked about this key and typed into its box.
       */
      const answered = (answers[field.key] ?? '').trim();
      const supplied = already?.find((f) => f.key === field.key)?.value.trim();
      const read =
        answered ||
        (supplied
          ? supplied
          : field.wallet && accountFields === 1 && accounts.length === 1
            ? accounts[0]
            : field.address && addressFields === 1 && addresses.length === 1
              ? addresses[0]
              : field.kind === 'number'
                ? numberNamedBy(intent, field.key)
                : null);

      if (read) {
        inputs.push({ key: field.key, label: readable(field.key), value: read, kind: field.kind, source: 'buyer', material: true });
        filled.push({ ...field, value: read });
        continue;
      }

      /*
       * Nothing the buyer wrote fills it, so it is asked for — including
       * when the operator's example holds a usable-looking value.
       *
       * `taskFields` keeps a non-placeholder example value as the field's
       * value, which is right for an editor showing the agent's own example.
       * It is wrong at the point of funding: Brinkwatch's example names a
       * real wallet and Gridloom's names 1000 USDT, and carrying either into
       * a signed brief would have Pokter choose the buyer's subject or their
       * amount. The example is shown as a hint and the buyer supplies the
       * value.
       */
      const hint = field.example.trim() === '' ? null : field.example;
      const label = readable(field.key);
      missing.push({
        key: field.key,
        label,
        question:
          field.wallet || (field.address && OWN_ACCOUNT_KEY.test(field.key))
            ? `Which account should ${skill.name} look at? Give the 0x address.`
            : field.address
              ? `Which ${label} should ${skill.name} read? Give the 0x address.`
              : field.kind === 'number'
                ? `What ${label} should it use?`
                : field.kind === 'boolean'
                  ? `Should ${label} be true or false?`
                  : field.kind === 'json'
                    ? `Give the ${label} as JSON, in the shape of the example.`
                    : `What should ${label} be?`,
        hint,
        suggestion: field.wallet || (field.address && OWN_ACCOUNT_KEY.test(field.key)) ? (input.wallet ?? null) : null,
      });
      filled.push({ ...field, value: '' });
    }

    /*
     * An answer is still checked against the field it answers. "ten" in a
     * number box, or a word where the card declares JSON, is the buyer
     * having made a typing mistake — reporting it as a problem and asking
     * again is right, and sending it because they typed it is not.
     */
    const problems = missing.length === 0 ? taskFieldProblems(filled) : [];
    for (const problem of problems) notes.push(problem);
    /*
     * Every field dropped leaves `{}`, which is not a request however
     * cleanly it compiled. Only reachable from a card whose example holds
     * nothing but fields Pokter owns, and reported rather than sent: an
     * empty object quoted and funded is a job the agent can only refuse.
     */
    const empty = filled.length === 0;
    if (empty) {
      notes.push(
        `${skill.name}'s example request names nothing Pokter can send: every field in it is one Pokter sets itself. There is no request to compile here.`,
      );
    }
    const ok = missing.length === 0 && problems.length === 0 && !empty;
    return {
      intent,
      skill: named,
      contract: 'structured',
      established: true,
      /*
       * Composed through the editor's own `composeTask`, so each value goes
       * back in the type the example used — a number field that was read as
       * a string once reached an agent as `"11"` and was refused.
       */
      payload: ok ? composeTask(filled) : null,
      inputs,
      missing,
      statement: null,
      notes,
      ok,
    };
  }

  /*
   * Prose examples. Nothing here can be checked against a shape, so the
   * brief is not reshaped: what the buyer wrote is what is sent.
   *
   * One thing is still worth asking. Of the nineteen agents whose work
   * skill publishes prose examples, several — Brinkwatch, Centreline,
   * Touchstone — name a 0x account in every single one, which is the
   * operator saying the request is about an account. A brief that names
   * none cannot be about one, and the agent discovers that after the
   * escrow is funded. Asked only when *every* example names one, so a
   * skill that sometimes takes an account is never made to require it.
   */
  if (skill.examples.length > 0 && hasUnreadableJsonExample(skill.examples)) {
    /*
     * Structured, and beyond what Pokter compiles. Reported as not
     * established, with the reason, rather than as prose: the brief still
     * travels as written, which is the same outcome, but the sentence the
     * buyer reads is now true of the card in front of them.
     */
    return {
      intent,
      skill: named,
      contract: 'unpublished',
      established: false,
      payload: intent,
      inputs: [{ key: 'brief', label: 'your brief', value: intent, kind: 'text', source: 'buyer', material: true }],
      missing: [],
      statement: `${skill.name} publishes a structured example request that Pokter cannot read as fields — it declares more than the twelve Pokter compiles, or is not a flat object. Your brief is sent exactly as you wrote it, and nothing about its shape has been checked.`,
      notes: [],
      ok: true,
    };
  }

  if (skill.examples.length > 0) {
    const everyExampleNamesAnAccount =
      skill.examples.length > 0 &&
      skill.examples.every((example) => accountsIn(example).length > 0 || /0x(?:…|\.{2,})/.test(example));
    /*
     * A prose request has no fields, so an answer here is written into the
     * text — which is the one place it *can* go, and is safe for exactly the
     * reason it was unsafe for a structured card: nothing has to read it
     * back out and decide which field it was. The check is whether the brief
     * names an account at all, and after this line it does.
     *
     * Appended rather than merged into the sentence: the buyer's own words
     * are not edited, and the line is visible in the request shown before
     * they confirm it.
     */
    const answeredAccount = (answers.account ?? '').trim();
    const text = answeredAccount ? `${intent}\nAccount: ${answeredAccount}` : intent;
    const missing: MissingInput[] =
      everyExampleNamesAnAccount && accountsIn(text).length === 0
        ? [
            {
              key: 'account',
              label: 'account to report on',
              question: `Every example ${skill.name} publishes names a 0x account, and your brief names none. Add the address it should report on.`,
              hint: null,
              suggestion: input.wallet ?? null,
            },
          ]
        : [];
    /* An answer that is not an address is a typing mistake, reported rather
       than appended to a brief that goes on chain. */
    const badAnswer = answeredAccount && !/^0x[0-9a-fA-F]{40}$/.test(answeredAccount);
    const ok = missing.length === 0 && !badAnswer;
    return {
      intent,
      skill: named,
      contract: 'prose',
      established: true,
      payload: ok ? text : null,
      inputs: ok ? [{ key: 'brief', label: 'your brief', value: text, kind: 'text', source: 'buyer', material: true }] : [],
      missing,
      statement: `${skill.name} publishes example requests in words rather than a format Pokter can check, so your brief is sent as you wrote it and its wording is the agent's to judge.`,
      notes: badAnswer ? ['The account must be a 0x address, 42 characters long.'] : [],
      ok,
    };
  }

  return {
    intent,
    skill: named,
    contract: 'unpublished',
    established: false,
    payload: intent,
    inputs: [{ key: 'brief', label: 'your brief', value: intent, kind: 'text', source: 'buyer', material: true }],
    missing: [],
    statement: `Pokter could not establish what inputs ${skill.name} accepts: the skill is published but documents no example request. Your brief is sent exactly as you wrote it, and nothing about its shape has been checked.`,
    notes: [],
    ok: true,
  };
}

/**
 * An answer the buyer typed into the box beside one of the questions.
 *
 * Keyed by the field it answers, because that is how it was collected: the
 * buyer was shown "what target health factor should it use?" and typed into
 * that field's own input. Pokter reads nothing and infers nothing here — it
 * is told which value belongs to which key.
 *
 * This replaces writing the answer back into the brief as a line of prose.
 * That round trip only converged for two of the seven field shapes a live
 * card can declare: the structured branch could read a value back out of
 * prose in three ways — the whole brief parsing as JSON, one address where
 * exactly one address field wanted one, or a number written beside the
 * field's own name — so a `text`, `boolean` or `json` field, a card with two
 * address fields, or a brief with a second number in it could never be
 * answered at all. Every attempt appended another line and asked the same
 * question again, which is the loop the buyer was left in with the hire
 * blocked behind it.
 *
 * Reading those lines back more cleverly was the other way out, and it is
 * the wrong one: disambiguating "size usdt 2500" from "levels 7" is Pokter
 * guessing which number is which field, which is the failure this whole
 * feature exists to prevent. An answer that is bound to its key cannot be
 * guessed wrong.
 */
export type BriefAnswers = Readonly<Record<string, string>>;

/**
 * Which material inputs differ between the request a buyer approved and the
 * one now in front of them.
 *
 * A price is signed over the task text, so any change to the payload makes
 * the old quote cover work nobody is buying. Naming the fields rather than
 * returning a boolean, because "the price you accepted was for a different
 * account" is a sentence a buyer can act on and "your quote is stale" is
 * not.
 */
export function materialBriefChange(approved: CompiledBrief, current: CompiledBrief): string[] {
  const before = new Map(approved.inputs.filter((i) => i.material).map((i) => [i.key, i.value]));
  const after = new Map(current.inputs.filter((i) => i.material).map((i) => [i.key, i.value]));
  const changed: string[] = [];
  for (const [key, value] of after) {
    const was = before.get(key);
    if (was === undefined) changed.push(`${current.inputs.find((i) => i.key === key)?.label ?? key} was added`);
    else if (was !== value) changed.push(current.inputs.find((i) => i.key === key)?.label ?? key);
  }
  for (const [key] of before) {
    if (after.has(key)) continue;
    const label = approved.inputs.find((i) => i.key === key)?.label ?? key;
    /*
     * "was removed" was wrong whenever the edit simply stopped resolving:
     * the field is still declared and still required, it just has nothing
     * in it now. A buyer told a field was removed goes looking for the one
     * they deleted.
     */
    changed.push(current.ok ? `${label} was removed` : `${label} is no longer filled`);
  }
  if (changed.length === 0 && approved.payload !== current.payload) {
    /* The payload moved with no material field to point at: a prose brief
       reworded, or a skill that resolved differently. Still a different
       request, so still not covered by the old price. */
    changed.push('the request itself');
  }
  return changed;
}

/**
 * The request as a reader should see it, before they confirm it.
 *
 * Returned as rows rather than a sentence so the screen can lay them out
 * and a test can assert them. Every value the agent will receive appears
 * here: a summary that omitted one would be asking for consent to something
 * unseen, which is the hole this whole path closes.
 */
export function briefSummary(compiled: CompiledBrief): Array<{ label: string; value: string; declared: boolean }> {
  const rows: Array<{ label: string; value: string; declared: boolean }> = [];
  /*
   * The skill, unless the request already names it. HyperliquidVault's
   * example is `{"skill":"list_vaults"}`, so adding a skill row on top of
   * that field printed the same fact twice under the same label — a summary
   * whose job is to be read once.
   */
  if (compiled.skill && !compiled.inputs.some((input) => input.key.toLowerCase() === 'skill')) {
    rows.push({ label: 'skill', value: compiled.skill.id, declared: true });
  }
  for (const input of compiled.inputs) {
    rows.push({ label: input.label, value: input.value, declared: input.source === 'declared-routing' });
  }
  return rows;
}

/**
 * Whether the agent receives the buyer's own text, unchanged.
 *
 * True for every contract but `structured`, and the screen reads it to stop
 * printing the same paragraph twice under two headings. "What you asked
 * for" and "what it receives" being the same thing is worth stating plainly;
 * it is not worth saying twice at length.
 */
export function briefIsVerbatim(compiled: CompiledBrief): boolean {
  return compiled.payload !== null && compiled.payload === compiled.intent;
}
