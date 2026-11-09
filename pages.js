// Tabs (Studio / Why / Stats) and the two text pages that sit over the room.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = () => window.studio.people();
  const S = window.STUDIO || {};
  const RAINE = 'https://mitmedialab.github.io/agents2026-raine/';
  const RAINE_IMG = `${RAINE}assets/media/week04/`;

  // ------------------------------------------------------------ tabs
  const tabs = [...document.querySelectorAll('#hud .tabs button')];
  function show(tab, push = true) {
    if (!['studio', 'why', 'stats'].includes(tab)) tab = 'studio';
    tabs.forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('page-why').hidden = tab !== 'why';
    $('page-stats').hidden = tab !== 'stats';
    document.body.dataset.tab = tab;
    if (tab === 'why') renderWhy();
    if (tab === 'stats') renderStats();
    if (push && location.hash.slice(1) !== tab) history.replaceState(null, '', tab === 'studio' ? location.pathname : `#${tab}`);
  }
  tabs.forEach((b) => b.addEventListener('click', () => { Track.event(`tab/${b.dataset.tab}`, `${b.dataset.tab} tab`); show(b.dataset.tab); }));
  addEventListener('hashchange', () => show(location.hash.slice(1), false));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('.page [data-go]');
    if (go) { show('studio'); window.studio.openPerson(go.dataset.go); }
    const ev = e.target.closest('.page [data-ev]');
    if (ev) Track.event(ev.dataset.ev);
  });

  // ------------------------------------------------------------ why
  let whyDone = false;
  function renderWhy() {
    if (whyDone) return; whyDone = true;
    const people = P();
    const perWeek = {};
    people.forEach((p) => (p.weeks || []).forEach((w) => { perWeek[w.week] = (perWeek[w.week] || 0) + 1; }));
    const weeks = Object.keys(perWeek).map(Number).filter((w) => w <= 7).sort((a, b) => a - b);
    const posted = weeks.reduce((n, w) => n + perWeek[w], 0);
    const busiest = weeks.reduce((m, w) => (perWeek[w] > perWeek[m] ? w : m), weeks[0]);
    const share = Math.round((4 * weeks.length / posted) * 100);
    const groups = new Set(people.map((p) => p.group).filter(Boolean)).size;
    const linked = people.reduce((n, p) => n + (p.weeks || []).filter((w) => w.url).length, 0);
    const builds = people.reduce((n, p) => n + (p.weeks || []).length, 0);
    const maxW = Math.max(...weeks.map((w) => perWeek[w]));
    const bars = weeks.map((w) => `<div class="wkbar"><span>W${w}</span><div><i style="width:${(perWeek[w] / maxW) * 100}%"></i><b style="width:${(Math.min(4, perWeek[w]) / maxW) * 100}%"></b></div><em>${perWeek[w]}</em></div>`).join('');

    $('page-why').innerHTML = `
<article class="doc">
  <p class="kicker">WHY THIS ROOM EXISTS</p>
  <h1>Most of the class's work is invisible to the class.</h1>
  <p class="lede">Every week, each of us builds an agent and writes it up on our own site. By week 7 that was <b>${posted} write-ups</b> from ${people.length} people, spread across ${people.length} separate websites. The usual ways of seeing them show only a slice.</p>

  <figure class="chart">
    <div class="legend"><span><i class="all"></i>builds posted that week</span><span><i class="hl"></i>at most 4 make the newsletter highlights</span></div>
    ${bars}
    <figcaption>Weekly builds found on classmates' sites (week ${busiest} was the busiest, with ${perWeek[busiest]}). Four highlights a week covers about ${share}% of them.</figcaption>
  </figure>

  <h2>From <span class="ar">→</span> To</h2>
  <p>This framing comes from <a href="${RAINE}week04/" target="_blank" rel="noopener" data-ev="out/raine-week4">Raine Sha's <i>Our Cognitive Gardens</i></a> (week 4). Raine's point: the class sees selected work and a list of interests, when what helps people learn from each other is seeing <i>everyone's</i> builds and the connections between them.</p>
  <div class="fromto">
    <div class="col">
      <p class="tag">FROM · 4 weekly highlights &amp; a project list</p>
      <figure><img src="${RAINE_IMG}course-newsletter.png" alt="The Class Runtime newsletter, Issue 03, with its weekly highlights section" loading="lazy"><figcaption>The Class Runtime · Issue 03</figcaption></figure>
      <figure><img src="${RAINE_IMG}course-agent-interests.png" alt="Course Agent interface listing classmates' proposed final-project interests" loading="lazy"><figcaption>Course Agent · project interests</figcaption></figure>
    </div>
    <div class="arrow">→</div>
    <div class="col">
      <p class="tag">TO · pairs &amp; inspiration</p>
      <figure><img src="${RAINE_IMG}cognitive-forest.png" alt="Raine's interactive pixel village with student characters and weekly build flowers" loading="lazy"><figcaption>Our Cognitive Gardens · classmates, weekly builds and companions</figcaption></figure>
    </div>
  </div>
  <p class="credit">Images: Raine Sha, <a href="${RAINE}week04/" target="_blank" rel="noopener">agents2026-raine / week 4</a>, shown with credit and linked to the original.</p>

  <h2>Why it matters</h2>
  <ul class="why">
    <li><b>We learn from each other mostly by accident.</b> Week-8 groups share a table, so the people you already sit with are the ones whose work you know. Ideas that would help you are often at another table.</li>
    <li><b>A highlight reel picks winners; a room shows everyone.</b> Quiet weeks, half-finished experiments and honest failures are often the most useful to read, and they never make a highlight.</li>
    <li><b>Finding work should cost one click, not a search.</b> Here, every person is on screen. Click them, hear what they built in their own words, then go straight to the write-up.</li>
    <li><b>Connections should cross groups.</b> Each card suggests classmates at <i>other</i> tables who share themes with this person, Raine's "pairs &amp; inspiration" applied to the whole class.</li>
    <li><b>The class should be able to check whether it works.</b> The Stats tab shows which people, tables and builds get opened, so we can see if the room actually sends people to each other's work.</li>
  </ul>

  <h2>What's in the room</h2>
  <div class="facts">
    <div><b>${people.length}</b><span>classmates: ${people.filter((p) => p.group).length} at the ${groups} week-8 tables, the rest moving around the room</span></div>
    <div><b>${builds}</b><span>builds, each with its own one-line summary</span></div>
    <div><b>${linked}</b><span>builds link straight to their write-up</span></div>
    <div><b>${S.gardenBuilds || 0}</b><span>cross-checked against Raine's source-reviewed catalog</span></div>
  </div>

  <h2>How it was made</h2>
  <p>Each character's lines are short first-person summaries written from <b>that person's own course site</b>: their builds, numbers, surprises and failures as they documented them. Facts come only from their write-ups. Where a site is still a placeholder, the character keeps it general instead of guessing.</p>
  <p>Builds are merged with <a href="https://github.com/rainscyy/MyGarden4.0" target="_blank" rel="noopener" data-ev="out/mygarden">Raine's Our Cognitive Gardens catalog</a> (${S.snapshot ? S.snapshot.builds : 71} source-reviewed builds, MIT License), which adds each build's source link and themes, plus the pairs her Garden Agent recorded. The research for each person is public in <a href="https://github.com/seanhlewis/agentmedialab/tree/main/research" target="_blank" rel="noopener" data-ev="out/research">research/</a>. If something about you is wrong, open an issue or a pull request.</p>

  <h2>What gets counted</h2>
  <p>To learn whether the room helps, it counts anonymous clicks: which person, table or build was opened and whether someone went on to the write-up. No cookies, names, IP addresses or accounts are stored. ${Track.remote ? 'Class-wide totals are kept by <a href="https://www.goatcounter.com" target="_blank" rel="noopener">GoatCounter</a>, an open-source, privacy-friendly counter, and the Stats tab reads them back live. There is no database behind this site.' : 'For now, counts stay in your own browser.'} Your own tally is always visible under Stats → Just you.</p>

  <p class="end"><button data-go="raine">Meet Raine in the room ▸</button></p>
</article>`;
  }

  // ------------------------------------------------------------ stats
  let mode = null, sortKey = 'opens', everyone = null, loading = null, problem = null;
  function livePaths() {
    const ids = P().map((p) => p.id);
    const groups = [...new Set(P().map((p) => p.group).filter(Boolean))];
    return [...ids.flatMap((id) => [`person/${id}`, `work/${id}`, `via/${id}`]), ...groups.map((g) => `table/${g}`),
      'board', 'pinboard', 'tab/why', 'tab/stats', 'out/raine-week4', 'out/research'];
  }
  async function loadEveryone(force) {
    if (!Track.remote) return;
    if (force) { try { sessionStorage.removeItem(`studio.everyone.v1.${Track.code}`); } catch (e) { /* ignore */ } }
    loading = Track.everyone(livePaths());
    const r = await loading; loading = null;
    if (r && !r.error) { everyone = r; problem = null; } else { everyone = null; problem = r ? r.error : 'unreachable'; }
    if (mode === 'everyone' && !everyone) mode = 'you';
  }
  async function renderStats() {
    if (mode === null) {
      mode = Track.remote ? 'everyone' : 'you';
      if (Track.remote) {
        $('page-stats').innerHTML = '<article class="doc wide"><p class="kicker">STATS</p><h1>Counting the class&hellip;</h1><p class="muted">Fetching live totals from GoatCounter.</p></article>';
        await loadEveryone();
      }
    }
    const src = mode === 'everyone' && everyone ? everyone : { views: Track.mine().views, events: Track.mine().events, updated: null };
    const live = mode === 'everyone';
    const ev = src.events || {}, views = Math.max(1, src.views || 0);
    const get = (k) => ev[k] || 0;
    const people = P();
    const rows = people.map((p) => {
      const builds = Object.keys(ev).filter((k) => k.startsWith(`build/${p.id}/`)).reduce((n, k) => n + ev[k], 0);
      const opens = get(`person/${p.id}`);
      const work = Math.max(get(`work/${p.id}`), get(`site/${p.id}`) + builds);
      const viaRaw = Object.keys(ev).filter((k) => (k.startsWith('related/') || k.startsWith('pair/')) && k.endsWith(`/${p.id}`)).reduce((n, k) => n + ev[k], 0);
      const cross = Math.max(get(`via/${p.id}`), viaRaw);
      return { p, opens, ctr: opens / views, work, wctr: opens ? work / opens : 0, cross };
    });
    const sorters = { opens: (r) => r.opens, ctr: (r) => r.ctr, work: (r) => r.work, wctr: (r) => r.wctr, cross: (r) => r.cross, name: (r) => r.p.name };
    rows.sort((a, b) => (sortKey === 'name' ? a.p.name.localeCompare(b.p.name) : sorters[sortKey](b) - sorters[sortKey](a) || a.p.name.localeCompare(b.p.name)));
    const opensTotal = rows.reduce((n, r) => n + r.opens, 0), workTotal = rows.reduce((n, r) => n + r.work, 0);
    const crossTotal = rows.reduce((n, r) => n + r.cross, 0);
    const maxOpen = Math.max(1, ...rows.map((r) => r.opens));
    const pct = (x) => `${(x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`;

    const groups = [...new Set(people.map((p) => p.group).filter(Boolean))].sort((a, b) => a - b).map((g) => {
      const mem = rows.filter((r) => r.p.group === g);
      return { g, table: get(`table/${g}`), opens: mem.reduce((n, r) => n + r.opens, 0), work: mem.reduce((n, r) => n + r.work, 0), names: mem.map((r) => r.p.first || r.p.name.split(' ')[0]).join(', ') };
    });
    const maxG = Math.max(1, ...groups.map((x) => x.table + x.opens));
    const themes = {};
    rows.forEach((r) => (r.p.themes || []).forEach((t) => { themes[t] = (themes[t] || 0) + r.opens; }));
    const themeRows = Object.entries(themes).sort((a, b) => b[1] - a[1]);
    const maxT = Math.max(1, ...themeRows.map((x) => x[1]));
    const other = [['Whiteboard', get('board')], ['Pinboard', get('pinboard')], ['Why tab', get('tab/why')], ['Stats tab', get('tab/stats')], ['Raine\'s week 4 (from Why)', get('out/raine-week4')], ['Research folder', get('out/research')]];

    const th = (k, label) => `<th><button class="${sortKey === k ? 'on' : ''}" data-sort="${k}">${label}${sortKey === k ? ' <span class="ar">▾</span>' : ''}</button></th>`;
    const note = live
      ? `Everyone · live from GoatCounter · fetched ${esc(src.updated || '?')} UTC`
      : `Just you · this browser only · since ${new Date(Track.mine().first).toLocaleDateString()}`;
    $('page-stats').innerHTML = `
<article class="doc wide">
  <p class="kicker">STATS</p>
  <h1>Who gets opened, and does it lead anywhere?</h1>
  <div class="seg">
    <button data-mode="everyone" class="${mode === 'everyone' ? 'on' : ''}" ${Track.remote ? '' : 'disabled title="Set a GoatCounter code in data/config.js to count everyone"'}>EVERYONE</button>
    <button data-mode="you" class="${mode === 'you' ? 'on' : ''}">JUST YOU</button>
    <span>${note}</span>
  </div>
  ${live ? '<p class="end" style="margin:0 0 6px"><button data-refresh>REFRESH</button></p>' : ''}
  ${!live && problem ? '<p class="muted">Class-wide totals could not be loaded, so this shows your own clicks in this browser. Either GoatCounter is not sharing totals yet (its <i>allow using the visitor counter</i> setting) or an ad blocker is blocking it.</p>' : ''}
  ${!Track.remote ? '<p class="muted">Class-wide counts are not connected, so this shows your own clicks in this browser.</p>' : ''}
  <div class="facts">
    <div><b>${src.views || 0}</b><span>room visits</span></div>
    <div><b>${opensTotal}</b><span>people opened</span></div>
    <div><b>${pct(opensTotal / views)}</b><span>opens per visit (click-through)</span></div>
    <div><b>${workTotal}</b><span>clicks on to a site or write-up</span></div>
    <div><b>${opensTotal ? pct(workTotal / opensTotal) : '0%'}</b><span>of opens lead to the work</span></div>
    <div><b>${crossTotal}</b><span>jumps to a related classmate</span></div>
  </div>

  <h2>People</h2>
  <div class="tablewrap"><table class="stats">
    <thead><tr>${th('name', 'PERSON')}<th>TABLE</th>${th('opens', 'OPENS')}${th('ctr', 'CTR')}${th('work', 'TO WORK')}${th('wctr', 'WORK CTR')}${th('cross', 'FROM RELATED')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td><button class="who" data-go="${r.p.id}"><i style="background:${esc(r.p.primary || r.p.colors?.primary || '#888')}"></i>${esc(r.p.name)}</button></td>
      <td>${r.p.group ? `G${r.p.group}` : '·'}</td>
      <td class="bar"><i style="width:${(r.opens / maxOpen) * 100}%"></i><span>${r.opens}</span></td>
      <td>${pct(r.ctr)}</td><td>${r.work}</td><td>${r.opens ? pct(r.wctr) : '·'}</td><td>${r.cross}</td></tr>`).join('')}</tbody>
  </table></div>
  <p class="muted">CTR = times this person was opened ÷ room visits (everyone is on screen in every visit). Work CTR = clicks to their site or a build ÷ their opens. From related = arrivals via another person's "related" or "paired" list.</p>

  <div class="cols">
    <section><h2>Tables</h2>${groups.map((x) => `<div class="hbar"><span>G${x.g}</span><div><i style="width:${((x.table + x.opens) / maxG) * 100}%"></i></div><em>${x.opens} opens · ${x.table} table clicks</em><small>${esc(x.names)}</small></div>`).join('')}</section>
    <section><h2>Themes people open</h2>${themeRows.map(([t, n]) => `<div class="hbar"><span>${esc(t)}</span><div><i style="width:${(n / maxT) * 100}%"></i></div><em>${n}</em></div>`).join('')}
      <h2>Everything else</h2>${other.map(([k, n]) => `<div class="kv"><span>${esc(k)}</span><b>${n}</b></div>`).join('')}</section>
  </div>
  <p class="end"><button data-csv>DOWNLOAD CSV</button> ${mode === 'you' ? '<button data-reset>RESET MY TALLY</button>' : ''}</p>
</article>`;
  }
  $('page-stats').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sort) { sortKey = b.dataset.sort; renderStats(); }
    if (b.dataset.mode && !b.disabled) {
      mode = b.dataset.mode;
      if (mode === 'everyone' && !everyone) { b.textContent = 'LOADING'; loadEveryone(true).then(() => { if (!everyone) mode = 'you'; renderStats(); }); return; }
      renderStats();
    }
    if (b.dataset.refresh !== undefined) { b.textContent = 'LOADING'; loadEveryone(true).then(renderStats); }
    if (b.dataset.reset !== undefined) { Track.reset(); renderStats(); }
    if (b.dataset.csv !== undefined) {
      const src = mode === 'everyone' && everyone ? everyone.events : Track.mine().events;
      const csv = 'event,count\n' + Object.entries(src || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k},${n}`).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `agent-studio-${mode}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    }
  });
  Track.onEvent(() => { if (!$('page-stats').hidden && mode === 'you') renderStats(); });

  show(location.hash.slice(1), false);
})();
