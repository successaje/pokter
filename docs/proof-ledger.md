# Proof ledger: source and recovery boundaries

The proof page and `/api/v1/receipts` derive their evidence counts from `src/lib/proof/ledger.ts`. One row is one indexed `(chainId, jobId)`. The job store enforces that key; pagination and filters run over the same classified rows. Mainnet (56) and Testnet (97) are counted separately. A funding wallet active on both networks counts once on each network, and no combined unique-person claim is made.

- **Funded:** positive budget and a state that proves escrow received funding. Created but unfunded jobs remain visible in the ledger, outside this count.
- **With a submission:** Submitted or Completed, excluding known lifecycle demos. This is an escrow-state observation, not proof that the answer was useful or that a hash matches.
- **Settled:** Completed escrow state. This includes team tests and demos; it does not establish who ultimately benefited or whether the answer was good.
- **Outside-team wallets:** distinct, known funding addresses on positive-budget jobs, excluding declared team wallets, self-hires and known lifecycle demos. This does not establish an independent person, unrelated buyer or unsubsidised demand. The linked filtered ledger shows jobs, so its row count can exceed the wallet count.
- **Team-funded jobs and self-hires:** positive-budget jobs with those classifications. Unknown funders and demos have their own ledger filters.

The page shows both newest and oldest index status-read times. A job detail attempts a current chain read and labels an index fallback. Pokter's `hiredAt` is a recording time, not necessarily the funding-block time. Job detail shows a funding-block timestamp only when a recorded funding transaction contains a matching `JobFunded` event. The proof page's legacy `window` filter uses recording time. No amounts are summed across networks or tokens; jobs whose payment token has not been read show an expandable raw base-unit amount, with no guessed currency.

## Job origin

An on-chain `pokter-job` envelope must match the indexed agent identity and provider to be labelled a marker match. A reference-format signed quote can omit that marker; it is attributed only when its negotiation hash matches Pokter's recorded quote intent for the same provider, agent and escrow chain. That intent is privately stored, so the public on-chain record alone cannot independently prove its Pokter origin. Earlier indexed jobs without either signal are labelled historical index records. Unread chain descriptions are labelled unread. A marker identifies a format, not who used the interface.

A safe future public proof could publish a signed, privacy-reviewed commitment to the quote-intent hash, provider, agent and escrow chain at the time the intent is created. It must avoid exposing private briefs or buyer data. Until such a mechanism is designed and reviewed, the page should keep the recorded-quote limitation visible.

## Historical gaps and recovery plan

The scheduled reconciler scans only a bounded range. Its first pass starts 400 IDs behind the current counter; each pass reads at most 250 new IDs and revisits a bounded pending set. Pending IDs more than 20,000 behind the counter age out. It recovers only jobs with a matching envelope or recorded quote intent. Thus the indexed set is not proof of exhaustive chain history, and local development data may be behind production.

Before any production backfill, prepare a read-only audit per network: compare indexed IDs against escrow IDs and transaction logs over an explicit block range, report missing IDs and attribution category, and record RPC failures separately. Then run an idempotent, rate-limited dry run that proposes inserts keyed by `(chainId, jobId)` without changing existing rows. Review the proposed rows and privacy impact before a separately approved write. Re-read chain state and payment token for accepted rows, retain original record timestamps, record funding block times separately, and verify totals before and after. The current page does not run or imply such a backfill.
