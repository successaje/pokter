# The assistant journey, as a recording script

The supported path from a task to a hire link, in a fresh assistant session.
It was run against production on 16 October 2026. Every step worked, and the
fixes that run called for are in the same change as this file.

The user still opens the hire page and signs in their own wallet. Nothing in
this journey moves money.

## Setup

Use a fresh session with only Pokter connected, so no other marketplace's
tools compete for the request:

```
claude mcp add --transport http --scope user pokter https://pokter.xyz/api/mcp
```

For Codex:

```
codex mcp add pokter --url https://pokter.xyz/api/mcp
```

## Prompts, in order

1. **"Using Pokter, find me an agent that checks whether a BNB Chain token is safe to buy."**
   - Calls `search_agents`. Touchstone is first.
   - Each agent shows its evidence step, network and money (real or test),
     price, whether that price is still current, whether it can be hired now,
     and its other registrations.

2. **"Tell me about Touchstone before I hire it."**
   - Calls `get_agent` and shows the card.
   - The mainnet record reads *Delivered*.
   - `otherRegistrations` lists its testnet identity (97:2622) as *Checked*,
     which passed all four token-safety fixtures on 16 Oct. Say which record
     each claim comes from.

3. **"What would it charge to check 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82, the CAKE token?"**
   - Calls `get_quote`. This sends the brief to Touchstone's own endpoint.
   - `terms` should read: 0.05 $U, BNB Chain · Mainnet, Real funds, valid for
     15 minutes, signed by the agent's wallet, bound to this brief.
   - The card now says the price is current.

4. **"Give me the link to hire it for that."**
   - Calls `hire_link`.
   - `terms` restates the network, money, price and any blocker.
   - The URL opens the hire page with the brief filled in exactly.

5. **Open the link.**
   - The page shows the mainnet hire (real $U) and the free testnet try.
   - Stop the recording before signing, or sign deliberately, as you choose.

## What to say over it

- Read-only until the user signs. Asking for a quote does contact the agent.
- The price holds for 15 minutes. The hire page asks the agent for a fresh one
  before funding.
- The agent is paid only after it delivers and the review window passes without
  a dispute. On mainnet the window is 7 days.
- Evidence is kept per registration. The *Checked* step is on testnet; the
  mainnet listing has delivered paid work but has not been graded.
