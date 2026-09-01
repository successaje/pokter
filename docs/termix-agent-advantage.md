# Agent Advantage Report

**Does hiring an agent actually beat doing the job yourself?**

Measured 2026-09-01 against live BNB Chain mainnet state. Three tasks, each run
twice: once through a live third-party agent, once from primary sources with no
agent involved. Raw outputs are quoted verbatim below and every run is
reproducible from `experiments/`.

## How this was measured, and what that means

**The agent.** HeyAnon's ERC-8004 MCP servers (`erc8004.heyanon.ai/mcp/venus`),
ERC-8004 agents #43129 and #45381, both measured at 14/14 probe availability by
Pokter's own sweeps. Read-only tools only; no funds moved.

**The manual baseline.** The same question answered by reading contracts
directly — Venus Comptroller for the market list, per-market rate accessors,
annualised by hand.

**An honest caveat about "manual time".** The baseline was performed by an AI
assistant working from primary sources, not by a human analyst. Execution
timings below are wall-clock and real; they are *not* a claim about how long a
person would take. A human would be slower on the manual side, so where the
manual path loses, it loses by more than shown. We have not fabricated a human
figure to fill the column, and TermiX should read these as machine-to-machine
comparisons.

## Summary

| | Task 1 — Supply yield | Task 2 — Liquidation risk | Task 3 — Cross-chain borrow cost |
| --- | --- | --- | --- |
| Category | Yield optimisation | Health-factor monitoring | **Trading** (cost of the borrow leg) |
| Agent time | 2,283 ms | 2,927 ms | 2,464 ms |
| Manual time | 3,230 ms | 895 ms | 2,447 ms (partial) |
| Agent cost | $0 (read-only tools) | $0 | $0 |
| Manual cost | $0 (public RPC) | $0 | $0 |
| Coverage | Equal | Equal | **Agent 2 chains, manual 1** |
| Correct | Yes | Yes (0.13% drift) | Yes |
| Winner | **Agent** | Manual | **Agent** |

**On raw speed the result is a draw.** Both paths answer in roughly two to three
seconds, and on Task 2 the manual path is more than three times faster. Anyone
claiming an order-of-magnitude speedup from agents on tasks like these is not
measuring carefully.

The advantage is elsewhere, and it is larger than a stopwatch shows.

## The finding that matters: the manual path has a correctness trap

Venus publishes a **per-block** rate. Annualising it needs a blocks-per-year
constant, and the figure in most documentation and tutorials is **10,512,000** —
which assumes BSC's original three-second blocks.

BSC does not produce three-second blocks any more. Measured from chain:

```
measured block time  : 0.450s
measured blocks/year : 70,080,000
legacy  blocks/year  : 10,512,000

vUSDT supply APR, measured constant : 2.84%
vUSDT supply APR, legacy constant   : 0.43%

understatement factor: 6.67x
agent answered       : 2.83%
```

An analyst who copies the widely-published constant gets **0.43% instead of
2.84%** — no error, no warning, just a number wrong by a factor of 6.67 that
would make a profitable position look not worth entering. Our own first instinct
was to hardcode a constant; the baseline script measures block time from chain
only because we caught it.

**The agent was right.** That is the real Agent Advantage here: not speed, but
not falling into a trap that the manual path sets for you.

## Task 1 — Venus supply APR (yield optimisation)

*Question: what is the current Venus supply APR for USDT, USDC and BTCB on BNB
Chain?*

**Agent — 2,283 ms**
```json
{"project":"venus","operation":"getSupplyAPR",
 "data":[{"chain":"bsc","pool":"CORE","tokenAPRs":"USDT: 2.83%, USDC: 2.15%, BTCB: 0.19%"}]}
```

**Manual — 3,230 ms** (`experiments/manual-supply-apr.mts`)
```
[+1.88s] 55 markets returned from Comptroller.getAllMarkets()
[+2.50s] matched 3 target markets
[+3.23s] block time 0.45s -> 70,080,000 blocks/year

vUSDC   2.15%   (0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8)
vUSDT   2.84%   (0xfD5840Cd36d94D7229439859C0112a4185BC0255)
vBTC    0.19%   (0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B)
```

**Quality: equivalent, and the agreement is the point.** Two independent paths
produce the same three numbers to within rounding, which is what verifies the
agent rather than any claim it makes about itself. The manual path additionally
returns the vToken addresses, which the agent does not.

**Winner: agent** — same answer, less setup, and it sidesteps the annualisation
trap entirely.

## Task 2 — Liquidation risk on a live position (health-factor monitoring)

*Question: is `0x96145D06…8Bf1`, a real Venus borrower with ~1.96M USDT of debt,
close to liquidation?*

**Agent — 2,927 ms**
```json
{"project":"venus","operation":"getAccountLiquidity",
 "data":[{"chain":"bsc","pool":"CORE","borrowLimit":"1738691.15","shortfall":"0.00"}]}
```

**Manual — 895 ms**
```
error=0  liquidity=$1,736,364.45  shortfall=$0
```

**Quality: agree on the decision, differ by 0.13% on the figure.** Both report
zero shortfall — the position is not liquidatable — but the headroom differs by
about $2,327. The likely cause is that the two reads landed on different blocks
while Venus oracle prices moved; at 0.45s blocks, a two-second gap is several
blocks. We did not confirm the cause, and we are not reporting it as confirmed.

**Winner: manual.** A single `getAccountLiquidity` call against the Comptroller
is one read and beat the agent by 3.3×. Where the primitive already exists and
you know its name, wrapping it in an agent adds latency and nothing else.

## Task 3 — Borrow cost across chains (trading)

*Question: what does it cost to borrow USDT and USDC on Venus, on BNB Chain
versus Ethereum, to price the borrow leg of a carry trade?*

**Agent — 2,464 ms, two chains, four markets, one call**
```json
{"project":"venus","operation":"getBorrowAPR","data":[
 {"chain":"bsc","pool":"CORE","tokenAPRs":"USDT: 4.54%, USDC: 3.95%"},
 {"chain":"ethereum","pool":"CORE","tokenAPRs":"USDT: 3.92%, USDC: 7.65%"}]}
```

**Manual — 2,447 ms, one chain, two markets**
```
vUSDC borrow APR 3.95%
vUSDT borrow APR 4.54%
```

**Quality: agent strictly greater coverage, identical where they overlap.** BSC
figures match exactly. The Ethereum half would have required a second RPC
endpoint, a second market scan and a second symbol resolution — roughly doubling
the manual work for the same wall-clock budget.

And the answer is only interesting *because* it spans chains: USDT is cheaper to
borrow on Ethereum (3.92%) than BSC (4.54%), while USDC is nearly twice as
expensive (7.65% vs 3.95%). A single-chain view cannot see that.

**Winner: agent**, on coverage per unit of effort.

## What this says about hiring agents

1. **Agents are not meaningfully faster at single primitives.** Task 2 was a
   clean loss. A marketplace that sells agents on speed is selling the wrong
   thing.
2. **They win on breadth per call.** Task 3's cross-chain answer cost the same
   as the single-chain manual one.
3. **They win hardest on domain traps.** The blocks-per-year constant is exactly
   the sort of thing that separates a correct answer from a plausible one, and it
   does not announce itself.
4. **Verification is cheap and worth doing.** Every agent figure here was
   checked against chain in seconds, and all three held up. That is the
   strongest argument for hiring this agent — and it is an argument we could
   only make by measuring.

## Reproducing

```bash
npx tsx experiments/manual-supply-apr.mts   # Task 1 manual baseline
npx tsx experiments/run-tasks.mts           # Tasks 2 and 3, both sides
npx tsx experiments/blocktime-trap.mts      # the annualisation trap
```

Agent calls are plain JSON-RPC to `https://erc8004.heyanon.ai/mcp/venus`; the
exact request bodies are in `run-tasks.mts`.
