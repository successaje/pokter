/** Register Scout's Discord commands, or read back what the application has. */
import { DISCORD_SCOUT_COMMANDS } from './scout-bot';

const statusOnly = process.argv.includes('--status');
const setEndpoint = process.argv.includes('--set-endpoint');
const fromStdin = process.argv.includes('--token-stdin');
const token = fromStdin
  ? (await new Promise<string>((resolve) => {
      let value = '';
      process.stdin.setEncoding('utf8');
      const done = (answer: string) => {
        process.stdin.off('data', onData);
        process.stdin.off('end', onEnd);
        process.stdin.pause();
        resolve(answer);
      };
      const onData = (chunk: string) => { value += chunk; if (value.includes('\n')) done(value.split('\n')[0].trim()); };
      const onEnd = () => done(value.trim());
      process.stdin.on('data', onData);
      process.stdin.on('end', onEnd);
    }))
  : process.env.POKTER_DISCORD_BOT_TOKEN;
if (!token) throw new Error('Set POKTER_DISCORD_BOT_TOKEN or use --token-stdin.');

async function discord(path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null) as { message?: string } | unknown[] | null;
  if (!response.ok) {
    const message = result && !Array.isArray(result) ? result.message : null;
    throw new Error(`Discord ${init.method ?? 'GET'} ${path} failed: ${message ?? response.status}`);
  }
  return result;
}

const application = await discord('/applications/@me') as { id?: string; name?: string; verify_key?: string; interactions_endpoint_url?: string | null };
if (!application.id) throw new Error('The token did not resolve to a Discord application.');
const configuredId = process.env.POKTER_DISCORD_APPLICATION_ID;
if (configuredId && configuredId !== application.id) {
  throw new Error('POKTER_DISCORD_APPLICATION_ID does not match this token.');
}
// The route verifies every interaction against this key; a wrong one refuses them all.
const configuredKey = process.env.POKTER_DISCORD_PUBLIC_KEY?.trim().toLowerCase();
if (configuredKey && application.verify_key && configuredKey !== application.verify_key.toLowerCase()) {
  throw new Error('POKTER_DISCORD_PUBLIC_KEY is not this application’s public key.');
}

if (statusOnly) {
  const commands = await discord(`/applications/${application.id}/commands`) as Array<{ name?: string }>;
  console.log(JSON.stringify({
    application: application.name,
    applicationId: application.id,
    publicKeyMatches: configuredKey ? configuredKey === application.verify_key?.toLowerCase() : null,
    commands: commands.map((command) => command.name),
    interactionsEndpoint: application.interactions_endpoint_url ?? null,
  }, null, 2));
} else {
  await discord(`/applications/${application.id}/commands`, { method: 'PUT', body: DISCORD_SCOUT_COMMANDS });
  if (setEndpoint) {
    // Discord pings the endpoint before accepting it, so the route must already be live.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const origin = appUrl ? new URL(appUrl) : null;
    if (origin?.protocol !== 'https:') throw new Error('Set NEXT_PUBLIC_APP_URL to the deployed HTTPS origin before --set-endpoint.');
    await discord('/applications/@me', { method: 'PATCH', body: { interactions_endpoint_url: `${origin.origin}/api/discord/interactions` } });
    console.log(`Registered ${DISCORD_SCOUT_COMMANDS.length} commands and pointed ${application.name} at ${origin.origin}/api/discord/interactions.`);
  } else {
    console.log(`Registered ${DISCORD_SCOUT_COMMANDS.length} commands for ${application.name}. Set the interactions endpoint in the Discord portal, or re-run with --set-endpoint once the route is live.`);
  }
}
