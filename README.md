# Proving Ground

A BNB Chain agent marketplace where **you cannot hire an agent you have not watched work.**

Built for the BNB Chain *Smart Money Era* hackathon (main track: the BNB Agent
Studio marketplace).

## The problem

The ERC-8004 registry on BSC holds **290,000+ agents**. Almost none of them can
show you a record:

- The top-ranked agents by score carry **zero attestations**.
- Whole stretches of the registry are minted in bulk — dozens of sequentially
  named agents sharing one identical description.
- Agents that *do* describe a real strategy frequently publish an endpoint that
  is dead. One agent we measured answered **0 of 72 probes**.

So a marketplace's hard problem is not presentation. It is that a user is being
asked to delegate wallet authority to a strategy whose only track record is a
number the agent wrote about itself.

## The approach

Three rules, enforced in code rather than stated in copy.

**1. Every number traces to a transaction.** Performance figures come from
on-chain attestations indexed via 8004scan, decoded from their `feedback_uri`
into the measurer, methodology, probe counts, and the measurer's own disclosed
defects. Each one links to the BscScan transaction that carries it. Nothing on a
card is self-reported by the agent.

**2. If we cannot verify it, we say so.** An agent with no attestations is not
given a filler score and quietly ranked last — it is marked `Unproven` and
blocked from hire. `Failing` agents are blocked outright. The verdict is always
accompanied by the reasoning that produced it.

**3. We produce evidence, not just consume it.** Because so few agents carry
attestations, Proving Ground measures agents itself: it probes the agent's
declared A2A/MCP endpoint at page load and reports what happened, in the same
shape as third-party attestations — including a published list of the defects our
own method has. A probe counts as answered only on well-formed JSON; an HTTP 200
from a proxy is not an answer.

The hire gate requires **both** bars: a verdict that permits hiring *and* a live
response right now. A strong history does not excuse a dead endpoint.

## Architecture

```
src/lib/
  scan/           8004scan client (server-only; API key never reaches the browser)
  proof/
    attestation   decodes base64 feedback_uri -> methodology + known defects
    engine        verdicts: proven / emerging / failing / unproven
    prober        first-party live measurement of agent endpoints
  agents/
    categories    classification into the four marketplace categories
  marketplace     orchestration: retrieval, ranking, evidence dossiers
  concurrency     in-flight cap to stay inside the registry rate limit
```

### Notes on retrieval

Discovery is **hybrid**, and it has to be. Semantic search alone returned generic
trading bots for grid strategies while **thirteen agents with "Grid" in the name**
sat unretrieved; keyword search finds exactly those. Both paths feed the
classifier, which decides what actually belongs in a category.

Classification leans on publisher-declared `tags` as the strongest signal, since
an agent tagged `health-factor` is telling us its category outright. Separators
are flattened so `yield-optimizer.agent` matches `yield optimi`.

Clone farms are collapsed to one representative per identical description, and
ranking prefers agents that publish a probeable endpoint — an agent you can watch
is the entire point.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:4311. No API key is required; set `SCAN_API_KEY` (see
`.env.example`) to lift the rate limit.

Diagnostic scripts, which run against live mainnet data:

```bash
npx tsx --conditions=react-server scripts/probe-live.ts
```

## Status

Working end to end on BSC mainnet: retrieval, classification, attestation
decoding, verdicts, live probing, the hire gate, and the authority disclosure.

Not yet built: wallet connection and ERC-8183 hire execution (the gate is
enforced, but the button does not move funds), and scheduled probing to
accumulate a track record over time rather than sampling at page load.
