// Anonymous click counting for a static site (no database, no cookies).
//
// Every interaction is an event path such as  person/raine,  table/4,  site/raine,  build/raine/4,
// related/raine/jad,  board,  tab/why.  Each event is
//   1. added to a small tally in this browser's localStorage (the Stats tab's "Just you" view), and
//   2. sent to GoatCounter when STUDIO_CONFIG.goatcounter is set (the "Everyone" view, exported nightly
//      into data/stats.json by a GitHub Action, so the published site only ever reads a static file).
(function () {
  const cfg = window.STUDIO_CONFIG || {};
  const KEY = 'studio.stats.v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode: fine */ } };
  const mine = load() || { views: 0, events: {}, first: Date.now() };

  let gcReady = false; const queue = [];
  if (cfg.goatcounter && !navigator.doNotTrack?.startsWith?.('1')) {
    const s = document.createElement('script');
    s.async = true; s.src = 'https://gc.zgo.at/count.js';
    s.dataset.goatcounter = `https://${cfg.goatcounter}.goatcounter.com/count`;
    s.dataset.goatcounterSettings = JSON.stringify({ no_onload: true });
    s.onload = () => {
      gcReady = true;
      try { window.goatcounter.count({ path: location.pathname || '/', title: document.title }); } catch (e) { /* ignore */ }
      queue.splice(0).forEach(send);
    };
    document.head.appendChild(s);
  }
  function send(ev) {
    if (!gcReady) { queue.push(ev); return; }
    try { window.goatcounter.count({ path: ev.path, title: ev.title || ev.path, event: true }); } catch (e) { /* ignore */ }
  }

  const listeners = [];
  window.Track = {
    remote: !!cfg.goatcounter,
    event(path, title) {
      mine.events[path] = (mine.events[path] || 0) + 1; mine.last = Date.now(); save(mine);
      send({ path, title });
      listeners.forEach((f) => f(path));
    },
    mine: () => mine,
    onEvent: (f) => listeners.push(f),
    reset() { mine.views = 0; mine.events = {}; mine.first = Date.now(); save(mine); },
    async everyone() {
      try {
        const r = await fetch(`${cfg.statsUrl || 'data/stats.json'}?t=${Math.floor(Date.now() / 6e5)}`);
        if (!r.ok) return null;
        const j = await r.json();
        return j && j.views ? j : null;
      } catch (e) { return null; }
    },
  };
  mine.views++; mine.last = Date.now(); save(mine);
})();
