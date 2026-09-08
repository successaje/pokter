# Draft issue — `main` advertises CJS support the package does not have

Not filed. Verified against `@altananetwork/sdk@0.9.0` (current `latest`).
Checked against every open and closed issue in the repo — no mention of
`require`, `exports`, CJS or `ERR_PACKAGE_PATH_NOT_EXPORTED`.

---

**Title:** `package.json` declares `main` but `exports` has no `require` condition, so `require()` throws

**Body:**

`require('@altananetwork/sdk')` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`,
despite the package declaring a `main` entry point.

```json
{
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }
}
```

When an `exports` map is present it takes precedence and `main` is ignored for
bare-specifier resolution. With only `types` and `import` conditions, any CJS
require path is unresolvable — so `main` advertises support that does not exist.

**Reproduce.**

```bash
npm i @altananetwork/sdk@0.9.0
node -e "require('@altananetwork/sdk')"
# Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined
```

This bites in ordinary places: a `tsx` script that resolves as CJS, a Jest
config without ESM enabled, or any tooling that has not moved over yet. The
error message points at `exports` while `main` sits right there in
`package.json`, which makes it read like a bug in the consumer's setup.

**Suggested fix**, either:

1. **Drop `main`.** The package is `"type": "module"` and ESM-only in practice;
   removing the field makes that explicit and the error self-explanatory.
2. **Add a `require` condition** pointing at a CJS build, if CJS is meant to be
   supported.

The first is one line and matches what the package already is. Happy to PR it.
