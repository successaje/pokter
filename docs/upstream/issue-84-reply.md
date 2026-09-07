# Reply to altananetwork/altana-sdk#84

Post as a comment on the closed issue. Short on purpose — the maintainer was
specific and fast, and the useful part is the suggestion, not the thanks.

---

Confirmed, and thanks for the detail — `PolicyNotWhitelisted()` is the decode I
couldn't get.

Verified 0.9.0 independently before upgrading: `erc8183Addresses(97).policy`
returns `0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA`, and on the testnet router
`policyWhitelist` is `false` for the old address and `true` for the new. Our
hire batch works with the override removed.

For the record on the duplicate: 0.8.0 was still `latest` when I checked, which
is what convinced me it was unfixed. 0.9.0 landed the following day. Entirely
my timing — flagging it only because "check dist-tags" clearly isn't sufficient
on its own.

One suggestion, since it's the thing that actually cost the time. The exported
ABIs carry no `type: "error"` fragments — I checked 0.9.0 and there are none for
any contract — so viem and ethers can't decode reverts from these calls, and
`0xc94463e3` came back as an opaque selector rather than a named error. 4byte
doesn't have it either. Including the error fragments in the shipped ABIs would
have turned an afternoon of elimination into one line of output, and it would do
that for every revert path, not just this one.

Happy to open a PR adding them if that's useful — say the word and I'll follow
CONTRIBUTING.md.

---

## If they say yes

The change is mechanical: add the `error` fragments from each contract's
compiled ABI to the exported ones. Verify with a viem `simulateContract` against
the old policy address on chain 97 — it should surface `PolicyNotWhitelisted`
by name rather than raw hex.

## Do not raise here

The packaging issue — `main` is declared while `exports` has no `require`
condition, so `require('@altananetwork/sdk')` throws
`ERR_PACKAGE_PATH_NOT_EXPORTED` — belongs in its own issue. Putting it in a
closed duplicate buries it, and it is clean enough to stand alone.
