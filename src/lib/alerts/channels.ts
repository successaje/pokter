/**
 * Whether an operator alert has anywhere to go.
 *
 * Deliberately not `server-only`, unlike `operator.ts` beside it, which sends
 * the message and must never reach a client bundle. This file only reads
 * which variables are present and returns booleans, and keeping it separate
 * is what lets the rule be tested — the same split `delivery-eligibility`
 * makes next to `delivery-retry`, for the same reason.
 */
/**
 * Which channels could fire if something happened right now.
 *
 * Reported so an operator can see that alerting is dead without having to
 * cause the event it is supposed to catch. The failure this exists to prevent
 * already happened once: a real hire from outside the team arrived, both
 * channels were unset, the sweep returned `alerted: false`, and nobody looked
 * at that field — the hire was noticed by hand, days later.
 *
 * Names only. Nothing here reads a secret's value, so it is safe to return
 * from an endpoint.
 */
export function alertChannels(): {
  telegram: boolean;
  email: boolean;
  any: boolean;
} {
  const telegram = Boolean(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ALERT_CHAT_ID,
  );
  const email = Boolean(
    process.env.RESEND_API_KEY &&
      process.env.NOTIFICATION_FROM_EMAIL &&
      process.env.OPERATOR_ALERT_EMAIL,
  );
  return { telegram, email, any: telegram || email };
}
