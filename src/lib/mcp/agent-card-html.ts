/**
 * The agent card view: one self-contained page, no external resources, so
 * the host's default sandbox (no network, inline styles and script only)
 * is all it needs. It speaks the MCP Apps handshake over postMessage,
 * draws `structuredContent.card` from the tool result, and opens Pokter
 * through the host (`ui/open-link`). Every value is set as text, never as
 * markup: agent names come from a public registry.
 */
export const AGENT_CARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { --bg:#ffffff; --ink:#16171a; --ink2:#48494d; --ink3:#7a7a73; --rule:#e4e1d8; --sunken:#f5f3ee; --signal:#f0b90b; --ok:#2f8a4b; --watch:#8d5c00; --wash:#f6ecd2; }
  :root[data-theme="dark"] { --bg:#1c1d21; --ink:#f3f1eb; --ink2:#c9c7bf; --ink3:#8d8c85; --rule:#2c2d31; --sunken:#232428; --ok:#5fbf7a; --watch:#e3aa3e; --wash:#3a3220; }
  * { box-sizing:border-box; margin:0; }
  body { font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink); background:transparent; }
  .card { background:var(--bg); border:1px solid var(--rule); border-radius:14px; overflow:hidden; }
  .head { display:flex; gap:12px; align-items:center; padding:14px 16px; }
  .avatar { width:40px; height:40px; border-radius:10px; background:var(--signal); color:#16171a; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:18px; flex-shrink:0; }
  .name { font-weight:650; font-size:16px; }
  .meta { color:var(--ink3); font-size:12px; }
  .steps { display:flex; flex-wrap:wrap; gap:6px; padding:0 16px 12px; }
  .chip { font-size:11.5px; padding:2px 8px; border-radius:999px; border:1px solid var(--rule); color:var(--ink3); }
  .chip.on { color:var(--ok); border-color:currentColor; }
  /* Real evidence, short of what the step certifies: a courier delivery. */
  .chip.part { color:var(--watch); border-color:currentColor; }
  .row { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 16px; border-top:1px solid var(--rule); }
  .label { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink3); }
  .price { font:600 20px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .net { display:flex; align-items:center; gap:8px; font-weight:600; font-size:13.5px; }
  .diamond { width:16px; height:16px; background:var(--signal); transform:rotate(45deg); border-radius:3px; }
  .money { font-size:12.5px; color:var(--ink3); }
  .money.test { color:var(--watch); font-weight:600; }
  .note { padding:10px 16px; border-top:1px solid var(--rule); font-size:12.5px; color:var(--ink2); }
  .note.block { background:var(--wash); }
  .note b { color:var(--ink); }
  .brief { padding:10px 16px; border-top:1px solid var(--rule); font-size:12.5px; color:var(--ink2); background:var(--sunken); }
  .actions { display:flex; gap:8px; padding:12px 16px; border-top:1px solid var(--rule); }
  button { font:inherit; font-weight:600; font-size:13.5px; border-radius:10px; padding:9px 14px; cursor:pointer; border:1px solid var(--rule); background:transparent; color:var(--ink); }
  button.primary { background:var(--ink); color:var(--bg); border-color:var(--ink); flex:1; }
  .foot { padding:0 16px 12px; font-size:11.5px; color:var(--ink3); }
  .empty { padding:16px; color:var(--ink3); }
</style></head>
<body><div id="root" class="card"><div class="empty">Loading the agent…</div></div>
<script>
(function () {
  var nextId = 1, pending = {};
  function send(msg) { window.parent.postMessage(msg, '*'); }
  function request(method, params) { var id = nextId++; send({ jsonrpc: '2.0', id: id, method: method, params: params || {} }); return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; }); }
  function notify(method, params) { send({ jsonrpc: '2.0', method: method, params: params || {} }); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; }
  function open(url) { request('ui/open-link', { url: url }).catch(function () { try { window.open(url, '_blank', 'noopener'); } catch (e) {} }); }

  function render(card) {
    var root = document.getElementById('root'); root.textContent = '';
    if (!card) { root.appendChild(el('div', 'empty', 'No agent to show.')); return; }
    var head = el('div', 'head');
    head.appendChild(el('div', 'avatar', (card.name || '?').trim().charAt(0).toUpperCase()));
    var who = el('div'); who.appendChild(el('div', 'name', card.name));
    who.appendChild(el('div', 'meta', 'ERC-8004 #' + card.tokenId + ' · ' + (card.chainId === 56 ? 'BNB Chain' : 'BNB Testnet') + (card.step ? ' · ' + card.step : '')));
    head.appendChild(who); root.appendChild(head);
    if (card.steps && card.steps.length) { var steps = el('div', 'steps'); card.steps.forEach(function (s) { var cls = s.earned ? ' on' : s.partial ? ' part' : ''; var mark = s.earned ? '\u2713 ' : s.partial ? '\u00b7 ' : ''; steps.appendChild(el('span', 'chip' + cls, mark + s.label)); }); root.appendChild(steps); }

    var priceRow = el('div', 'row'); var p = el('div'); p.appendChild(el('div', 'label', card.quote ? 'Signed for this brief' : 'Price per job'));
    p.appendChild(el('div', 'price', card.quote ? card.quote.price : card.price ? card.price.label : 'No signed price'));
    priceRow.appendChild(p);
    if (card.quote) priceRow.appendChild(el('div', 'meta', (card.quote.termsBound ? 'Signature covers these terms · ' : '') + 'by ' + card.quote.signer));
    else if (card.price) priceRow.appendChild(el('div', 'meta', card.price.current ? 'Escrow quote · signed by the agent' : 'Last signed escrow quote; a fresh quote is requested before payment'));
    root.appendChild(priceRow);

    if (card.network) { var net = el('div', 'row'); var left = el('div', 'net'); left.appendChild(el('span', 'diamond')); left.appendChild(el('span', null, card.network.label)); net.appendChild(left); net.appendChild(el('span', 'money' + (card.network.real ? '' : ' test'), card.network.money)); root.appendChild(net); }
    if (card.blocker) { var b = el('div', 'note block'); b.appendChild(el('b', null, 'Why it cannot be priced: ')); b.appendChild(document.createTextNode(card.blocker.reason)); root.appendChild(b); }
    if (card.brief) { var br = el('div', 'brief'); br.appendChild(el('b', null, 'Brief: ')); br.appendChild(document.createTextNode(card.brief)); root.appendChild(br); }

    var actions = el('div', 'actions');
    var hire = el('button', 'primary', card.blocker ? 'Open the hire page' : 'Hire on Pokter'); hire.onclick = function () { open(card.hireUrl); };
    var page = el('button', null, 'Evidence'); page.onclick = function () { open(card.pageUrl); };
    actions.appendChild(hire); actions.appendChild(page); root.appendChild(actions);
    root.appendChild(el('div', 'foot', 'You review and fund every hire in your own wallet. Nothing is paid until you sign.'));
    resized();
  }

  function resized() { var r = document.documentElement.getBoundingClientRect(); notify('ui/notifications/size-changed', { width: Math.ceil(r.width), height: Math.ceil(r.height) }); }
  if (window.ResizeObserver) new ResizeObserver(resized).observe(document.documentElement);

  window.addEventListener('message', function (event) {
    var msg = event.data; if (!msg || msg.jsonrpc !== '2.0') return;
    if (msg.id != null && pending[msg.id] && (('result' in msg) || ('error' in msg))) { var p = pending[msg.id]; delete pending[msg.id]; msg.error ? p.reject(msg.error) : p.resolve(msg.result); return; }
    if (msg.method === 'ui/notifications/tool-result') { var sc = msg.params && msg.params.structuredContent; render(sc && sc.card); return; }
    if (msg.method === 'ui/notifications/host-context-changed' && msg.params && msg.params.theme) { document.documentElement.setAttribute('data-theme', msg.params.theme); return; }
    if (msg.id != null && (msg.method === 'ui/resource-teardown' || msg.method === 'ping')) { send({ jsonrpc: '2.0', id: msg.id, result: {} }); }
  });

  request('ui/initialize', { protocolVersion: '2026-01-26', appCapabilities: { availableDisplayModes: ['inline'] }, clientInfo: { name: 'pokter-agent-card', version: '1.0.0' } })
    .then(function (result) { var theme = result && result.hostContext && result.hostContext.theme; if (theme) document.documentElement.setAttribute('data-theme', theme); notify('ui/notifications/initialized', {}); resized(); })
    .catch(function () { notify('ui/notifications/initialized', {}); });
})();
</script></body></html>`;
