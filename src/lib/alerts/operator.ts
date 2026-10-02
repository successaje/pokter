import 'server-only';

export { alertChannels } from './channels';

/**
 * Telling the operators something happened.
 *
 * Distinct from `lib/notifications`, which writes to people who asked to hear
 * from us and therefore needs subscriptions, verification and an unsubscribe
 * path. Nobody subscribes to this one: it goes to whoever runs Pokter, and
 * the only consent involved is having set the environment variable.
 *
 * Telegram is tried first because it is where someone is actually looking
 * during a campaign, and because it needs no domain verification to start
 * working. Email is sent as well when configured, so an alert survives a
 * group nobody opens.
 */
export interface AlertDelivery {
  telegram: 'sent' | 'failed' | 'not-configured';
  email: 'sent' | 'failed' | 'not-configured';
}

async function toTelegram(text: string): Promise<AlertDelivery['telegram']> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
  if (!token || !chat) return 'not-configured';

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

async function toEmail(
  subject: string,
  text: string,
): Promise<AlertDelivery['email']> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  const to = process.env.OPERATOR_ALERT_EMAIL;
  if (!key || !from || !to) return 'not-configured';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: text.replace(/<[^>]+>/g, ''),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Never throws. An alert that takes the sweep down with it would cost more
 * than the alert is worth, and the caller reports the delivery result so a
 * silent channel shows up as `not-configured` rather than as success.
 */
export async function sendOperatorAlert(input: {
  subject: string;
  body: string;
}): Promise<AlertDelivery> {
  const [telegram, email] = await Promise.all([
    toTelegram(`<b>${input.subject}</b>\n\n${input.body}`),
    toEmail(input.subject, input.body),
  ]);
  return { telegram, email };
}
