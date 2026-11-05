import { VICE_SOURCES, type ViceFact, type ViceSnapshot, type ViceUpdate } from './vice-watch-source';

export type ViceIntent = 'latest' | 'release' | 'platforms' | 'release-platforms' | 'preload' | 'storage' | 'changes';
export interface ViceQuestion { intent: ViceIntent; since: string | null; platform: 'ps5' | 'xbox' | null; timezone: string | null }

/** A bounded, explicit scope. Unsupported work is declined before a signed quote. */
export function readViceQuestion(brief: string, now = new Date()): { question: ViceQuestion | null; error: string | null; need: string | null } {
  const text = brief.trim();
  if (!text || text.length > 1_400) return { question: null, error: 'The question is empty or too long', need: 'Ask one GTA VI news or release question in 1,400 characters or fewer' };
  const lower = text.toLowerCase();
  let intent: ViceIntent | null = null;
  if (/\b(pre.?load|download start|pre.?install)\b/i.test(text)) intent = 'preload';
  else if (/\b(storage|disk space|install size|file size|gigabytes|\d+\s*gb)\b/i.test(text)) intent = 'storage';
  else if (/\b(what changed|since (?:my |the )?last|updates? since|anything new since)\b/i.test(text)) intent = 'changes';
  else if (/\b(platforms?|consoles?|ps5|playstation|xbox|pc release)\b/i.test(text) && /\b(release|launch|coming out)\b/i.test(text)) intent = 'release-platforms';
  else if (/\b(platforms?|consoles?|ps5|playstation|xbox|pc release)\b/i.test(text)) intent = 'platforms';
  else if (/\b(release|launch|when is it coming|coming out)\b/i.test(text)) intent = 'release';
  else if (/\b(news|latest|announcement|update|trailer|official|happening)\b/i.test(text)) intent = 'latest';
  if (!intent || /\b(cheat|leak|rumou?r|download link|pirat|crack|private key|password)\b/i.test(text)) {
    return { question: null, error: 'This is outside Vice Watch’s official-news scope', need: 'Ask about official GTA VI news, scheduled release, platforms, preload, storage or dated changes' };
  }
  let since: string | null = null;
  if (intent === 'changes') {
    const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    const words = text.match(/\b(?:since|after)\s+([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2})/i);
    const raw = iso?.[1] ?? words?.[1] ?? null;
    const ms = raw ? Date.parse(/^20\d{2}-/.test(raw) ? `${raw}T00:00:00Z` : `${raw} UTC`) : NaN;
    if (!Number.isFinite(ms) || ms > now.getTime() || (raw?.match(/^20\d{2}-\d{2}-\d{2}$/) && new Date(ms).toISOString().slice(0, 10) !== raw)) return { question: null, error: 'A usable past date is needed to compare updates', need: 'For example: “What changed since 2026-11-01?”' };
    since = new Date(ms).toISOString().slice(0, 10);
  }
  const platform = /\b(ps5|playstation\s*5)\b/i.test(text) ? 'ps5' : /\b(xbox|series\s*x)\b/i.test(text) ? 'xbox' : null;
  const timezone = text.match(/\b(?:Africa|America|Asia|Australia|Europe|Pacific)\/[A-Za-z_]+\b/)?.[0] ?? null;
  if (intent === 'preload' && /\b(my|local|region|time zone|timezone)\b/i.test(text) && !platform) {
    return { question: null, error: 'The console is needed for a local preload answer', need: 'Say PlayStation 5 or Xbox Series X|S and, for a converted time, an IANA time zone such as Africa/Lagos' };
  }
  if (timezone) {
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
    catch { return { question: null, error: 'The time zone is not recognised', need: 'Use an IANA zone such as Africa/Lagos' }; }
  }
  if (lower.includes('pc release') && intent === 'platforms') {
    // The report will say only whether PC is on the official listed-platform set.
  }
  return { question: { intent, since, platform, timezone }, error: null, need: null };
}

const dated = (value: string | null) => value ?? 'publication date not shown';
const cite = (fact: ViceFact | ViceUpdate, checkedAt: string) => `${'title' in fact ? fact.title : fact.value} — ${fact.url} (published/updated ${dated(fact.publishedAt)}; checked ${checkedAt})`;

/** Human-readable answer first; every source and limitation travels with the hashed manifest. */
export function viceWatchReport(question: ViceQuestion, snapshot: ViceSnapshot): Record<string, unknown> {
  const used: Array<ViceFact | ViceUpdate> = [];
  const limitations = [...snapshot.limitations];
  let answer: string;
  let updates: ViceUpdate[] = [];
  if (question.intent === 'release' || question.intent === 'release-platforms') {
    if (snapshot.release) { answer = `Rockstar currently lists GTA VI as scheduled for ${snapshot.release.value.replace(/^Scheduled for /, '')}. A scheduled date is not a confirmed release.`; used.push(snapshot.release); }
    else answer = 'Vice Watch could not verify a current release schedule on Rockstar’s game page.';
    if (question.intent === 'release-platforms') {
      if (snapshot.platforms) { answer += ` Its page currently lists ${snapshot.platforms.value}; it does not confirm a PC launch date.`; used.push(snapshot.platforms); }
      else answer += ' Vice Watch could not verify the currently listed platforms.';
    }
  } else if (question.intent === 'platforms') {
    if (snapshot.platforms) { answer = `Rockstar’s GTA VI page currently lists ${snapshot.platforms.value}. A PC launch date is not confirmed by that listing.`; used.push(snapshot.platforms); }
    else answer = 'Vice Watch could not verify the currently listed platforms on Rockstar’s game page.';
  } else if (question.intent === 'preload') {
    if (snapshot.preload) { answer = `Rockstar Support currently says: ${snapshot.preload.value}`; used.push(snapshot.preload); }
    else {
      const news = snapshot.updates.find((item) => /pre.?load/i.test(item.title));
      answer = news ? `Rockstar’s featured announcement is “${news.title}.” Vice Watch could not verify the console and regional timing from Rockstar Support, so check its FAQ before relying on an exact hour.` : 'Vice Watch could not verify a current preload date or local time from the official pages it could read.';
      if (news) used.push(news);
      limitations.push(`For console and regional details, check ${VICE_SOURCES.preload}.`);
    }
    if (question.timezone && snapshot.preload && question.platform === 'xbox') {
      const date = snapshot.preload.value.match(/Xbox Series X\|S:\s*(\d{4}-\d{2}-\d{2})/);
      if (date) {
        const at = new Date(`${date[1]}T00:00:00Z`);
        answer += ` In ${question.timezone}, that Xbox instant is ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: question.timezone }).format(at)}.`;
      }
    }
    if (question.platform === 'ps5' && question.timezone && snapshot.preload) answer += ` PlayStation’s midnight is local to the relevant console account region; ${question.timezone} is the time zone you supplied, not a verified account setting.`;
  } else if (question.intent === 'storage') {
    if (snapshot.storage) { answer = `Rockstar Support currently says GTA VI needs ${snapshot.storage.value.toLowerCase()}.`; used.push(snapshot.storage); }
    else { answer = 'Vice Watch could not verify a current installation-size figure from Rockstar Support.'; limitations.push(`Check the official installation FAQ: ${VICE_SOURCES.storage}.`); }
  } else if (question.intent === 'changes') {
    updates = snapshot.updates.filter((item) => item.publishedAt && item.publishedAt > question.since!);
    answer = updates.length ? `${updates.length} of Rockstar’s featured GTA VI updates are dated after ${question.since}. Here are their headlines.` : `No featured GTA VI update on Rockstar’s game page is dated after ${question.since}. This is not a complete Newswire search.`;
    used.push(...updates);
  } else {
    updates = snapshot.updates.slice(0, 5);
    answer = updates.length ? `Rockstar’s latest featured GTA VI update is “${updates[0].title}” (${dated(updates[0].publishedAt)}). Here are the current featured headlines.` : 'Rockstar’s game page did not expose a readable featured update during this check.';
    used.push(...updates);
  }
  if (snapshot.sourceState === 'cached') limitations.push('The official page was unavailable during this attempt; this report uses an earlier checked snapshot and is not a fresh news check.');
  if (!used.length) used.push({ value: 'Rockstar GTA VI official page', url: VICE_SOURCES.game, publishedAt: null });
  return {
    title: 'Vice Watch · official GTA VI report', answer, as_of: { time: snapshot.checkedAt },
    sources: used.map((source) => cite(source, snapshot.checkedAt)),
    ...(updates.length ? { official_updates: updates.map((item) => ({ title: item.title, published: item.publishedAt ?? 'not shown', link: item.url })) } : {}),
    source_scope: 'Rockstar’s GTA VI page and, when reachable, Rockstar Support. Featured posts are not a full archive.',
    source_state: snapshot.sourceState,
    limitations,
    independent_fan_tool: 'Not affiliated with or endorsed by Rockstar Games or Take-Two.',
  };
}
