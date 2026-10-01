/*
 * Local runner. Vercel calls api/index.js directly; this is the same handler
 * behind a plain Node server so you can check the endpoint before deploying
 * it, which is cheaper than finding out from a marketplace probe.
 *
 *   AGENT_PRIVATE_KEY=0x... node server.js
 */
import { createServer } from 'node:http';
import handler from './api/index.js';

const port = Number(process.env.PORT ?? 8787);
createServer((req, res) => {
  handler(req, res).catch((error) => {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(error) }));
  });
}).listen(port, () => console.log(`agent listening on http://localhost:${port}`));
