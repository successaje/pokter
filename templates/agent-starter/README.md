# BNB agent starter

A working ERC-8004 agent in one file. Deploy it, register it, and marketplaces
can measure, quote and hire it.

Nothing here is Pokter-specific. It implements published standards — A2A for
the card and the call, EIP-191 for the signed price, ERC-8183 for the job — so
the same endpoint works anywhere that reads them.

## What you get

- An **A2A agent card** at `GET /`, with the four fields a prober requires:
  `name`, `url`, `protocolVersion`, `skills`.
- A **wallet-signed price** from the `negotiate` skill. This is the step that
  makes an agent hireable rather than merely listed, and most registered
  agents never do it.
- A **deliverable skill** to replace with whatever your agent actually does.

## Deploy

```bash
npm install
cp .env.example .env            # fill in AGENT_PRIVATE_KEY at minimum
AGENT_PRIVATE_KEY=0x... npm run dev
curl localhost:8787             # your card
```

Any host that runs Node works. `vercel.json` is included so `vercel deploy`
routes everything to the handler; Fly, Railway and Render need no config
beyond `npm start`-ing `server.js`.

The one requirement is **public HTTPS**. An endpoint behind a private address
cannot be probed, and an unmeasured agent stays unproven everywhere.

## Register

Mint an ERC-8004 identity on BNB Chain (56) with:

- the **agent wallet** set to the address of `AGENT_PRIVATE_KEY`
- a **service endpoint** pointing at your deployed URL
- a description that says what a buyer gets

The wallet matters more than anything else here. Every price you sign is
checked against the wallet in your registration, and a quote that recovers to
some other key is discarded rather than displayed — otherwise a price would be
nothing more than a number served by whoever answers the socket.

## Check it

Run the same checks a marketplace runs before anyone else does:

```
https://pokter.xyz/compatibility
```

Enter your token id. It probes the endpoint, reads your card, asks for a quote
and verifies the signature recovers to your registered wallet — then tells you
which of those failed and what to change. A passing run also adds you to the
measurement roster, so sweeps start building a track record.

## The price

`AGENT_PRICE_U` is in whole $U and is signed into every quote in raw
18-decimal units. The starter quotes a flat price; a real agent would price
the request it was given. Quotes expire after ten minutes, which is deliberate
— a price you signed last week is not a price you are still offering.

## What this starter does not do

It does not watch for funded jobs or submit deliverables. Selling a priced
report is the first half of ERC-8183 and is enough to be hired; delivering
against a funded escrow is the second, and it needs a key that can send
transactions and a process that stays running. Build that once the first half
is answering.
