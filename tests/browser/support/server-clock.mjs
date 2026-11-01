/*
 * Moves the test server's clock to POKTER_TEST_NOW, for browser tests that
 * need a page rendered as it will be after a date that has not come yet.
 * Loaded with `node --import` into the test server only (playwright.config.ts);
 * nothing in the app reads these variables.
 *
 * Time keeps running from the moved instant. Every server process measures
 * from the same anchor, the moment the test run started, so they agree.
 */
const target = Date.parse(process.env.POKTER_TEST_NOW ?? '');
const anchor = Number(process.env.POKTER_TEST_CLOCK_ANCHOR);

if (Number.isFinite(target) && Number.isFinite(anchor)) {
  const RealDate = Date;
  const offset = target - anchor;
  class MovedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset;
    }
    // Dates made inside Node itself (file stats) still count as dates.
    static [Symbol.hasInstance](value) {
      return value instanceof RealDate;
    }
  }
  /*
   * As own properties, not just inherited: Next wraps the global Date on the
   * server and copies only the constructor's own statics, which dropped
   * `Date.parse` and `Date.UTC`.
   */
  MovedDate.parse = RealDate.parse;
  MovedDate.UTC = RealDate.UTC;
  globalThis.Date = MovedDate;
}
