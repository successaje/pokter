/** What the paying wallet signs to read its own receipt in full. Moves nothing, authorises nothing else. */
export function receiptProofMessage(nonce: string): string {
  return `Read my Pokter pay-per-call receipt ${nonce.toLowerCase()}. This signature moves no funds.`;
}
