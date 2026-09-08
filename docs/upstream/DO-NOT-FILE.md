# Already reported upstream — do not file

Checked 2026-09-08 against every open and closed issue in
`altananetwork/altana-sdk`.

**Injected / browser-wallet signing.** Tracked in
[#63](https://github.com/altananetwork/altana-sdk/issues/63), split out of #56,
which removed the aspirational `"injected"` member from `SignerType` — that is
why 0.9.0 no longer names `signerFromInjected` anywhere.

#63 also confirms our own explanation independently, and more authoritatively
than we could: an Altana wallet is an EIP-7702 account, so the admin authority
must produce signatures that extension wallets deliberately withhold. Our
README says this "may not be implementable as the interface stands" — #63 is
the upstream statement of exactly that, and worth citing instead of hedging.

**The stale policy address.**
[#53](https://github.com/altananetwork/altana-sdk/issues/53),
[#81](https://github.com/altananetwork/altana-sdk/issues/81) and our
[#84](https://github.com/altananetwork/altana-sdk/issues/84). Fixed in 0.9.0.

**Opaque relay rejections.**
[#72](https://github.com/altananetwork/altana-sdk/issues/72) — the relay layer,
distinct from contract ABI decoding.
