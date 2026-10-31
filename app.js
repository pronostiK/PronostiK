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

  const LG_NAME = {FL1: 'Ligue 1', PL: 'Premier League', BL1: 'Bundesliga', SA: 'Serie A', PD: 'La Liga'};
  let LG_ORDER = ['FL1', 'PL', 'BL1', 'SA', 'PD'];
  let filter = 'all';
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

  function cardHTML(p) {
    const time = fmtTime.format(new Date(p.kickoff)) + ' · ' + (LG_NAME[p.lg] || p.lg || '');
    const chip = p.rel === 'limited' ? '<span class="chip warn">Échantillon réduit</span>' : '';
    const head = `<div class="meta"><span>${time}</span>${chip}</div><div class="teams">${esc(p.home)} <span>contre</span> ${esc(p.away)}</div>`;
    if (!p.p) {
      return `<article class="card"><div class="head" style="cursor:default">${head}<p class="muted" style="margin:0;font-size:13px">${/non reconnue/.test(p.err || '') ? 'Pronostic indisponible : une des équipes n’est pas encore reconnue.' : 'Pronostic indisponible : pas assez de matchs récents pour une de ces équipes.'}</p></div></article>`;
    }
    const pcts = pct3(p.p), top = p.p.indexOf(Math.max(...p.p));
    const labels = [p.home, 'Nul', p.away], tags = ['1', 'N', '2'];
    const cells = pcts.map((v, i) => `<div class="cell ${i === top ? 'best' : ''}"><div class="v">${v} %</div><div class="k" title="${esc(labels[i])}"><b>${tags[i]}</b> ${esc(labels[i])}</div></div>`).join('');
    const seg = `<div class="seg" aria-hidden="true">${pcts.map((v, i) => `<span class="s${i}${i === top ? ' lead' : ''}" style="width:${v}%"></span>`).join('')}</div>`;
    const read = pcts[top] >= 60 ? ['Favori net', 'ok'] : pcts[top] < 45 ? ['Match ouvert', ''] : ['Léger favori', ''];
    const who = top === 1 ? 'un match nul' : 'une victoire de ' + (top === 0 ? p.home : p.away);
    const sum = `<p class="read"><span class="tag ${read[1]}">${read[0]}</span> ${pcts[top]} % pour ${esc(who)}</p>`;
    const dc = [['1N', p.p[0] + p.p[1], `${p.home} ou nul`], ['12', p.p[0] + p.p[2], 'Pas de nul'], ['N2', p.p[1] + p.p[2], `${p.away} ou nul`]]
      .map(([k, v, s]) => `<div><small>${k} · ${esc(s)}</small><strong>${pc(v)}</strong></div>`).join('');
    const form = (name, arr) => {
      const rows = (arr || []).map(m => {
        const r = m.f > m.a ? 'V' : m.f === m.a ? 'N' : 'D';
        return `<div class="form-row"><span class="dot ${r}" title="${r === 'V' ? 'Victoire' : r === 'N' ? 'Nul' : 'Défaite'}">${r}</span><span>${m.v === 'D' ? 'contre' : 'à'} ${esc(m.o)} ${m.f}–${m.a}</span></div>`;
      }).join('') || '<div class="form-row">Pas de données</div>';
      return `<div class="form-list"><p>${esc(name)}</p>${rows}</div>`;
    };
    return `<article class="card">
      <button class="head" type="button" aria-expanded="false" aria-controls="d-${esc(p.id)}">${head}${sum}${seg}<div class="probs">${cells}</div><span class="more">Détails ▾</span></button>
      <div class="detail" id="d-${esc(p.id)}" hidden>
        <h3>Double chance</h3><div class="kv">${dc}</div>
        <h3>Buts attendus</h3><div class="kv"><div><small>${esc(p.home)}</small><strong>${fr(p.lam[0], 1)}</strong></div><div><small>${esc(p.away)}</small><strong>${fr(p.lam[1], 1)}</strong></div><div><small>Score le plus probable</small><strong>${esc(p.score)}</strong></div></div>
        <h3>Cinq derniers matchs</h3><div class="forms">${form(p.home, p.form && p.form.h)}${form(p.away, p.form && p.form.a)}</div>
        <p class="note">Estimation statistique : le modèle ignore compositions et blessures. Un résultat à ${pcts[top]} % échoue encore ${100 - pcts[top]} fois sur 100.</p>
      </div></article>`;
  }

  function renderMatches(preds, meta) {
    const now = Date.now();
    if (meta && meta.leagues) { meta.leagues.forEach(l => LG_NAME[l.code] = l.name); LG_ORDER = meta.leagues.map(l => l.code); }
    const all = preds.filter(p => !p.res && new Date(p.kickoff).getTime() > now - 3 * 3600e3);
    const counts = {}; all.forEach(p => counts[p.lg] = (counts[p.lg] || 0) + 1);
    $('chips').innerHTML = [['all', 'Tous', all.length]].concat(LG_ORDER.map(c => [c, LG_NAME[c] || c, counts[c] || 0])).map(([c, n, k]) =>
      `<button type="button" class="chip-btn" data-lg="${c}" aria-pressed="${filter === c}">${esc(n)} <i>${k}</i></button>`).join('');
    const up = all.filter(p => filter === 'all' || p.lg === filter).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    const list = $('list');
    if (!up.length) {
      list.innerHTML = '<div class="empty"><strong>Aucun match annoncé' + (filter === 'all' ? '' : ' dans ce championnat') + ' pour le moment.</strong><br>Les matchs des 7 prochains jours s’affichent ici dès la publication du calendrier.</div>';
    } else {
      let html = '', cur = '';
      for (const p of up) {
        const k = dayKey(new Date(p.kickoff));
        if (k !== cur) { cur = k; html += `<h2 class="day">${esc(fmtDay.format(new Date(p.kickoff)))}</h2>`; }
        html += cardHTML(p);
      }
      list.innerHTML = html;
    }
    $('freshness').textContent = up.length
      ? `${up.length} match${up.length > 1 ? 's' : ''} à venir · données du ${meta && meta.updated ? fmtStamp.format(new Date(meta.updated)) : '—'}`
      : (meta && meta.updated ? `Données du ${fmtStamp.format(new Date(meta.updated))}` : '');
    const al = $('alert');
    const bad = meta && meta.errors ? Object.keys(meta.errors) : [];
    if (bad.length && bad.length < LG_ORDER.length) { al.hidden = false; al.textContent = 'Mise à jour incomplète pour : ' + bad.map(c => LG_NAME[c] || c).join(', ') + '. Ces pronostics datent de la dernière mise à jour réussie.'; }
    else if (meta && meta.lastError) { al.hidden = false; al.textContent = 'La dernière actualisation a échoué. Les pronostics affichés datent de la dernière mise à jour réussie.'; }
    else al.hidden = true;

    const done = preds.filter(p => p.p && (filter === 'all' || p.lg === filter) && (p.res === 'H' || p.res === 'D' || p.res === 'A')).sort((a, b) => b.kickoff.localeCompare(a.kickoff)).slice(0, 8);
    $('recent-title').hidden = !done.length;
    $('recent').innerHTML = done.map(p => {
      const t = p.p.indexOf(Math.max(...p.p)), ok = 'HDA'[t] === p.res, lab = ['1', 'N', '2'][t];
      return `<div class="rrow"><span>${esc(p.home)} – ${esc(p.away)}</span><span class="sc">${esc(p.final || '')}</span><span class="res ${ok ? 'ok' : 'ko'}">Annoncé : ${lab} (${pc(p.p[t])}) ${ok ? '✓' : '✗'}</span></div>`;
    }).join('');
  }

  const brier = (p, i) => p.reduce((s, v, k) => s + (v - (k === i ? 1 : 0)) ** 2, 0);
  function renderBilan(preds, sc) {
    const L = sc && sc.leagues ? sc.leagues : (sc && sc.n ? {FL1: sc} : {});
    const codes = LG_ORDER.filter(c => L[c]);
    if (codes.length) {
      const tot = codes.reduce((a, c) => a + L[c].n, 0);
      const wBM = codes.reduce((a, c) => a + L[c].brierModel * L[c].n, 0) / tot, wBK = codes.reduce((a, c) => a + L[c].brierMarket * L[c].n, 0) / tot;
      const rows = codes.map(c => {
        const x = L[c], d = x.brierModel - x.brierMarket;
        return `<tr><td>${esc(LG_NAME[c] || c)}</td><td>${x.n}</td><td>${fr(x.brierModel)}</td><td>${fr(x.brierMarket)}</td><td>${Math.round(x.hitModel * 100)} % / ${Math.round(x.hitMarket * 100)} %</td><td class="${d <= 0 ? 'ok' : 'ko'}">${d <= 0 ? '' : '+'}${fr(d)}</td></tr>`;
      }).join('');
      $('backtest').innerHTML = `<p style="margin:0 0 4px">Sur ${tot} matchs depuis août 2025, chaque match est prédit avec les seuls résultats antérieurs, puis comparé aux probabilités déduites des cotes moyennes des bookmakers (marge retirée).</p>
        <div class="stats">
          <div class="stat"><b>${fr(wBM)}</b><span>Erreur du modèle (Brier)</span></div>
          <div class="stat"><b>${fr(wBK)}</b><span>Erreur des cotes (Brier)</span></div>
        </div>
        <div class="table"><table><thead><tr><th>Championnat</th><th>Matchs</th><th>Modèle</th><th>Cotes</th><th>Juste (mod. / cotes)</th><th>Écart</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p style="margin:10px 0 0">${wBM < wBK ? 'Sur cette période, le modèle est au moins aussi précis que les cotes. À confirmer sur davantage de matchs.' : 'Les cotes des bookmakers sont plus précises que le modèle : ils connaissent les compositions et les blessures, pas lui. Ce site sert à comprendre un match, pas à battre le marché.'} Plus l’erreur est basse, mieux c’est (prédire 1/3 partout donne 0,667). Écart négatif : le modèle fait mieux que les cotes.</p>`;
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
    const tab = ['matchs', 'bilan', 'methode'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'matchs';
    document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== tab);
    document.querySelectorAll('nav a').forEach(a => a.getAttribute('data-tab') === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    document.title = {matchs: 'PronostiK · Le football en probabilités', bilan: 'Bilan · PronostiK', methode: 'Méthode · PronostiK'}[tab];
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

  $('chips').addEventListener('click', e => {
    const b = e.target.closest('button[data-lg]');
    if (!b || !cache) return;
    filter = b.getAttribute('data-lg');
    renderMatches(cache.preds, cache.meta);
  });

  async function refresh() {
    try {
      const [preds, meta, sc] = await Promise.all([load('predictions.json'), load('meta.json').catch(() => null), load('scorecard.json').catch(() => null)]);
      const openIds = [...document.querySelectorAll('button.head[aria-expanded="true"]')].map(b => b.getAttribute('aria-controls'));
      cache = {preds, meta, sc};
      renderMatches(preds, meta);
      renderBilan(preds, sc);
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
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
