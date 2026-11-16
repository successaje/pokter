<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working in this repository

## Comments

- A comment says what the code cannot: the invariant it keeps, a reason that is not obvious from the code, or an outside constraint (a contract, a spec, a provider's limit). Usually one to four lines.
- History stays out of the source. What broke, when and how it was found belongs in the commit message, and on /corrections when Pokter published something wrong. Do not write dated anecdotes ("On 19 October…") in new comments.
- When a change makes a comment wrong, update it or delete it in the same change.

## Tests

- Test what the code does: import it, call it, check the result. Do not add tests that read a source file and match its text. `tests/test-policy.test.mts` lists the existing ones, and the list only shrinks.
- The deploy workflow checks live pages for exact text (`.github/workflows/deploy.yml`). Search it before renaming anything a user sees.

## Size

- A new module past about 400 lines, or a function past about 80, is a sign to split it.
