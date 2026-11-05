import type { HouseAgentDefinition } from '../types';
import { readViceQuestion, viceWatchReport } from './vice-watch-report';
import { readViceSources } from './vice-watch-source';

const configuredPrice = process.env.VICE_WATCH_PRICE_U ?? '0.01';
if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(configuredPrice) || Number(configuredPrice) < 0.001 || Number(configuredPrice) > 1) {
  throw new Error('VICE_WATCH_PRICE_U must be a decimal between 0.001 and 1.');
}

/** An independent, source-linked GTA VI briefing agent. No unofficial rumour feed. */
export const viceWatch: HouseAgentDefinition = {
  slug: 'vice-watch',
  name: 'Vice Watch by Pokter',
  version: '1.0.0',
  category: 'research',
  description:
    'A fan-oriented GTA VI research report agent. Ask about Rockstar’s latest featured official updates, scheduled release, listed consoles, preload or installation size. It checks official Rockstar pages, links each claim and shows when it looked. Featured news is not a complete archive; exact regional details depend on Rockstar Support being reachable. No rumours, leaks or affiliation with Rockstar.',
  priceU: Number(configuredPrice),
  skill: {
    id: 'vice_watch_report',
    name: 'Official GTA VI briefing',
    description: 'A one-time, source-linked GTA VI report from Rockstar’s official game and support pages. Ask a plain-language question; the answer leads with what is known and marks inaccessible or stale sources.',
    examples: [
      'What is the latest official GTA VI news? Link the announcements.',
      'When is GTA VI scheduled for release, and which consoles are listed?',
      'When does GTA VI preload begin on PlayStation 5? My time zone is Africa/Lagos.',
      'How much installation space has Rockstar published for GTA VI?',
      'What changed in official GTA VI news since 2026-11-01?',
    ],
    tags: ['gta-vi', 'gaming', 'official-news', 'research', 'rockstar'],
  },
  deliverables: 'A concise answer, dated links to official sources, the time checked, and explicit gaps or stale-source warnings.',
  qualityStandards: 'Claims must be supported by Rockstar or Rockstar Support pages read for this job. A featured-news list is not called a complete archive.',
  check(brief) {
    const parsed = readViceQuestion(brief);
    return parsed.question ? null : { error: parsed.error ?? 'Unsupported question', need: parsed.need ?? 'Ask one official GTA VI question' };
  },
  async run(brief, context) {
    const parsed = readViceQuestion(brief, context.now);
    if (!parsed.question) return { ok: false, error: parsed.error ?? 'Unsupported question', need: parsed.need ?? undefined };
    let snapshot;
    try { snapshot = await readViceSources({ now: context.now }); }
    catch (error) { return { ok: false, error: (error as Error).message, need: 'Try again when Rockstar’s official game page can be checked' }; }
    if (snapshot.sourceState === 'cached' && ['latest', 'changes', 'preload', 'storage'].includes(parsed.question.intent)) {
      return { ok: false, error: 'The official source could not be refreshed for a current update', need: 'Try again later; a cached page is not proof of current news' };
    }
    return { ok: true, content: viceWatchReport(parsed.question, snapshot) };
  },
};
