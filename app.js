// PronostiK : affichage public. Aucune saisie : tout vient de data/*.json, mis à jour automatiquement.
(function () {
  'use strict';
  const TZ = 'Europe/Paris';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const fr = (v, d = 3) => v.toLocaleString('fr-FR', {minimumFractionDigits: d, maximumFractionDigits: d});
  const fmtDay = new Intl.DateTimeFormat('fr-FR', {weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ});
  const fmtTime = new Intl.DateTimeFormat('fr-FR', {hour: '2-digit', minute: '2-digit', timeZone: TZ});
  const fmtStamp = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: TZ});
  const dayKey = d => new Intl.DateTimeFormat('en-CA', {timeZone: TZ}).format(d);

  const LG_NAME = {FL1: 'Ligue 1', PL: 'Premier League', BL1: 'Bundesliga', SA: 'Serie A', PD: 'La Liga', PPL: 'Liga Portugal', DED: 'Eredivisie', ELC: 'Championship', FL2: 'Ligue 2', CL: 'Ligue des champions', EL: 'Ligue Europa', ECL: 'Ligue Conférence', NL: 'Ligue des nations'};
  let LG_ORDER = ['FL1', 'PL', 'BL1', 'SA', 'PD', 'PPL', 'DED', 'ELC', 'FL2'];
  const LG_EMBLEM = {};
  const emb = (c, cls = 'lg-emb') => LG_EMBLEM[c] && /^https:\/\//.test(LG_EMBLEM[c]) ? `<span class="${cls}"><img src="${esc(LG_EMBLEM[c])}" alt="" loading="lazy"></span>` : '';
  let filter = 'all';
  let day = 'first', mode = 'next';
  let cache = null;

  async function load(f) {
    const r = await fetch('data/' + f + '?t=' + Date.now(), {cache: 'no-store'});
    if (!r.ok) throw new Error(f + ' : HTTP ' + r.status);
    return r.json();
  }

  // Arrondit 3 probabilités en entiers qui font toujours 100.
  function pct3(p) {
    const raw = p.map(v => v * 100), fl = raw.map(Math.floor);
    let rest = 100 - fl.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).slice(0, rest).forEach(([, i]) => fl[i]++);
    return fl;
  }
  const pc = v => Math.round(v * 100) + ' %';


  // Icônes (traits simples, couleur du texte)
  const I = d => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
    ball: I('<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M21 10l-5 0M3 10l5 0M8.5 19.5l1-5M15.5 19.5l-1-5"/>'),
    score: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14M7 10v4M17 10v4"/>'),
    check: I('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>'),
    alert: I('<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>'),
    clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    shield: I('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
    scale: I('<path d="M12 4v16M5 20h14M6 8h12M6 8l-3 6h6zM18 8l-3 6h6z"/>'),
    coin: I('<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-3 1-3 2.2 0 2.8 6 1.4 6 4.3 0 1.2-1.3 2.2-3 2.2-1.1 0-2.1-.5-2.6-1.5M12 6v2M12 16.5v1.5"/>'),
    up: I('<path d="M4 17l6-6 4 4 6-7"/><path d="M15 8h5v5"/>'),
    down: I('<path d="M4 7l6 6 4-4 6 7"/><path d="M15 16h5v-5"/>'),
    both: I('<circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/>'),
    plus: I('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
    half1: I('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>'),
    half2: I('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'),
    flag: I('<path d="M6 21V4"/><path d="M6 4l11 4-11 4"/>'),
    card: I('<rect x="7" y="3" width="10" height="16" rx="2" fill="#f6c76b" stroke="#f6c76b"/>'),
    cardr: I('<rect x="7" y="3" width="10" height="16" rx="2" fill="#ef4444" stroke="#ef4444"/>'),
    trophy: I('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>'),
    home: I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
    plane: I('<path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>'),
    chart: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    vs: I('<path d="M4 8h14l-3-3M20 16H6l3 3"/>'),
    info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>'),
    chat: I('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>'),
  };

  const LG_COLOR = {FL1: '#3b82f6', PL: '#a855f7', BL1: '#ef4444', SA: '#22c55e', PD: '#f59e0b', PPL: '#10b981', DED: '#fb923c', ELC: '#c084fc', FL2: '#60a5fa', CL: '#38bdf8', EL: '#f97316', ECL: '#22c55e', NL: '#e2e8f0'};
  const initials = n => String(n).replace(/\b(FC|AFC|CF|SC|AC|AS|US|SS|RC|CD|UD|SV|VfB|VfL|1\.)\b/gi, '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const hue = n => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const mono = n => `<span class="mono" style="background:linear-gradient(145deg,hsl(${hue(n)} 62% 48%),hsl(${(hue(n) + 40) % 360} 62% 34%))" aria-hidden="true">${esc(initials(n))}</span>`;
  const crestImg = (url, n) => url && /^https:\/\//.test(url) ? `<img class="crest${/flagcdn\.com|imgml\/flags/.test(url) ? ' flag' : ''}" src="${esc(url)}" alt="" loading="lazy" data-n="${esc(n)}">` : mono(n);
  document.addEventListener('error', e => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.parentElement && /lg-(emb|mini)/.test(t.parentElement.className)) { const btn = t.closest('[title]'); t.parentElement.outerHTML = `<span>${esc(btn ? btn.getAttribute('title') : '')}</span>`; return; }
    if (t && t.tagName === 'IMG' && t.classList.contains('crest')) { const w = document.createElement('span'); w.innerHTML = mono(t.dataset.n || '?'); t.replaceWith(w.firstChild); }
  }, true);

  // Affiche compacte de la liste : un clic ouvre la page du match.
  function posterHTML(p) {
    const lgc = LG_COLOR[p.lg] || 'var(--accent)', cr = p.crest || [];
    const topI = p.p ? p.p.indexOf(Math.max(...p.p)) : -1;
    const side = (name, url, fav) => `<div class="side${fav ? ' fav' : ''}">${crestImg(url, name)}<span class="nm">${esc(name)}</span></div>`;
    let foot = '<p class="pfoot muted">Pronostic indisponible</p>';
    if (p.p) {
      const v = pct3(p.p), t = topI, lab = t === 1 ? 'Match nul' : t === 0 ? p.home : p.away;
      const tag = v[t] >= 60 ? ['Favori net', 'ok'] : v[t] < 45 ? ['Match ouvert', ''] : ['Léger favori', ''];
      foot = `<div class="seg mini" aria-hidden="true">${v.map((x, i) => `<span class="s${i}${i === t ? ' lead' : ''}" style="width:${x}%"></span>`).join('')}</div>
        <div class="pfoot"><span class="tag ${tag[1]}">${tag[0]}</span><span class="pfav">${esc(lab)} <b>${v[t]} %</b></span></div>`;
    }
    return `<a class="poster" href="#match/${encodeURIComponent(p.id)}" style="--lg:${lgc}" aria-label="${esc(p.home)} contre ${esc(p.away)}, voir le pronostic">
      <div class="meta"><span class="lgname" title="${esc(LG_NAME[p.lg] || p.lg || '')}">${emb(p.lg, 'lg-mini') || `<i style="background:${lgc}"></i>${esc(LG_NAME[p.lg] || p.lg || '')}`}</span><span class="ptime">${esc(fmtTime.format(new Date(p.kickoff)))}</span></div>
      <div class="match">${side(p.home, cr[0], topI === 0)}<div class="mid"><small>VS</small></div>${side(p.away, cr[1], topI === 2)}</div>${foot}</a>`;
  }

  // Carte d'un match joué : score, nos probabilités et les cotes d'avant-match, issue réelle surlignée.
  function resultHTML(p) {
    const lgc = LG_COLOR[p.lg] || 'var(--accent)', cr = p.crest || [], i = 'HDA'.indexOf(p.res), t = p.p.indexOf(Math.max(...p.p));
    const v = pct3(p.p), side = (name, url, win) => `<div class="side${win ? ' fav' : ''}">${crestImg(url, name)}<span class="nm">${esc(name)}</span></div>`;
    const od = Array.isArray(p.od) && p.od.length === 3 ? p.od : Array.isArray(p.mk) && p.mk.length === 3 ? p.mk.map(x => 1 / x) : null;
    const odLab = Array.isArray(p.od) ? 'cote' : 'cote ≈';
    const cells = [0, 1, 2].map(k => `<div class="rc${k === i ? ' hit' : ''}${k === t ? ' ours' : ''}"><small>${['1', 'N', '2'][k]}</small><b>${v[k]} %</b>${od ? `<em>${odLab} ${fr(od[k], 2)}</em>` : ''}</div>`).join('');
    const tag = t === i ? ['Favori ✓', 'ok'] : p.p[i] < 0.3 ? ['Surprise', 'ko'] : ['Favori battu', 'ko'];
    return `<a class="poster result" href="#match/${encodeURIComponent(p.id)}" style="--lg:${lgc}" aria-label="${esc(p.home)} ${esc(p.final || '')} ${esc(p.away)}">
      <div class="meta"><span class="lgname" title="${esc(LG_NAME[p.lg] || p.lg || '')}">${emb(p.lg, 'lg-mini') || `<i style="background:${lgc}"></i>${esc(LG_NAME[p.lg] || p.lg || '')}`}</span><span class="ptime">${esc(fmtTime.format(new Date(p.kickoff)))}</span></div>
      <div class="match">${side(p.home, cr[0], i === 0)}<div class="mid"><strong class="fscore">${esc((p.final || '').replace('–', ' – '))}</strong></div>${side(p.away, cr[1], i === 2)}</div>
      <div class="rcells">${cells}</div>
      <div class="pfoot"><span class="tag ${tag[1]}">${tag[0]}</span><span class="pfav">${od ? 'Cotes d’avant-match' : 'Sans cotes'}</span></div></a>`;
  }

  function matchPageHTML(p) {
    const lgc = LG_COLOR[p.lg] || 'var(--accent)';
    const time = (LG_NAME[p.lg] || p.lg || '') + ' · ' + fmtDay.format(new Date(p.kickoff));
    const isCL = ['CL', 'EL', 'ECL'].includes(p.lg), isEL = p.lg === 'EL' || p.lg === 'ECL', cupName = LG_NAME[p.lg] || '', isNat = p.lg === 'NL';
    const chip = p.rel === 'test' ? '<span class="chip new">Nouveau · fiabilité en test</span>' : p.rel === 'limited' ? '<span class="chip warn">Échantillon réduit</span>' : '';
    const topI = p.p ? p.p.indexOf(Math.max(...p.p)) : -1;
    const cr = p.crest || [], st = p.stats || null;
    const rk = r => r ? `<small class="rank">${r}${r === 1 ? 'er' : 'e'} ${isCL ? 'en championnat' : 'au classement'}</small>` : '';
    const side = (name, url, fav, r) => `<div class="side${fav ? ' fav' : ''}">${crestImg(url, name)}<span class="nm">${esc(name)}</span>${rk(r)}</div>`;
    const head = `<div class="meta"><span class="lgname">${emb(p.lg, 'lg-mini') || `<i style="background:${lgc}"></i>`}${esc(time)}</span>${chip}</div>
      <div class="match big">${side(p.home, cr[0], topI === 0, st && st.dom && st.dom.rang)}<div class="mid">${p.final ? `<strong class="fscore">${esc(p.final.replace('–', ' – '))}</strong><small>TERMINÉ</small>` : `<strong>${esc(fmtTime.format(new Date(p.kickoff)))}</strong><small>VS</small>`}</div>${side(p.away, cr[1], topI === 2, st && st.ext && st.ext.rang)}</div>`;
    if (!p.p) {
      return `<article class="mpage card" style="--lg:${lgc}"><div class="head" style="cursor:default">${head}<p class="muted" style="margin:0;font-size:13px">${/non reconnue/.test(p.err || '') ? 'Pronostic indisponible : une des équipes n’est pas encore reconnue.' : 'Pronostic indisponible : pas assez de matchs récents pour une de ces équipes.'}</p></div></article>`;
    }
    const pcts = pct3(p.p), top = topI;
    const labels = ['Domicile', 'Nul', 'Extérieur'], tags = ['1', 'N', '2'];
    const cells = pcts.map((v, i) => `<div class="cell ${i === top ? 'best' : ''}"><div class="v">${v} %</div><div class="k" title="${esc(labels[i])}"><b>${tags[i]}</b> ${esc(labels[i])}</div></div>`).join('');
    const seg = `<div class="seg" aria-hidden="true">${pcts.map((v, i) => `<span class="s${i}${i === top ? ' lead' : ''}" style="width:${v}%"></span>`).join('')}</div>`;
    const read = pcts[top] >= 60 ? ['Favori net', 'ok'] : pcts[top] < 45 ? ['Match ouvert', ''] : ['Léger favori', ''];
    const who = top === 1 ? 'un match nul' : 'une victoire de ' + (top === 0 ? p.home : p.away);
    const mkp = Array.isArray(p.mk) && p.mk.length === 3 ? pct3(p.mk) : null;
    const mkline = mkp ? `<p class="mkline">Cotes des bookmakers : <b>${mkp[0]} %</b> · <b>${mkp[1]} %</b> · <b>${mkp[2]} %</b></p>` : '';
    const sum = `<p class="read"><span class="tag ${read[1]}">${read[0]}</span> ${pcts[top]} % pour ${esc(who)}</p>`;

    // --- Onglet Analyse : cartes visuelles
    const fav = top === 0 ? p.home : top === 2 ? p.away : 'Match nul';
    const agreeD = mkp ? Math.max(...[0, 1, 2].map(k => Math.abs(pcts[k] - mkp[k]))) : null;
    const ins = (ic, lab, val, sub, cls = '') => `<div class="ins ${cls}"><span class="ic">${ICON[ic]}</span><small>${lab}</small><b>${val}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
    const ring = (lab, v) => `<div class="ring" style="--v:${Math.round(v * 100)}"><div class="ring-in"><b>${Math.round(v * 100)}%</b></div><small>${esc(lab)}</small></div>`;
    const analyse = `<div class="insights">
        ${ins('target', 'Favori', esc(fav), `${pcts[top]} %`)}
        ${ins('ball', 'Buts attendus', `${fr(p.lam[0], 1)} – ${fr(p.lam[1], 1)}`, 'domicile – extérieur')}
        ${ins('score', 'Score probable', esc(p.score), '')}
        ${mkp ? ins(agreeD <= 5 ? 'check' : 'alert', 'Bookmakers', agreeD <= 5 ? 'D’accord' : 'Désaccord', `écart max ${agreeD} pts`, agreeD <= 5 ? 'ok' : 'warn') : ins('clock', 'Bookmakers', '—', isCL ? 'pas de cotes pour cette coupe' : isNat ? 'pas de cotes pour les sélections' : 'cotes pas encore publiées')}
      </div>
      <h3>${ICON.shield} Double chance</h3>
      <div class="rings">${ring(p.home + ' ou nul', p.p[0] + p.p[1])}${ring('Pas de nul', p.p[0] + p.p[2])}${ring(p.away + ' ou nul', p.p[1] + p.p[2])}</div>
      ${mkp ? `<h3>${ICON.scale} Modèle et bookmakers</h3><div class="vs3">${[0, 1, 2].map(k => `<div><small>${['1', 'N', '2'][k]}</small><div class="mini2"><span style="width:${pcts[k]}%"></span></div><div class="mini2 mk"><span style="width:${mkp[k]}%"></span></div><em>${pcts[k]} % · ${mkp[k]} %</em></div>`).join('')}</div><p class="legend"><i class="lg-a"></i>Notre modèle <i class="lg-b"></i>Bookmakers</p>` : ''}
      <h3>${ICON.coin} Cote équivalente</h3>
      <div class="odds3">${[['1', p.p[0]], ['N', p.p[1]], ['2', p.p[2]]].map(([l, v]) => `<div><small>${l}</small><b>${fr(1 / v, 2)}</b></div>`).join('')}</div>`;

    // --- Onglet Statistiques : barres en duel
    let stats = '<p class="muted">Statistiques indisponibles pour ce match.</p>';
    if (st && st.dom && st.ext && st.dom.tout.p && st.ext.tout.p) {
      const H = st.dom, A = st.ext, per = (x, n) => n ? Math.round(100 * x / n) : 0, av = (x, n) => n ? x / n : null;
      const duel = (ic, lab, a, b, fmt, better) => {
        if (a == null || b == null) return '';
        const t = a + b, wa = t ? 100 * a / t : 50;
        const wA = better === 'high' ? a > b : better === 'low' ? a < b : false, wB = better === 'high' ? b > a : better === 'low' ? b < a : false;
        return `<div class="duel"><b class="${wA ? 'win' : ''}">${fmt(a)}</b><span class="dl">${ICON[ic]}${lab}</span><b class="r ${wB ? 'win' : ''}">${fmt(b)}</b>
          <div class="dbar"><span class="da${wA ? ' win' : ''}" style="width:${wa}%"></span><span class="db${wB ? ' win' : ''}" style="width:${100 - wa}%"></span></div></div>`;
      };
      const f1 = v => fr(v, 1), pct = v => v + ' %', int = v => String(v);
      const rank = r => r ? `${r}<sup>${r === 1 ? 'er' : 'e'}</sup>` : '—';
      const both = (f) => (f(H) + f(A)) / 2;
      const tile = (ic, val, lab, cls) => `<div class="tile ${cls}"><b>${val}</b><span class="tl">${lab}${ICON[ic]}</span></div>`;
      const apercu = `<h3>${ICON.chart} Aperçu des deux équipes</h3><div class="tiles">
        ${tile('plus', Math.round(both(T => per(T.tout.o25, T.tout.p))) + '%', '+2,5 buts', 't1')}
        ${tile('plus', Math.round(both(T => per(T.tout.o15 || 0, T.tout.p))) + '%', '+1,5 but', 't2')}
        ${tile('both', Math.round(both(T => per(T.tout.btts, T.tout.p))) + '%', 'Les 2 marquent', 't3')}
        ${tile('ball', fr(both(T => (T.tout.gf + T.tout.ga) / T.tout.p), 1), 'Buts / match', 't4')}
        ${H.tout.nc && A.tout.nc ? tile('flag', fr(both(T => (T.tout.cf + T.tout.ca) / T.tout.nc), 1), 'Corners / match', 't5') : ''}
        ${H.tout.nk && A.tout.nk ? tile('card', fr(H.tout.yc / H.tout.nk + A.tout.yc / A.tout.nk, 1), 'Cartons / match', 't6') : ''}
      </div><p class="note">Moyenne des matchs de la saison des deux équipes (observé, pas une prédiction).</p>`;
      const fmtShort = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short', timeZone: TZ});
      const rowsOf = (T, side) => (T.matchs || []).map(m => { const r = m.f > m.a ? 'w' : m.f === m.a ? 'd' : 'l', L = {w: 'V', d: 'N', l: 'D'}[r];
        return `<div class="srow" data-side="${side}" data-r="${r}"><span class="dot ${L}">${L}</span><small>${esc(fmtShort.format(new Date(m.d + 'T12:00:00Z')))}</small><span class="sopp">${m.v === 'D' ? ICON.home : ICON.plane}${esc(m.o)}</span><b>${m.f}–${m.a}</b></div>`; }).join('');
      const seasonList = (H.matchs && H.matchs.length) || (A.matchs && A.matchs.length) ? `<div class="season" data-show="h" data-filter="">
          <div class="steams"><button type="button" class="steam" data-team="h" aria-pressed="true">${crestImg((p.crest || [])[0], p.home)}${esc(p.home)}</button><button type="button" class="steam" data-team="a" aria-pressed="false">${crestImg((p.crest || [])[1], p.away)}${esc(p.away)}</button></div>
          <div class="slist">${rowsOf(H, 'h')}${rowsOf(A, 'a')}</div>
          <p class="sempty muted" hidden>Aucun match pour ce filtre.</p>
          <p class="note">${ICON.home} domicile · ${ICON.plane} extérieur · touchez une pastille V, N ou D pour filtrer.</p></div>` : '';
      stats = `${apercu}<div class="duel-head"><span>${crestImg((p.crest || [])[0], p.home)}${esc(p.home)}</span><span>${esc(p.away)}${crestImg((p.crest || [])[1], p.away)}</span></div>
        <div class="ranks"><div><b>${rank(H.rang)}</b><small>${H.pts} pts</small></div><span>${ICON.trophy}Classement</span><div><b>${rank(A.rang)}</b><small>${A.pts} pts</small></div></div>
        <div class="wdl"><div>${['w', 'd', 'l'].map(k => `<button type="button" class="pill ${k}" data-team="h" data-f="${k}" aria-label="Voir les ${{w: 'victoires', d: 'nuls', l: 'défaites'}[k]} de ${esc(p.home)}">${H.tout[k]}</button>`).join('')}</div><span>V · N · D</span><div>${['w', 'd', 'l'].map(k => `<button type="button" class="pill ${k}" data-team="a" data-f="${k}" aria-label="Voir les ${{w: 'victoires', d: 'nuls', l: 'défaites'}[k]} de ${esc(p.away)}">${A.tout[k]}</button>`).join('')}</div></div>
        ${seasonList}
        <h3>${ICON.ball} Buts</h3>
        ${duel('up', 'Marqués / match', av(H.tout.gf, H.tout.p), av(A.tout.gf, A.tout.p), f1, 'high')}
        ${duel('down', 'Encaissés / match', av(H.tout.ga, H.tout.p), av(A.tout.ga, A.tout.p), f1, 'low')}
        ${duel('shield', 'Sans encaisser', per(H.tout.cs, H.tout.p), per(A.tout.cs, A.tout.p), pct, 'high')}
        ${duel('both', 'Les 2 marquent', per(H.tout.btts, H.tout.p), per(A.tout.btts, A.tout.p), pct, '')}
        ${duel('plus', '+2,5 buts', per(H.tout.o25, H.tout.p), per(A.tout.o25, A.tout.p), pct, '')}
        ${H.tout.nh && A.tout.nh ? `<h3>${ICON.clock} Mi-temps</h3>
        ${duel('half1', 'Marqués 1re MT', av(H.tout.h1f, H.tout.nh), av(A.tout.h1f, A.tout.nh), f1, 'high')}
        ${duel('half2', 'Marqués 2e MT', av(H.tout.h2f, H.tout.nh), av(A.tout.h2f, A.tout.nh), f1, 'high')}
        ${duel('half1', 'Encaissés 1re MT', av(H.tout.h1a, H.tout.nh), av(A.tout.h1a, A.tout.nh), f1, 'low')}
        ${duel('half2', 'Encaissés 2e MT', av(H.tout.h2a, H.tout.nh), av(A.tout.h2a, A.tout.nh), f1, 'low')}` : ''}
        ${H.tout.nc && A.tout.nc ? `<h3>${ICON.flag} Corners</h3>
        ${duel('flag', 'Obtenus / match', av(H.tout.cf, H.tout.nc), av(A.tout.cf, A.tout.nc), f1, 'high')}
        ${duel('flag', 'Concédés / match', av(H.tout.ca, H.tout.nc), av(A.tout.ca, A.tout.nc), f1, 'low')}` : ''}
        ${H.tout.nk && A.tout.nk ? `<h3>${ICON.card} Cartons</h3>
        ${duel('card', 'Jaunes / match', av(H.tout.yc, H.tout.nk), av(A.tout.yc, A.tout.nk), f1, 'low')}
        ${duel('cardr', 'Rouges (saison)', H.tout.rc, A.tout.rc, int, 'low')}` : ''}
        <h3>${ICON.home} ${esc(p.home)} à domicile · ${esc(p.away)} à l’extérieur</h3>
        <div class="wdl"><div>${['w', 'd', 'l'].map(k => `<span class="pill ${k}">${H.lieu[k]}</span>`).join('')}</div><span>V · N · D</span><div>${['w', 'd', 'l'].map(k => `<span class="pill ${k}">${A.lieu[k]}</span>`).join('')}</div></div>
        ${duel('up', 'Marqués / match', av(H.lieu.gf, H.lieu.p), av(A.lieu.gf, A.lieu.p), f1, 'high')}
        ${duel('down', 'Encaissés / match', av(H.lieu.ga, H.lieu.p), av(A.lieu.ga, A.lieu.p), f1, 'low')}
        <p class="note">${isCL ? `Saison en cours, championnat national de chaque club${st.src && (st.src.dom || st.src.ext) ? ` (Coupe d’Europe pour ${[st.src.dom ? p.home : null, st.src.ext ? p.away : null].filter(Boolean).join(' et ')}, faute de données sur son championnat)` : ''}.` : 'Saison en cours, championnat.'} Valeurs observées, pas des prédictions.</p>`;
    }

    // --- Onglet Forme : pastilles
    const formRow = (name, url, arr) => {
      const r = (arr || []).slice().reverse();
      return `<div class="frow"><div class="fteam">${crestImg(url, name)}<b>${esc(name)}</b></div><div class="fdots">${r.map(m => { const k = m.f > m.a ? 'V' : m.f === m.a ? 'N' : 'D'; return `<div class="fd"><span class="dot ${k}" title="${m.v === 'D' ? 'contre' : 'à'} ${esc(m.o)}">${k}</span><small>${m.f}-${m.a}</small></div>`; }).join('') || '<small class="muted">Pas de données</small>'}</div></div>`;
    };
    const forme = `${formRow(p.home, (p.crest || [])[0], p.form && p.form.h)}${formRow(p.away, (p.crest || [])[1], p.form && p.form.a)}<p class="note">Du plus ancien au plus récent (à droite). Touchez une pastille pour voir l’adversaire.</p>`;

    // --- Onglet Face-à-face : barre de bilan + liste
    let h2h = `<p class="muted">Aucune confrontation récente dans nos données (depuis ${isNat ? '2016' : isCL ? '2017, en Coupe d’Europe' : '2023'}).</p>`;
    if (st && st.h2h && st.h2h.length) {
      const L = st.h2h; let wh = 0, dr = 0, wa2 = 0;
      for (const m of L) { const hs = m.h === p.home ? m.hg : m.ag, as = m.h === p.home ? m.ag : m.hg; if (hs > as) wh++; else if (hs < as) wa2++; else dr++; }
      const n = L.length, w = x => Math.max(4, 100 * x / n);
      h2h = `<div class="h2h-sum"><span>${crestImg((p.crest || [])[0], p.home)}</span><b>${n} match${n > 1 ? 's' : ''}</b><span>${crestImg((p.crest || [])[1], p.away)}</span></div>
        <div class="h2h-bar"><span class="a" style="flex:${w(wh)}"></span><span class="d" style="flex:${w(dr)}"></span><span class="b" style="flex:${w(wa2)}"></span></div>
        <div class="h2h-leg"><span class="a">${wh} victoire${wh > 1 ? 's' : ''}</span><span>${dr} nul${dr > 1 ? 's' : ''}</span><span class="b">${wa2} victoire${wa2 > 1 ? 's' : ''}</span></div>
        <div class="h2h">${L.map(m => `<div class="hrow"><small>${esc(new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date(m.d + 'T12:00:00Z')))}</small><span>${esc(m.h)}</span><b>${m.hg} – ${m.ag}</b><span>${esc(m.a)}</span></div>`).join('')}</div>`;
    }

    // --- Onglet Classement : championnat en cours, les deux équipes surlignées
    let classement = '<p class="muted">Classement indisponible pour le moment.</p>';
    const SD = cache && cache.stand && cache.stand[p.lg];
    if (SD && SD.rows && SD.rows.length) {
      const n = SD.rows.length, rel = isCL ? n - 24 : ({FL1: 2, PL: 3, BL1: 2, SA: 3, PD: 3, PPL: 2, DED: 2, ELC: 3, FL2: 2}[p.lg] || 3), div2 = p.lg === 'ELC' || p.lg === 'FL2', topN = isCL ? 8 : p.lg === 'ELC' ? 6 : p.lg === 'FL2' ? 5 : 4;
      const raw = {h: p.rawHome || p.home, a: p.rawAway || p.away};
      const isMe = (r, nm) => r.t === nm || (isCL && r.crest && ((nm === raw.h && r.crest === (p.crest || [])[0]) || (nm === raw.a && r.crest === (p.crest || [])[1])));
      classement = `<div class="table-lg">${SD.rows.map(r => {
        const me = isMe(r, raw.h) ? ' me-h' : isMe(r, raw.a) ? ' me-a' : '', zone = r.rang <= topN ? ' z-top' : r.rang > n - rel ? ' z-bot' : isCL ? ' z-mid' : '';
        return `<div class="trow${me}${zone}"><span class="tr">${r.rang}</span><span class="tt">${r.crest ? crestImg(r.crest, dn(r.t)) : mono(dn(r.t))}<b>${esc(dn(r.t))}</b></span><span class="tf">${(r.form || '').split('').map(c => `<i class="${c}"></i>`).join('')}</span><span class="tn">${r.p}</span><span class="tn">${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</span><span class="tp">${r.pts}</span></div>`;
      }).join('')}</div>
      <div class="tlegend">${isCL ? '<span><i class="lz top"></i>Qualifiés pour les 8es</span><span><i class="lz mid"></i>Barrages</span><span><i class="lz bot"></i>Éliminés</span>' : `<span><i class="lz top"></i>${div2 ? 'Montée (directe ou barrages)' : 'Places européennes (indicatif)'}</span><span><i class="lz bot"></i>Relégation</span>`}</div>
      <p class="note">J : matchs joués · Diff. : différence de buts · pastilles : 5 derniers résultats. Calculé à partir des résultats connus du site.</p>`;
      classement = `<div class="thead"><span>#</span><span>Équipe</span><span>Forme</span><span>J</span><span>Diff.</span><span>Pts</span></div>` + classement;
    }
    // --- Onglet Marchés : autres paris, avec leur niveau de fiabilité mesuré
    let marches = '<p class="muted">Marchés indisponibles pour ce match.</p>';
    if (p.markets) {
      const M = p.markets, P = v => Math.round(v * 100);
      const fiab = (lvl, txt) => `<span class="fiab ${lvl}" title="${esc(txt)}">${lvl === 'ok' ? 'Fiabilité bonne' : lvl === 'low' ? 'Fiabilité faible' : 'Fiabilité moyenne'}</span>`;
      const dnb = p.p[0] + p.p[2] > 0 ? p.p[0] / (p.p[0] + p.p[2]) : 0.5;
      const pair = (a, la, b, lb) => `<div class="mk2"><div class="${a >= b ? 'on' : ''}"><b>${a} %</b><small>${la}</small></div><div class="${b > a ? 'on' : ''}"><b>${b} %</b><small>${lb}</small></div></div>`;
      const hp = pct3(M.ht);
      const T = isEL ? {o25: `Pas encore testé sur la ${cupName}.`, btts: `Pas encore testé sur la ${cupName}.`, o15: `Pas encore testé sur la ${cupName}.`, ht: `Pas encore testé sur la ${cupName}.`, sc: `Pas encore testé sur la ${cupName}.`, n: `537 matchs de C1 (modèle appliqué à la ${cupName}, non testé sur elle)`}
        : isNat ? {o25: 'Pas encore testé sur les sélections.', btts: 'Pas encore testé sur les sélections.', o15: 'Pas encore testé sur les sélections.', ht: 'Pas encore testé sur les sélections.', sc: 'Pas encore testé sur les sélections.', n: '1 013 matchs européens (1N2 seulement)'}
        : isCL ? {o25: 'Testé sur 537 matchs de C1 : à peine mieux que la moyenne des matchs.', btts: 'Testé sur 537 matchs de C1 : pas d’apport démontré.', o15: 'Testé sur 537 matchs de C1 : à peine mieux que la moyenne des matchs.', ht: 'Pas encore testé sur la C1.', sc: 'Pas encore testé sur la C1.', n: '537 matchs de C1 (2023-2026)'}
        : {o25: 'Testé sur 2 080 matchs : pas d’apport démontré par rapport à la moyenne du championnat, et les bookmakers sont plus précis.', btts: 'Testé sur 2 080 matchs : pas d’apport démontré par rapport à la moyenne du championnat.', o15: 'Testé sur 2 080 matchs : à peine plus précis que la moyenne des matchs.', ht: 'Testé sur 2 080 matchs : bien calibré.', sc: 'Testé sur 2 080 matchs : le score le plus probable sort environ 12 fois sur 100, comme annoncé.', n: '2 080 matchs'};
      marches = `
        <div class="mkt"><div class="mkt-h"><span>${ICON.plus}Plus / moins de 2,5 buts</span>${fiab('low', T.o25)}</div>${pair(P(M.o25), 'Plus de 2,5', 100 - P(M.o25), 'Moins de 2,5')}<p class="mknote">${isCL || isNat ? 'Indicatif : estimation peu précise sur ce marché.' : 'Indicatif : sur ce marché, les cotes des bookmakers sont plus précises que le modèle.'}</p></div>
        ${M.btts != null ? `<div class="mkt"><div class="mkt-h"><span>${ICON.both}Les deux équipes marquent</span>${fiab('low', T.btts)}</div>${pair(P(M.btts), 'Oui', 100 - P(M.btts), 'Non')}<p class="mknote">Indicatif : estimation peu précise sur ce marché.</p></div>` : ''}
        <div class="mkt"><div class="mkt-h"><span>${ICON.plus}Plus / moins de 1,5 but</span>${fiab('mid', T.o15)}</div>${pair(P(M.o15), 'Plus de 1,5', 100 - P(M.o15), 'Moins de 1,5')}</div>
        <div class="mkt"><div class="mkt-h"><span>${ICON.half1}Résultat à la mi-temps</span>${fiab(isCL || isNat ? 'mid' : 'ok', T.ht)}</div>
          <div class="mk3">${[['1', p.home], ['N', 'Nul'], ['2', p.away]].map(([t, l], i) => `<div class="${i === M.ht.indexOf(Math.max(...M.ht)) ? 'on' : ''}"><b>${hp[i]} %</b><small>${t} · ${esc(l)}</small></div>`).join('')}</div></div>
        <div class="mkt"><div class="mkt-h"><span>${ICON.score}Scores exacts les plus probables</span>${fiab(isCL || isNat ? 'mid' : 'ok', T.sc)}</div>
          <div class="mk3">${M.scores.map(([s, v], i) => `<div class="${i === 0 ? 'on' : ''}"><b>${esc(s.replace('-', ' – '))}</b><small>${P(v)} %</small></div>`).join('')}</div></div>
        <div class="mkt"><div class="mkt-h"><span>${ICON.shield}Remboursé si match nul</span>${fiab('ok', 'Déduit directement des probabilités 1N2.')}</div>${pair(P(dnb), esc(p.home), 100 - P(dnb), esc(p.away))}</div>
        <p class="note">${ICON.info} Probabilités statistiques, pas des conseils de pari. Les badges indiquent la fiabilité mesurée sur ${T.n}.</p>`;
    }
    // Compositions : onze aligné au dernier match de championnat (ESPN)
    const cmp = cache && cache.compos ? [p.rawHome, p.rawAway].map(n => cache.compos[p.lg + '|' + n] || cache.composByName[n] || null) : [null, null];
    const ligne = pos => { const x = String(pos || '').toUpperCase(); return x === 'G' || x === 'GK' ? 0 : /^(CD|SW)|B/.test(x) ? 1 : /M/.test(x) ? 2 : 3; };
    const LIG = ['Gardien', 'Défense', 'Milieu', 'Attaque'];
    const fmtD = d => new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short'}).format(new Date(d + 'T12:00:00Z'));
    const oneXI = (c, name, crest) => {
      if (!c) return `<div class="xi"><div class="xi-h">${crestImg(crest, name)}<b>${esc(name)}</b></div><p class="muted">Composition non disponible.</p></div>`;
      const g = [[], [], [], []]; c.xi.forEach(([n, nom, pos]) => g[ligne(pos)].push(esc(nom)));
      return `<div class="xi"><div class="xi-h">${crestImg(crest, name)}<b>${esc(name)}</b>${c.f ? `<span class="xi-f">${esc(c.f)}</span>` : ''}</div>
        <small class="muted">Dernier match : ${esc(fmtD(c.d))} · ${c.v === 'D' ? 'contre' : 'à'} ${esc(dn(c.o))} · ${esc(c.s.replace('-', ' – '))}</small>
        ${g.map((L, i) => L.length ? `<div class="xi-l"><span>${LIG[i]}</span><p>${L.join(', ')}</p></div>` : '').join('')}</div>`;
    };
    const compos = isNat ? '' : `${oneXI(cmp[0], p.home, (p.crest || [])[0])}${oneXI(cmp[1], p.away, (p.crest || [])[1])}
      <p class="note">${ICON.info} Onze de départ aligné lors du dernier match de championnat de chaque équipe. La composition officielle de ce match est publiée environ 1 h avant le coup d’envoi.</p>`;
    const tabs = [['analyse', ICON.target + 'Analyse', analyse], ['marches', ICON.coin + 'Marchés', marches], ['stats', ICON.chart + 'Stats', stats], ['classement', ICON.trophy + 'Classement', classement], ['forme', ICON.up + 'Forme', forme], ['h2h', ICON.vs + 'Face-à-face', h2h], ['compos', ICON.ball + 'Compos', compos]].filter(([k]) => !(isNat && (k === 'stats' || k === 'classement' || k === 'compos')));
    return `<article class="mpage card" style="--lg:${lgc}">
      <div class="head" style="cursor:default">${head}${sum}${seg}<div class="probs">${cells}</div>${mkline}</div>
      <div class="detail">
        <div class="tabs" role="tablist">${tabs.map(([k, l], i) => `<button type="button" role="tab" class="tab" data-tab="${k}" aria-selected="${i === 0}">${l}</button>`).join('')}</div>
        ${tabs.map(([k, , html], i) => `<div class="tabpanel" data-panel="${k}" role="tabpanel"${i ? ' hidden' : ''}>${html}</div>`).join('')}
        <a class="ask" href="#chat/${encodeURIComponent(p.id)}">${ICON.chat}Poser une question sur ce match</a>
        <p class="note">${ICON.info} Le modèle ignore compositions et blessures. Un résultat à ${pcts[top]} % échoue ${100 - pcts[top]} fois sur 100.</p>
      </div></article>`;
  }

  function renderMatches(preds, meta) {
    const now = Date.now();
    if (meta && meta.leagues) { meta.leagues.forEach(l => { LG_NAME[l.code] = l.name; if (l.emblem) LG_EMBLEM[l.code] = l.emblem; }); LG_ORDER = meta.leagues.map(l => l.code); }
    document.querySelectorAll('#mode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    const isRes = mode === 'res';
    const all = isRes ? preds.filter(p => p.p && ['H', 'D', 'A'].includes(p.res) && new Date(p.kickoff).getTime() > now - 7 * 86400e3)
      : preds.filter(p => !p.res && new Date(p.kickoff).getTime() > now - 3 * 3600e3);
    const counts = {}; all.forEach(p => counts[p.lg] = (counts[p.lg] || 0) + 1);
    $('chips').innerHTML = [`<button type="button" class="chip-btn lg-all" data-lg="all" aria-pressed="${filter === 'all'}" aria-label="Tous les championnats">${ICON.ball}<span>Tous</span></button>`]
      .concat(LG_ORDER.filter(c => counts[c]).map(c => `<button type="button" class="chip-btn lg-chip" data-lg="${c}" aria-pressed="${filter === c}" aria-label="${esc(LG_NAME[c] || c)}" title="${esc(LG_NAME[c] || c)}">${emb(c) || `<span>${esc(LG_NAME[c] || c)}</span>`}</button>`)).join('');
    const lgAll = all.filter(p => filter === 'all' || p.lg === filter).sort((a, b) => isRes ? b.kickoff.localeCompare(a.kickoff) : a.kickoff.localeCompare(b.kickoff));
    const dayOf = p => dayKey(new Date(p.kickoff));
    const dayList = [...new Set(lgAll.map(dayOf))];
    if (day === 'first' || (day !== 'all' && !dayList.includes(day))) day = dayList[0] || 'all';
    const fmtWd = new Intl.DateTimeFormat('fr-FR', {weekday: 'short', timeZone: TZ}), fmtNum = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', timeZone: TZ});
    const today = dayKey(new Date());
    $('days').innerHTML = dayList.length > 1 ? [`<button type="button" class="day-btn" data-day="all" aria-pressed="${day === 'all'}"><span>${isRes ? '7 jours' : 'À venir'}</span><b>${lgAll.length}</b><i>matchs</i></button>`].concat(dayList.map(k => {
      const d = new Date(lgAll.find(p => dayOf(p) === k).kickoff), n = lgAll.filter(p => dayOf(p) === k).length;
      return `<button type="button" class="day-btn" data-day="${k}" aria-pressed="${day === k}"><span>${k === today ? 'Auj.' : esc(fmtWd.format(d))}</span><b>${esc(fmtNum.format(d))}</b><i>${n} match${n > 1 ? 's' : ''}</i></button>`;
    })).join('') : '';
    const up = day === 'all' ? lgAll : lgAll.filter(p => dayOf(p) === day);
    // « À retenir » : le favori le plus net et le match le plus serré parmi ceux affichés.
    const ranked = up.filter(p => p.p), spot = $('spot');
    if (!isRes && ranked.length >= 3) {
      const top = p => Math.max(...p.p), sure = ranked.reduce((a, b) => top(b) > top(a) ? b : a), open = ranked.reduce((a, b) => top(b) < top(a) ? b : a);
      const who = p => { const i = p.p.indexOf(top(p)); return i === 1 ? 'Match nul' : i === 0 ? p.home : p.away; };
      const tile = (lab, p) => `<a class="spot-tile" href="#match/${encodeURIComponent(p.id)}"><div class="spot-txt"><small>${lab}</small><strong>${esc(p.home)} – ${esc(p.away)}</strong><span>${esc(who(p))}</span></div><b class="spot-pct">${Math.round(top(p) * 100)}<i>%</i></b></a>`;
      spot.innerHTML = `<h2 class="section-title" style="margin-top:6px">À retenir</h2><div class="spot-row">${tile('Favori le plus net', sure)}${sure === open ? '' : tile('Match le plus serré', open)}</div>`;
      spot.hidden = false;
    } else { spot.innerHTML = ''; spot.hidden = true; }
    const list = $('list');
    if (!up.length) {
      list.innerHTML = isRes ? '<div class="empty"><strong>Aucun résultat sur les 7 derniers jours' + (filter === 'all' ? '' : ' dans ce championnat') + '.</strong></div>' : '<div class="empty"><strong>Aucun match annoncé' + (filter === 'all' ? '' : ' dans ce championnat') + ' pour le moment.</strong><br>Les matchs des 7 prochains jours s’affichent ici dès la publication du calendrier.</div>';
    } else {
      let html = isRes ? '<p class="note res-legend">★ notre favori · case verte : le résultat du match · cotes relevées avant le coup d’envoi</p>' : '', cur = '';
      for (const p of up) {
        const k = dayKey(new Date(p.kickoff));
        if (k !== cur) { html += (cur ? '</div>' : '') + `<h2 class="day">${esc(fmtDay.format(new Date(p.kickoff)))}</h2><div class="posters">`; cur = k; }
        html += isRes ? resultHTML(p) : posterHTML(p);
      }
      list.innerHTML = html + (cur ? '</div>' : '');
    }
    $('freshness').textContent = up.length
      ? `${up.length} ${isRes ? 'résultat' + (up.length > 1 ? 's' : '') : 'match' + (up.length > 1 ? 's' : '') + ' à venir'} · données du ${meta && meta.updated ? fmtStamp.format(new Date(meta.updated)) : '—'}`
      : (meta && meta.updated ? `Données du ${fmtStamp.format(new Date(meta.updated))}` : '');
    const al = $('alert');
    const bad = meta && meta.errors ? Object.keys(meta.errors) : [];
    if (bad.length && bad.length < LG_ORDER.length) { al.hidden = false; al.textContent = 'Mise à jour incomplète pour : ' + bad.map(c => LG_NAME[c] || c).join(', ') + '. Ces pronostics datent de la dernière mise à jour réussie.'; }
    else if (meta && meta.lastError) { al.hidden = false; al.textContent = 'La dernière actualisation a échoué. Les pronostics affichés datent de la dernière mise à jour réussie.'; }
    else al.hidden = true;

  }

  const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fr(Math.abs(v));
  const brier = (p, i) => p.reduce((s, v, k) => s + (v - (k === i ? 1 : 0)) ** 2, 0);
  function renderBilan(preds, sc) {
    const L = sc && sc.leagues ? sc.leagues : (sc && sc.n ? {FL1: sc} : {});
    const codes = LG_ORDER.filter(c => L[c]);
    if (codes.length) {
      const tot = codes.reduce((a, c) => a + L[c].n, 0);
      const wBM = codes.reduce((a, c) => a + L[c].brierModel * L[c].n, 0) / tot, wBK = codes.reduce((a, c) => a + L[c].brierMarket * L[c].n, 0) / tot;
      const rows = codes.map(c => {
        const x = L[c], d = x.ecartBrier ? x.ecartBrier.diff : x.brierModel - x.brierMarket;
        const ci = x.ecartBrier ? `<br><small class="muted">[${sgn(x.ecartBrier.lo)} ; ${sgn(x.ecartBrier.hi)}]</small>` : '';
        return `<tr><td>${esc(LG_NAME[c] || c)}</td><td>${x.n}${x.nRepli ? `<br><small class="muted">dont ${x.nRepli} en repli</small>` : ''}</td><td>${fr(x.brierModel)}</td><td>${fr(x.brierMarket)}</td><td>${Math.round(x.hitModel * 100)} % / ${Math.round(x.hitMarket * 100)} %</td><td class="${d <= 0 ? 'ok' : 'ko'}">${sgn(d)}${ci}</td></tr>`;
      }).join('');
      $('backtest').innerHTML = `<p style="margin:0 0 4px">Sur ${tot} matchs depuis août 2025, chaque match est prédit avec les seuls résultats antérieurs, puis comparé aux probabilités déduites des cotes moyennes des bookmakers (marge retirée).</p>
        <div class="stats">
          <div class="stat"><b>${fr(wBM)}</b><span>Erreur du modèle (Brier)</span></div>
          <div class="stat"><b>${fr(wBK)}</b><span>Erreur des cotes (Brier)</span></div>
        </div>
        <div class="table"><table><thead><tr><th>Championnat</th><th>Matchs</th><th>Modèle</th><th>Cotes</th><th>Juste (mod. / cotes)</th><th>Écart [IC 95 %]</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p style="margin:10px 0 0">${wBM < wBK ? 'Sur cette période, le modèle est au moins aussi précis que les cotes. À confirmer sur davantage de matchs.' : 'Les cotes des bookmakers sont plus précises que le modèle : ils connaissent les compositions et les blessures, pas lui. Ce site sert à comprendre un match, pas à battre le marché.'} Plus l’erreur est basse, mieux c’est (prédire 1/3 partout donne 0,667). Écart négatif : le modèle fait mieux que les cotes.${sc.total && sc.total.ecartBrier ? ` Sur l’ensemble, l’écart vaut ${sgn(sc.total.ecartBrier.diff)}, avec un intervalle de confiance à 95 % de ${sgn(sc.total.ecartBrier.lo)} à ${sgn(sc.total.ecartBrier.hi)} : ${sc.total.ecartBrier.lo > 0 ? 'les cotes sont significativement plus précises' : sc.total.ecartBrier.hi < 0 ? 'le modèle est significativement plus précis' : 'la différence n’est pas significative'}.` : ''} « En repli » : match d’une équipe sans assez d’historique (souvent un promu), calculé avec la méthode simple. La Ligue des champions est testée à part (pas de cotes disponibles) : voir la page Méthode.</p>`;
    } else $('backtest').textContent = 'Test indisponible pour le moment.';

    const done = preds.filter(p => p.p && ['H', 'D', 'A'].includes(p.res));
    const n = done.length;
    if (!n) {
      $('live').innerHTML = `<p style="margin:0">Aucun pronostic réglé pour l’instant. Les matchs annoncés ci-dessus seront comparés à leur résultat dès la fin du match.</p>`;
      return;
    }
    const idx = r => 'HDA'.indexOf(r);
    const hit = done.filter(p => p.p.indexOf(Math.max(...p.p)) === idx(p.res)).length;
    const b = done.reduce((s, p) => s + brier(p.p, idx(p.res)), 0) / n;
    const bins = [[0, .45, 'moins de 45 %'], [.45, .55, '45 à 55 %'], [.55, .65, '55 à 65 %'], [.65, 1.01, '65 % et plus']];
    const rows = bins.map(([lo, hi, lab]) => {
      const s = done.filter(p => { const t = Math.max(...p.p); return t >= lo && t < hi; });
      if (!s.length) return `<tr><td>${lab}</td><td>0</td><td>—</td><td>—</td></tr>`;
      const avg = s.reduce((a, p) => a + Math.max(...p.p), 0) / s.length;
      const obs = s.filter(p => p.p.indexOf(Math.max(...p.p)) === idx(p.res)).length / s.length;
      return `<tr><td>${lab}</td><td>${s.length}</td><td>${pc(avg)}</td><td>${pc(obs)}</td></tr>`;
    }).join('');
    $('live').innerHTML = `<div class="stats">
        <div class="stat"><b>${n}</b><span>Pronostics réglés</span></div>
        <div class="stat"><b>${hit} / ${n}</b><span>Issue la plus probable juste</span></div>
        <div class="stat"><b>${fr(b)}</b><span>Erreur Brier</span></div></div>
      <div class="table"><table><thead><tr><th>Probabilité annoncée</th><th>Pronostics</th><th>Annoncé</th><th>Réalisé</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p style="margin:10px 0 0">${n < 30 ? `Seulement ${n} pronostic${n > 1 ? 's' : ''} réglé${n > 1 ? 's' : ''} : trop peu pour conclure. Ce bilan devient fiable à partir d’une centaine de matchs.` : 'Quand le modèle annonce 60 %, l’issue doit se réaliser environ 6 fois sur 10.'}</p>`;
  }

  // Navigation par onglets (hash)
  function route() {
    const h = location.hash.slice(1);
    if (h.startsWith('match/')) {
      document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== 'match');
      document.querySelectorAll('nav a').forEach(a => a.getAttribute('data-tab') === 'matchs' ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
      renderMatchPage(decodeURIComponent(h.slice(6)));
      return;
    }
    if (h === 'chat' || h.startsWith('chat/')) {
      document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== 'chat');
      document.querySelectorAll('nav a').forEach(a => a.getAttribute('data-tab') === 'chat' ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
      openChat(h.startsWith('chat/') ? decodeURIComponent(h.slice(5)) : null);
      document.title = 'Chat · PronostiK';
      return;
    }
    const tab = ['matchs', 'resume', 'bilan', 'methode'].includes(h) ? h : 'matchs';
    document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== tab);
    document.querySelectorAll('nav a').forEach(a => a.getAttribute('data-tab') === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    document.title = {matchs: 'PronostiK · Le football en probabilités', resume: 'Résumé · PronostiK', bilan: 'Bilan · PronostiK', methode: 'Méthode · PronostiK'}[tab];
  }
  function renderMatchPage(id) {
    const box = $('matchpage');
    if (!cache) { box.innerHTML = '<p class="muted">Chargement…</p>'; return; }
    const p = cache.preds.find(x => x.id === id);
    if (!p) { box.innerHTML = '<div class="empty"><strong>Ce match n’est plus disponible.</strong><br><a href="#matchs">Voir les matchs à venir</a></div>'; document.title = 'PronostiK'; return; }
    const cur = box.querySelector('button.tab[aria-selected="true"]')?.dataset.tab;
    box.innerHTML = matchPageHTML(p);
    box.querySelectorAll('.season').forEach(applySeason);
    if (cur) box.querySelector(`button.tab[data-tab="${cur}"]`)?.click();
    document.title = `${p.home} – ${p.away} · PronostiK`;
  }
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });

  $('list').addEventListener('click', e => {
    const b = e.target.closest('button.head');
    if (!b) return;
    const d = document.getElementById(b.getAttribute('aria-controls'));
    const open = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', String(!open));
    d.hidden = open;
  });

  // Liste des matchs de la saison : choix de l'équipe et filtre V / N / D
  function applySeason(box) {
    const side = box.dataset.show, f = box.dataset.filter;
    let n = 0;
    box.querySelectorAll('.srow').forEach(r => { const on = r.dataset.side === side && (!f || r.dataset.r === f); r.hidden = !on; if (on) n++; });
    box.querySelector('.sempty').hidden = n > 0;
    box.querySelectorAll('.steam').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.team === side)));
    box.closest('.tabpanel').querySelectorAll('.wdl .pill').forEach(b => b.classList.toggle('on', b.dataset.team === side && b.dataset.f === f));
  }
  $('matchpage').addEventListener('click', e => {
    const s = e.target.closest('button.steam, .wdl button.pill');
    if (s) {
      const box = s.closest('.tabpanel').querySelector('.season');
      if (!box) return;
      const side = s.dataset.team, f = s.dataset.f || '';
      box.dataset.filter = s.classList.contains('pill') ? (box.dataset.show === side && box.dataset.filter === f ? '' : f) : '';
      box.dataset.show = side;
      applySeason(box);
      if (s.classList.contains('pill')) box.scrollIntoView({behavior: 'smooth', block: 'nearest'});
      return;
    }
  });
  $('matchpage').addEventListener('click', e => {
    const b = e.target.closest('button.tab');
    if (!b) return;
    const box = b.closest('.detail');
    box.querySelectorAll('button.tab').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    box.querySelectorAll('.tabpanel').forEach(x => x.hidden = x.dataset.panel !== b.dataset.tab);
  });
  $('mode').addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (!b || !cache || b.dataset.mode === mode) return;
    mode = b.dataset.mode; day = 'first';
    renderMatches(cache.preds, cache.meta);
  });
  $('days').addEventListener('click', e => {
    const b = e.target.closest('button[data-day]');
    if (!b || !cache) return;
    day = b.getAttribute('data-day');
    renderMatches(cache.preds, cache.meta);
  });
  $('chips').addEventListener('click', e => {
    const b = e.target.closest('button[data-lg]');
    if (!b || !cache) return;
    filter = b.getAttribute('data-lg');
    renderMatches(cache.preds, cache.meta);
  });

  // Noms affichés sans ambiguïté (les données gardent les noms des fichiers sources).
  const DISPLAY = {'Milan': 'AC Milan', 'Inter': 'Inter Milan', 'Sp Lisbon': 'Sporting CP', 'Sp Braga': 'SC Braga', 'Guimaraes': 'Vitória Guimarães', 'Maritimo': 'Marítimo', 'Academico Viseu': 'Académico Viseu',
    'For Sittard': 'Fortuna Sittard', 'Den Haag': 'ADO Den Haag', 'Nijmegen': 'NEC Nimègue', 'AZ Alkmaar': 'AZ Alkmaar', 'Zwolle': 'PEC Zwolle'};
  const dn = n => DISPLAY[n] || n;



  // ---------------- Résumé de la journée ----------------
  function renderResume(R) {
    const box = $('resume-body');
    if (!R) { box.innerHTML = '<div class="empty">Le résumé sera disponible après les prochains matchs.</div>'; return; }
    const fd = d => new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'long', timeZone: TZ}).format(new Date(d + 'T12:00:00Z'));
    $('resume-dates').textContent = `Du ${fd(R.du)} au ${fd(R.au)}`;
    const lgDot = c => emb(c, 'lg-mini') || `<i class="lgdot" style="background:${LG_COLOR[c] || 'var(--accent)'}"></i>`;
    const cr = (url, n) => crestImg(url, n);
    const card = (x, kind) => `<a class="rcard ${kind}" href="#match/${encodeURIComponent(x.id)}">
        <div class="rtop">${lgDot(x.lg)}<span class="muted">${esc(fd(x.date))}</span><b class="rbadge">${Math.round((kind === 'sur' ? x.probIssue : x.probFav) * 100)} %</b></div>
        <div class="rmatch"><span>${cr(x.crest && x.crest[0], dn(x.home))}${esc(dn(x.home))}</span><b class="rscore">${esc(x.score || '')}</b><span>${esc(dn(x.away))}${cr(x.crest && x.crest[1], dn(x.away))}</span></div>
        <p class="rnote">${kind === 'sur' ? `${esc(dn(x.issue))} : seulement ${Math.round(x.probIssue * 100)} % pour le modèle${x.mk != null ? `, ${Math.round(x.mk * 100)} % pour les bookmakers` : ''}.` : `${esc(dn(x.fav))} favori à ${Math.round(x.probFav * 100)} % : le pronostic a tenu.`}</p></a>`;
    const team = (x, right) => `<div class="rteam">${lgDot(x.lg)}${cr(x.crest, dn(x.team))}<b>${esc(dn(x.team))}</b>${right}</div>`;
    const b = R.bilan || {n: 0, favorisJustes: 0};
    const sections = [];
    sections.push(`<div class="rkpis">
      <div class="rkpi"><b>${b.n}</b><span>matchs joués</span></div>
      <div class="rkpi"><b>${b.favorisJustes}<i>/${b.n}</i></b><span>favoris du modèle qui ont gagné</span></div>
      <div class="rkpi"><b>${(R.surprises || []).length}</b><span>surprises (moins de 30 %)</span></div></div>`);
    if ((R.surprises || []).length) sections.push(`<h2 class="rh">${ICON.alert} Les surprises</h2><div class="rgrid">${R.surprises.map(x => card(x, 'sur')).join('')}</div>`);
    if ((R.tenus || []).length) sections.push(`<h2 class="rh">${ICON.check} Les favoris qui ont tenu</h2><div class="rgrid">${R.tenus.map(x => card(x, 'ok')).join('')}</div>`);
    if ((R.series || []).length) sections.push(`<h2 class="rh">${ICON.up} Les séries en cours</h2><div class="rlist">${R.series.map(x => team(x, `<span class="rser ${x.type === 'défaites' || x.type === 'sans victoire' ? 'bad' : 'good'}">${x.n} ${esc(x.type)}</span>`)).join('')}</div>`);
    if ((R.montees || []).length || (R.descentes || []).length) sections.push(`<h2 class="rh">${ICON.trophy} Ça bouge au classement</h2><div class="rlist">${(R.montees || []).map(x => team(x, `<span class="rmv up">▲ ${x.delta} · ${x.apres}<sup>e</sup></span>`)).join('')}${(R.descentes || []).map(x => team(x, `<span class="rmv down">▼ ${-x.delta} · ${x.apres}<sup>e</sup></span>`)).join('')}</div>`);
    if ((R.leaders || []).length) sections.push(`<h2 class="rh">${ICON.trophy} Les leaders</h2><div class="rlist">${R.leaders.map(x => team(x, `<span class="rpts">${x.pts} pts</span>`)).join('')}</div>`);
    sections.push('<p class="note">Résumé calculé automatiquement à partir des résultats et des pronostics publiés sur le site. Une journée ne suffit pas à juger un modèle : voir le bilan.</p>');
    box.innerHTML = sections.join('');
  }

  // ---------------- Chat (assistant IA, accès par code) ----------------
  const chat = {url: null, loaded: false, matchId: null, logs: {}, busy: false};
  const getCode = () => { try { return localStorage.getItem('pk-chat-code') || ''; } catch { return chat.mem || ''; } };
  const setCode = c => { chat.mem = c; try { c ? localStorage.setItem('pk-chat-code', c) : localStorage.removeItem('pk-chat-code'); } catch {} };
  async function chatConfig() {
    if (chat.loaded) return chat.url;
    try { const j = await load('chat.json'); chat.url = j && /^https:\/\//.test(j.url) ? j.url.replace(/\/$/, '') : null; } catch { chat.url = null; }
    chat.loaded = true; return chat.url;
  }
  function chatRender() {
    const key = chat.matchId || 'general', log = chat.logs[key] || [];
    $('chat-log').innerHTML = log.length ? log.map(m => `<div class="bubble ${m.role === 'user' ? 'me' : 'ai'}${m.err ? ' err' : ''}">${esc(m.content).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')}</div>`).join('') + (chat.busy ? '<div class="bubble ai typing"><i></i><i></i><i></i></div>' : '')
      : `<div class="chat-hello">${ICON.chat}<p>${chat.matchId ? 'Posez une question sur ce match : le favori, la forme des équipes, les statistiques…' : 'Posez une question sur les matchs à venir.'}</p></div>`;
    const p = chat.matchId && cache ? cache.preds.find(x => x.id === chat.matchId) : null;
    const sugg = p ? [`Pourquoi ${p.home} ou ${p.away} est favori ?`, 'Comment sont les deux équipes en forme ?', 'Le modèle est-il d’accord avec les bookmakers ?', 'Quel score est le plus probable ?']
                   : ['Quels sont les matchs les plus serrés ce week-end ?', 'Quel est le favori le plus net ?', 'Comment lire un pourcentage ?'];
    $('chat-sugg').innerHTML = log.length ? '' : sugg.map(s => `<button type="button" class="sugg">${esc(s)}</button>`).join('');
    const L = $('chat-log'); L.scrollTop = L.scrollHeight;
  }
  async function openChat(matchId) {
    chat.matchId = matchId;
    const p = matchId && cache ? cache.preds.find(x => x.id === matchId) : null;
    $('chat-ctx').innerHTML = p ? `À propos de <b>${esc(p.home)} – ${esc(p.away)}</b> · <a href="#chat">tous les matchs</a>` : 'Questions sur les matchs du site';
    const url = await chatConfig();
    $('chat-off').hidden = !!url; $('chat-gate').hidden = !url || !!getCode(); $('chat-box').hidden = !url || !getCode();
    if (url && getCode()) chatRender();
  }
  async function chatSend(text) {
    if (chat.busy || !text.trim()) return;
    const key = chat.matchId || 'general', log = chat.logs[key] || (chat.logs[key] = []);
    log.push({role: 'user', content: text.trim().slice(0, 600)}); chat.busy = true; chatRender();
    try {
      const r = await fetch(chat.url + '/chat', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({code: getCode(), matchId: chat.matchId, messages: log.filter(m => !m.err).slice(-8).map(m => ({role: m.role, content: m.content}))})});
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { setCode(''); log.pop(); chat.busy = false; $('chat-box').hidden = true; $('chat-gate').hidden = false; $('chat-gate-err').hidden = false; $('chat-gate-err').textContent = j.error || 'Code d’accès incorrect.'; return; }
      log.push(r.ok ? {role: 'assistant', content: j.reply} : {role: 'assistant', content: j.error || 'Le service est momentanément indisponible.', err: true});
    } catch { log.push({role: 'assistant', content: 'Connexion impossible. Réessayez dans un instant.', err: true}); }
    chat.busy = false; chatRender();
  }
  $('chat-code-form').addEventListener('submit', e => { e.preventDefault(); const v = $('chat-code').value.trim(); if (!v) return; setCode(v); $('chat-code').value = ''; $('chat-gate-err').hidden = true; openChat(chat.matchId); });
  $('chat-form').addEventListener('submit', e => { e.preventDefault(); const v = $('chat-in').value; $('chat-in').value = ''; chatSend(v); });
  $('chat-sugg').addEventListener('click', e => { const b = e.target.closest('button.sugg'); if (b) chatSend(b.textContent); });

  // Bouton « Installer l'application » : seulement sur Android, et pas déjà dans l'application.
  (function () {
    const ua = navigator.userAgent || '', inApp = document.referrer.startsWith('android-app://') || window.matchMedia('(display-mode: standalone)').matches;
    if (/Android/i.test(ua) && !inApp) $('get-app').hidden = false;
    $('get-app').addEventListener('click', e => { if (e.target.closest('.get-how')) { e.preventDefault(); $('get-help').hidden = !$('get-help').hidden; } });
  })();

  // Nouvelle version du site publiée ? On recharge une fois (utile pour l'application installée sur l'écran d'accueil).
  async function checkVersion() {
    const cur = document.querySelector('meta[name="build"]')?.content;
    if (!cur || cur === 'dev') return;
    try {
      const r = await fetch('version.json?t=' + Date.now(), {cache: 'no-store'});
      if (!r.ok) return;
      const {v} = await r.json();
      if (v && v !== cur) {
        let last = null; try { last = sessionStorage.getItem('pk-reload'); } catch {}
        if (last === v) return;                         // évite une boucle si le cache résiste
        try { sessionStorage.setItem('pk-reload', v); } catch {}
        location.reload();
      }
    } catch {}
  }

  async function refresh() {
    try {
      const [raw, meta, sc, stand, resume] = await Promise.all([load('predictions.json'), load('meta.json').catch(() => null), load('scorecard.json').catch(() => null), load('standings.json').catch(() => null), load('resume.json').catch(() => null)]);
      const compos = await load('compos.json').catch(() => null);
      const preds = raw.map(p => ({...p, rawHome: p.home, rawAway: p.away, home: dn(p.home), away: dn(p.away), form: p.form ? {h: (p.form.h || []).map(m => ({...m, o: dn(m.o)})), a: (p.form.a || []).map(m => ({...m, o: dn(m.o)}))} : p.form,
        stats: p.stats ? {...p.stats, h2h: (p.stats.h2h || []).map(m => ({...m, h: dn(m.h), a: dn(m.a)})), dom: p.stats.dom && {...p.stats.dom, matchs: (p.stats.dom.matchs || []).map(m => ({...m, o: dn(m.o)}))}, ext: p.stats.ext && {...p.stats.ext, matchs: (p.stats.ext.matchs || []).map(m => ({...m, o: dn(m.o)}))}} : p.stats}));
      const openIds = [...document.querySelectorAll('button.head[aria-expanded="true"]')].map(b => b.getAttribute('aria-controls'));
      // Blason manquant (pronostic enregistré avant l'ajout des blasons) : on le reprend du classement.
      const crestOf = (lg, t) => (stand && stand[lg] && stand[lg].rows || []).find(r => r.t === t)?.crest || null;
      for (const p of preds) { const c = p.crest || [null, null]; if (!c[0] || !c[1]) p.crest = [c[0] || crestOf(p.lg, p.rawHome), c[1] || crestOf(p.lg, p.rawAway)]; }
      if (resume) for (const k of ['surprises', 'tenus']) for (const x of resume[k] || []) { const c = x.crest || [null, null]; x.crest = [c[0] || crestOf(x.lg, x.home), c[1] || crestOf(x.lg, x.away)]; }
      const byName = {};
      for (const [k, v] of Object.entries(compos || {})) { const n = k.slice(k.indexOf('|') + 1); if (!byName[n] || byName[n].d < v.d) byName[n] = v; }
      cache = {preds, meta, sc, stand, resume, compos: compos || {}, composByName: byName};
      renderResume(resume);
      renderMatches(preds, meta);
      renderBilan(preds, sc);
      if (location.hash.startsWith('#match/')) renderMatchPage(decodeURIComponent(location.hash.slice(7)));
      openIds.forEach(id => { const d = document.getElementById(id); if (d) { d.hidden = false; d.previousElementSibling.setAttribute('aria-expanded', 'true'); } });
    } catch (e) {
      $('freshness').textContent = '';
      $('list').innerHTML = '<div class="empty"><strong>Les données ne sont pas disponibles pour le moment.</strong><br>Réessaie dans quelques minutes.</div>';
      console.error(e);
    }
  }
  route();
  refresh();
  setInterval(refresh, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkVersion(); refresh(); } });
  checkVersion();
})();
