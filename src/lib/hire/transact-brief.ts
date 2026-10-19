/**
 * Whether a brief asks the agent to move funds, which Pokter's terms forbid.
 *
 * Every hire is signed under read-only terms (`POKTER_TERMS`). On 19 Oct a
 * buyer asked Nagi, twice, to "run one grid session … and report every
 * trade"; Nagi honoured the terms it had signed, made no trade, and the
 * buyer paid for a session that could never have happened. The page had
 * shown the brief and never the terms, so nothing told them.
 *
 * This only decides whether to warn, so it leans on phrases that ask for an
 * action, a sentence at a time. A sentence that negates ("do not execute
 * transactions") or asks for advice ("should I swap…?") is not a request.
 * "Analyse the proposed trading range" mentions trading and asks for none.
 */
const NEGATED = /\b(do not|don['’]t|never|not|no|without|avoid|read[- ]only|simulat\w*|hypothetical\w*|paper[- ]trad\w*|dry[- ]run)\b/i;
const ADVICE = /^\s*(should|would|could|can|is|are|what|which|when|how|whether|if)\b/i;

const ACTS: RegExp[] = [
  // "execute two trades", "place an order", "send a transaction"
  /\b(execute|place|make|submit|sign|send|open|close)\b[^.;]{0,40}\b(trades?|swaps?|orders?|transactions?|positions?)\b/i,
  // "run one grid session", "run the bot"
  /\brun\b[^.;]{0,40}\b(grid|bot|strategy|session)\b/i,
  // "trade only from …", "swap 1 BNB", "buy 0.5 BNB", "rebalance my portfolio"
  /\b(trade|swap|buy|sell|stake|unstake|deposit|withdraw|borrow|repay|bridge|transfer|rebalance|harvest|compound)\s+(only\b|\d|\$|my\b|our\b|the\b|it\b|them\b|all\b|half\b|some\b|from\b|into\b|on my behalf\b|for me\b)/i,
];

export function asksToTransact(brief: string): boolean {
  return brief
    .split(/(?<=[.!?;\n])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .some((sentence) => !sentence.endsWith('?') && !ADVICE.test(sentence) && !NEGATED.test(sentence) && ACTS.some((pattern) => pattern.test(sentence)));
}
