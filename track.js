// Anonymous click counting for a static site: no database, no cookies, no server code, no CI.
//
// Every interaction is an event path such as  person/raine,  table/4,  site/raine,  build/raine/4,
// related/raine/jad,  board,  tab/why.  Clicks that lead to someone's work also add a roll-up,
//   work/<id>  (any site or build click)   and   via/<id>  (arrived from a related/paired link),
// so per-person totals can be read back with a handful of requests.
//
// Each event is
//   1. added to a small tally in this browser's localStorage (Stats → "Just you"), and
//   2. sent to GoatCounter when STUDIO_CONFIG.goatcounter is set. The Stats tab's "Everyone" view reads the
//      totals straight back from GoatCounter's public read-only counter endpoint (/counter/<path>.json).
(function () {
  const cfg = window.STUDIO_CONFIG || {};
  const code = (cfg.goatcounter || '').trim();
  const KEY = 'studio.stats.v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode: fine */ } };
  const mine = load() || { views: 0, events: {}, first: Date.now() };
  const ROOM = location.pathname || '/';

  // ---------------------------------------------------------------- sending
  let gcReady = false; const queue = [];
  if (code) {
    const s = document.createElement('script');
    s.async = true; s.src = 'https://gc.zgo.at/count.js';
    s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
    s.dataset.goatcounterSettings = JSON.stringify({ no_onload: true });
    s.onload = () => {
      gcReady = true;
      try { window.goatcounter.count({ path: ROOM, title: document.title }); } catch (e) { /* ignore */ }
      queue.splice(0).forEach(send);
    };
    document.head.appendChild(s);
  }
  function send(ev) {
    if (!code) return;
    if (!gcReady) { queue.push(ev); return; }
    try { window.goatcounter.count({ path: ev.path, title: ev.title || ev.path, event: true }); } catch (e) { /* ignore */ }
  }
  function rollups(path) {
    const m = path.split('/');
    if ((m[0] === 'site' || m[0] === 'build') && m[1]) return [`work/${m[1]}`];
    if ((m[0] === 'related' || m[0] === 'pair') && m[2]) return [`via/${m[2]}`];
    return [];
  }
  function bump(path, title) {
    mine.events[path] = (mine.events[path] || 0) + 1;
    send({ path, title });
  }

  // ---------------------------------------------------------------- reading everyone's totals back
  const CACHE = `studio.everyone.v1.${code}`;
  async function counter(path) {
    try {
      const r = await fetch(`https://${code}.goatcounter.com/counter/${encodeURIComponent(path)}.json`);
      if (r.status === 404) return 0;           // no hits yet for this path
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      return parseInt(String(j.count ?? '0').replace(/\D/g, ''), 10) || 0;
    } catch (e) { throw e; }
  }
  async function everyone(paths) {
    if (!code) return null;
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE) || 'null');
      if (c && Date.now() - c.at < 3 * 60e3 && paths.every((p) => p in c.events)) return c.data;
    } catch (e) { /* ignore */ }
    const events = {}; let i = 0, failed = 0;
    const list = [...new Set(paths)];
    async function worker() {
      while (i < list.length) {
        const p = list[i++];
        try { events[p] = await counter(p); } catch (e) { failed++; events[p] = 0; }
      }
    }
    let views = 0;
    try { views = await counter(ROOM); } catch (e) { return { error: e.message === '403' ? 'counter-off' : 'unreachable' }; }
    await Promise.all(Array.from({ length: 8 }, worker));
    if (failed === list.length && list.length) return { error: 'unreachable' };
    const data = { views, events, updated: new Date().toISOString().slice(0, 16).replace('T', ' '), source: `https://${code}.goatcounter.com` };
    try { sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), events, data })); } catch (e) { /* ignore */ }
    return data;
  }

  const listeners = [];
  window.Track = {
    remote: !!code,
    code,
    event(path, title) {
      bump(path, title);
      rollups(path).forEach((p) => bump(p));
      mine.last = Date.now(); save(mine);
      listeners.forEach((f) => f(path));
    },
    mine: () => mine,
    onEvent: (f) => listeners.push(f),
    reset() { mine.views = 0; mine.events = {}; mine.first = Date.now(); save(mine); },
    everyone,
  };
  mine.views++; mine.last = Date.now(); save(mine);
})();
