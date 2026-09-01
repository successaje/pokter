const KEY = process.env.SCAN_API_KEY;
const BASE = 'https://api.8004scan.io/api/v1';
const headers: Record<string, string> = { accept: 'application/json' };
if (KEY) headers['x-api-key'] = KEY;

async function time(label: string, path: string) {
  const started = Date.now();
  try {
    const r = await fetch(`${BASE}${path}`, { headers });
    const body = await r.json();
    const count = Array.isArray(body?.items) ? body.items.length : '-';
    console.log(`  ${String(Date.now() - started).padStart(6)}ms  ${r.status}  items=${String(count).padStart(3)}  ${label}`);
  } catch (error) {
    console.log(`  FAILED after ${Date.now() - started}ms  ${label}: ${(error as Error).message.slice(0, 60)}`);
  }
}

console.log('semantic search:');
await time('rebalancing', '/agents/search/semantic?q=portfolio%20rebalancing%20agent%20maintaining%20target%20allocation&chain_id=56&limit=12');
await time('grid', '/agents/search/semantic?q=grid%20trading%20bot%20buy%20low%20sell%20high%20ladder&chain_id=56&limit=12');
await time('yield', '/agents/search/semantic?q=yield%20optimiser%20moving%20capital%20to%20the%20best%20APY&chain_id=56&limit=12');
await time('health', '/agents/search/semantic?q=health%20factor%20monitor%20preventing%20loan%20liquidation&chain_id=56&limit=12');

console.log('\nkeyword search:');
await time('rebalanc', '/agents?chain_id=56&search=rebalanc&limit=20');
await time('grid', '/agents?chain_id=56&search=grid&limit=20');
await time('yield', '/agents?chain_id=56&search=yield&limit=20');
await time('liquidation', '/agents?chain_id=56&search=liquidation&limit=20');

console.log('\nother:');
await time('countAgents', '/agents?chain_id=56&limit=1');
