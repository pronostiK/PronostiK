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
  let day = 'first';
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

  const LG_COLOR = {FL1: '#3b82f6', PL: '#a855f7', BL1: '#ef4444', SA: '#22c55e', PD: '#f59e0b'};
  const initials = n => String(n).replace(/\b(FC|AFC|CF|SC|AC|AS|US|SS|RC|CD|UD|SV|VfB|VfL|1\.)\b/gi, '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const hue = n => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const mono = n => `<span class="mono" style="background:linear-gradient(145deg,hsl(${hue(n)} 62% 48%),hsl(${(hue(n) + 40) % 360} 62% 34%))" aria-hidden="true">${esc(initials(n))}</span>`;
  const crestImg = (url, n) => url && /^https:\/\//.test(url) ? `<img class="crest" src="${esc(url)}" alt="" loading="lazy" data-n="${esc(n)}">` : mono(n);
  document.addEventListener('error', e => {
    const t = e.target;
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
      <div class="meta"><span class="lgname"><i style="background:${lgc}"></i>${esc(LG_NAME[p.lg] || p.lg || '')}</span><span class="ptime">${esc(fmtTime.format(new Date(p.kickoff)))}</span></div>
      <div class="match">${side(p.home, cr[0], topI === 0)}<div class="mid"><small>VS</small></div>${side(p.away, cr[1], topI === 2)}</div>${foot}</a>`;
  }

  function matchPageHTML(p) {
    const lgc = LG_COLOR[p.lg] || 'var(--accent)';
    const time = (LG_NAME[p.lg] || p.lg || '') + ' · ' + fmtDay.format(new Date(p.kickoff));
    const chip = p.rel === 'limited' ? '<span class="chip warn">Échantillon réduit</span>' : '';
    const topI = p.p ? p.p.indexOf(Math.max(...p.p)) : -1;
    const cr = p.crest || [], st = p.stats || null;
    const rk = r => r ? `<small class="rank">${r}${r === 1 ? 'er' : 'e'} au classement</small>` : '';
    const side = (name, url, fav, r) => `<div class="side${fav ? ' fav' : ''}">${crestImg(url, name)}<span class="nm">${esc(name)}</span>${rk(r)}</div>`;
    const head = `<div class="meta"><span class="lgname"><i style="background:${lgc}"></i>${esc(time)}</span>${chip}</div>
      <div class="match big">${side(p.home, cr[0], topI === 0, st && st.dom.rang)}<div class="mid"><strong>${esc(fmtTime.format(new Date(p.kickoff)))}</strong><small>VS</small></div>${side(p.away, cr[1], topI === 2, st && st.ext.rang)}</div>`;
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

    // --- Onglet Analyse : lecture du match générée à partir des chiffres (aucune information inventée)
    const fav = top === 0 ? p.home : top === 2 ? p.away : null;
    const recap = arr => { const r = (arr || []).map(m => m.f > m.a ? 'V' : m.f === m.a ? 'N' : 'D'); return r.length ? `${r.filter(x => x === 'V').length} victoire${r.filter(x => x === 'V').length > 1 ? 's' : ''}, ${r.filter(x => x === 'N').length} nul${r.filter(x => x === 'N').length > 1 ? 's' : ''} et ${r.filter(x => x === 'D').length} défaite${r.filter(x => x === 'D').length > 1 ? 's' : ''} sur les ${r.length} derniers matchs` : null; };
    const txt = [];
    txt.push(fav ? `${esc(fav)} est ${pcts[top] >= 60 ? 'nettement favori' : pcts[top] >= 45 ? 'légèrement favori' : 'à peine favori'} avec ${pcts[top]} % de chances de victoire, contre ${pcts[top === 0 ? 2 : 0]} % pour ${esc(top === 0 ? p.away : p.home)} et ${pcts[1]} % pour le match nul.` : `Le match nul est l’issue la plus probable (${pcts[1]} %), devant ${esc(p.home)} (${pcts[0]} %) et ${esc(p.away)} (${pcts[2]} %).`);
    txt.push(`Le modèle attend ${fr(p.lam[0], 1)} but${p.lam[0] >= 1.5 ? 's' : ''} pour ${esc(p.home)} et ${fr(p.lam[1], 1)} pour ${esc(p.away)} ; le score le plus probable est ${esc(p.score)}.`);
    if (st && st.dom.rang && st.ext.rang) txt.push(`Au classement, ${esc(p.home)} est ${st.dom.rang}${st.dom.rang === 1 ? 'er' : 'e'} (${st.dom.pts} pts) et ${esc(p.away)} ${st.ext.rang}${st.ext.rang === 1 ? 'er' : 'e'} (${st.ext.pts} pts).`);
    const fh = recap(p.form && p.form.h), fa = recap(p.form && p.form.a);
    if (fh && fa) txt.push(`Forme : ${esc(p.home)} compte ${fh} ; ${esc(p.away)} compte ${fa}.`);
    if (mkp) { const d = Math.max(...[0, 1, 2].map(k => Math.abs(pcts[k] - mkp[k]))); txt.push(d <= 5 ? 'Les bookmakers voient le match de la même façon (écart de 5 points au plus).' : `Les bookmakers voient le match différemment (jusqu’à ${d} points d’écart) : en cas de désaccord, ils ont souvent une information que le modèle n’a pas, comme une blessure ou une composition.`); }
    txt.push('Le modèle ne connaît ni les compositions ni les blessures : un favori peut perdre.');
    const dc = [['1N', p.p[0] + p.p[1], `${p.home} ou nul`], ['12', p.p[0] + p.p[2], 'Pas de nul'], ['N2', p.p[1] + p.p[2], `${p.away} ou nul`]]
      .map(([k, v, s2]) => `<div><small>${k} · ${esc(s2)}</small><strong>${pc(v)}</strong></div>`).join('');
    const analyse = `<p class="lecture">${txt.join(' ')}</p>
      <h3>Double chance</h3><div class="kv">${dc}</div>
      ${mkp ? `<h3>Modèle et bookmakers</h3><div class="kv">${[['1 · ' + p.home, 0], ['N · Nul', 1], ['2 · ' + p.away, 2]].map(([l, k]) => { const d = pcts[k] - mkp[k]; return `<div><small>${esc(l)}</small><strong>${pcts[k]} %</strong><small>bookmakers ${mkp[k]} % · ${d === 0 ? 'identique' : (d > 0 ? '+' : '−') + Math.abs(d) + ' pt'}</small></div>`; }).join('')}</div>` : ''}
      <h3>Cote équivalente</h3><div class="kv">${[['1 · ' + p.home, p.p[0]], ['N · Nul', p.p[1]], ['2 · ' + p.away, p.p[2]]].map(([l, v]) => `<div><small>${esc(l)}</small><strong>${fr(1 / v, 2)}</strong></div>`).join('')}</div>
      <p class="note" style="margin-top:8px">Cote qui correspond exactement à la probabilité annoncée, sans marge. Information statistique, pas un conseil de pari.</p>
      <h3>Buts attendus</h3><div class="kv"><div><small>${esc(p.home)}</small><strong>${fr(p.lam[0], 1)}</strong></div><div><small>${esc(p.away)}</small><strong>${fr(p.lam[1], 1)}</strong></div><div><small>Score le plus probable</small><strong>${esc(p.score)}</strong></div></div>`;

    // --- Onglet Statistiques : saison en cours, matchs déjà joués
    let stats = '<p class="muted">Statistiques indisponibles pour ce match.</p>';
    if (st && st.dom.tout.p && st.ext.tout.p) {
      const H = st.dom, A = st.ext, per = (x, n) => n ? Math.round(100 * x / n) : 0, avg = (x, n) => n ? fr(x / n, 1) : '—';
      const line = (lab, a, b, better) => { const na = parseFloat(String(a).replace(',', '.')), nb = parseFloat(String(b).replace(',', '.')); const wa = better === 'high' ? na > nb : better === 'low' ? na < nb : false, wb = better === 'high' ? nb > na : better === 'low' ? nb < na : false; return `<div class="cmp"><b class="${wa ? 'win' : ''}">${a}</b><span>${lab}</span><b class="${wb ? 'win' : ''}">${b}</b></div>`; };
      stats = `<div class="cmp-head"><span>${esc(p.home)}</span><span></span><span>${esc(p.away)}</span></div>
        ${line('Classement', H.rang ? H.rang + (H.rang === 1 ? 'er' : 'e') : '—', A.rang ? A.rang + (A.rang === 1 ? 'er' : 'e') : '—', '')}
        ${line('Points', H.pts, A.pts, 'high')}
        ${line('Matchs joués', H.tout.p, A.tout.p, '')}
        ${line('Victoires / nuls / défaites', `${H.tout.w}-${H.tout.d}-${H.tout.l}`, `${A.tout.w}-${A.tout.d}-${A.tout.l}`, '')}
        ${line('Buts marqués par match', avg(H.tout.gf, H.tout.p), avg(A.tout.gf, A.tout.p), 'high')}
        ${line('Buts encaissés par match', avg(H.tout.ga, H.tout.p), avg(A.tout.ga, A.tout.p), 'low')}
        ${line('Matchs sans encaisser', per(H.tout.cs, H.tout.p) + ' %', per(A.tout.cs, A.tout.p) + ' %', 'high')}
        ${line('Les deux équipes marquent', per(H.tout.btts, H.tout.p) + ' %', per(A.tout.btts, A.tout.p) + ' %', '')}
        ${line('Plus de 2,5 buts', per(H.tout.o25, H.tout.p) + ' %', per(A.tout.o25, A.tout.p) + ' %', '')}
        ${H.tout.nc && A.tout.nc ? `<h3>Corners</h3>
        ${line('Corners obtenus par match', avg(H.tout.cf, H.tout.nc), avg(A.tout.cf, A.tout.nc), 'high')}
        ${line('Corners concédés par match', avg(H.tout.ca, H.tout.nc), avg(A.tout.ca, A.tout.nc), 'low')}` : ''}
        ${H.tout.nk && A.tout.nk ? `<h3>Cartons</h3>
        ${line('Cartons jaunes par match', avg(H.tout.yc, H.tout.nk), avg(A.tout.yc, A.tout.nk), 'low')}
        ${line('Cartons rouges (saison)', H.tout.rc, A.tout.rc, 'low')}` : ''}
        ${H.tout.nh && A.tout.nh ? `<h3>Mi-temps</h3>
        ${line('Buts marqués en 1re mi-temps', avg(H.tout.h1f, H.tout.nh), avg(A.tout.h1f, A.tout.nh), 'high')}
        ${line('Buts marqués en 2e mi-temps', avg(H.tout.h2f, H.tout.nh), avg(A.tout.h2f, A.tout.nh), 'high')}
        ${line('Buts encaissés en 1re mi-temps', avg(H.tout.h1a, H.tout.nh), avg(A.tout.h1a, A.tout.nh), 'low')}
        ${line('Buts encaissés en 2e mi-temps', avg(H.tout.h2a, H.tout.nh), avg(A.tout.h2a, A.tout.nh), 'low')}` : ''}
        <h3>À domicile pour ${esc(p.home)}, à l’extérieur pour ${esc(p.away)}</h3>
        ${line('Matchs', H.lieu.p, A.lieu.p, '')}
        ${line('Victoires / nuls / défaites', `${H.lieu.w}-${H.lieu.d}-${H.lieu.l}`, `${A.lieu.w}-${A.lieu.d}-${A.lieu.l}`, '')}
        ${line('Buts marqués par match', avg(H.lieu.gf, H.lieu.p), avg(A.lieu.gf, A.lieu.p), 'high')}
        ${line('Buts encaissés par match', avg(H.lieu.ga, H.lieu.p), avg(A.lieu.ga, A.lieu.p), 'low')}
        <p class="note">Saison en cours, championnat uniquement. Moyennes et pourcentages observés sur les matchs déjà joués (ce ne sont pas des prédictions). Corners, cartons et mi-temps : sur les matchs dont le détail est disponible (mis à jour chaque semaine).</p>`;
    }

    // --- Onglet Forme : cinq derniers matchs
    const form = (name, arr) => {
      const rows = (arr || []).map(m => {
        const r = m.f > m.a ? 'V' : m.f === m.a ? 'N' : 'D';
        return `<div class="form-row"><span class="dot ${r}" title="${r === 'V' ? 'Victoire' : r === 'N' ? 'Nul' : 'Défaite'}">${r}</span><span>${m.v === 'D' ? 'contre' : 'à'} ${esc(m.o)} ${m.f}–${m.a}</span></div>`;
      }).join('') || '<div class="form-row">Pas de données</div>';
      return `<div class="form-list"><p>${esc(name)}</p>${rows}</div>`;
    };
    const forme = `<div class="forms">${form(p.home, p.form && p.form.h)}${form(p.away, p.form && p.form.a)}</div>`;

    // --- Onglet Face-à-face
    const h2h = st && st.h2h && st.h2h.length ? `<div class="h2h">${st.h2h.map(m => `<div class="rrow"><span>${esc(fmtDay.format(new Date(m.d + 'T12:00:00Z')))}</span><span>${esc(m.h)} <b class="sc">${m.hg}–${m.ag}</b> ${esc(m.a)}</span></div>`).join('')}</div><p class="note">Dernières confrontations en championnat disponibles dans nos données (depuis 2023).</p>` : '<p class="muted">Aucune confrontation récente dans nos données (depuis 2023).</p>';

    const tabs = [['analyse', 'Analyse', analyse], ['stats', 'Statistiques', stats], ['forme', 'Forme', forme], ['h2h', 'Face-à-face', h2h]];
    return `<article class="mpage card" style="--lg:${lgc}">
      <div class="head" style="cursor:default">${head}${sum}${seg}<div class="probs">${cells}</div>${mkline}</div>
      <div class="detail">
        <div class="tabs" role="tablist">${tabs.map(([k, l], i) => `<button type="button" role="tab" class="tab" data-tab="${k}" aria-selected="${i === 0}">${l}</button>`).join('')}</div>
        ${tabs.map(([k, , html], i) => `<div class="tabpanel" data-panel="${k}" role="tabpanel"${i ? ' hidden' : ''}>${html}</div>`).join('')}
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
    const lgAll = all.filter(p => filter === 'all' || p.lg === filter).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    const dayOf = p => dayKey(new Date(p.kickoff));
    const dayList = [...new Set(lgAll.map(dayOf))];
    if (day === 'first' || (day !== 'all' && !dayList.includes(day))) day = dayList[0] || 'all';
    const fmtWd = new Intl.DateTimeFormat('fr-FR', {weekday: 'short', timeZone: TZ}), fmtNum = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', timeZone: TZ});
    const today = dayKey(new Date());
    $('days').innerHTML = dayList.length > 1 ? [`<button type="button" class="day-btn" data-day="all" aria-pressed="${day === 'all'}"><span>7 jours</span><b>${lgAll.length}</b><i>matchs</i></button>`].concat(dayList.map(k => {
      const d = new Date(lgAll.find(p => dayOf(p) === k).kickoff), n = lgAll.filter(p => dayOf(p) === k).length;
      return `<button type="button" class="day-btn" data-day="${k}" aria-pressed="${day === k}"><span>${k === today ? 'Auj.' : esc(fmtWd.format(d))}</span><b>${esc(fmtNum.format(d))}</b><i>${n} match${n > 1 ? 's' : ''}</i></button>`;
    })).join('') : '';
    const up = day === 'all' ? lgAll : lgAll.filter(p => dayOf(p) === day);
    // « À retenir » : le favori le plus net et le match le plus serré parmi ceux affichés.
    const ranked = up.filter(p => p.p), spot = $('spot');
    if (ranked.length >= 3) {
      const top = p => Math.max(...p.p), sure = ranked.reduce((a, b) => top(b) > top(a) ? b : a), open = ranked.reduce((a, b) => top(b) < top(a) ? b : a);
      const who = p => { const i = p.p.indexOf(top(p)); return (i === 1 ? 'Match nul' : i === 0 ? p.home : p.away) + ' · ' + Math.round(top(p) * 100) + ' %'; };
      const tile = (lab, p) => `<a class="spot-tile" href="#match/${encodeURIComponent(p.id)}"><small>${lab}</small><strong>${esc(p.home)} – ${esc(p.away)}</strong><span>${esc(who(p))}</span></a>`;
      spot.innerHTML = `<h2 class="section-title" style="margin-top:6px">À retenir</h2><div class="spot-row">${tile('Favori le plus net', sure)}${sure === open ? '' : tile('Match le plus serré', open)}</div>`;
      spot.hidden = false;
    } else { spot.innerHTML = ''; spot.hidden = true; }
    const list = $('list');
    if (!up.length) {
      list.innerHTML = '<div class="empty"><strong>Aucun match annoncé' + (filter === 'all' ? '' : ' dans ce championnat') + ' pour le moment.</strong><br>Les matchs des 7 prochains jours s’affichent ici dès la publication du calendrier.</div>';
    } else {
      let html = '', cur = '';
      for (const p of up) {
        const k = dayKey(new Date(p.kickoff));
        if (k !== cur) { html += (cur ? '</div>' : '') + `<h2 class="day">${esc(fmtDay.format(new Date(p.kickoff)))}</h2><div class="posters">`; cur = k; }
        html += posterHTML(p);
      }
      list.innerHTML = html + (cur ? '</div>' : '');
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
        <p style="margin:10px 0 0">${wBM < wBK ? 'Sur cette période, le modèle est au moins aussi précis que les cotes. À confirmer sur davantage de matchs.' : 'Les cotes des bookmakers sont plus précises que le modèle : ils connaissent les compositions et les blessures, pas lui. Ce site sert à comprendre un match, pas à battre le marché.'} Plus l’erreur est basse, mieux c’est (prédire 1/3 partout donne 0,667). Écart négatif : le modèle fait mieux que les cotes.${sc.total && sc.total.ecartBrier ? ` Sur l’ensemble, l’écart vaut ${sgn(sc.total.ecartBrier.diff)}, avec un intervalle de confiance à 95 % de ${sgn(sc.total.ecartBrier.lo)} à ${sgn(sc.total.ecartBrier.hi)} : ${sc.total.ecartBrier.lo > 0 ? 'les cotes sont significativement plus précises' : sc.total.ecartBrier.hi < 0 ? 'le modèle est significativement plus précis' : 'la différence n’est pas significative'}.` : ''} « En repli » : match d’une équipe sans assez d’historique (souvent un promu), calculé avec la méthode simple.</p>`;
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
    const tab = ['matchs', 'bilan', 'methode'].includes(h) ? h : 'matchs';
    document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== tab);
    document.querySelectorAll('nav a').forEach(a => a.getAttribute('data-tab') === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    document.title = {matchs: 'PronostiK · Le football en probabilités', bilan: 'Bilan · PronostiK', methode: 'Méthode · PronostiK'}[tab];
  }
  function renderMatchPage(id) {
    const box = $('matchpage');
    if (!cache) { box.innerHTML = '<p class="muted">Chargement…</p>'; return; }
    const p = cache.preds.find(x => x.id === id);
    if (!p) { box.innerHTML = '<div class="empty"><strong>Ce match n’est plus disponible.</strong><br><a href="#matchs">Voir les matchs à venir</a></div>'; document.title = 'PronostiK'; return; }
    const cur = box.querySelector('button.tab[aria-selected="true"]')?.dataset.tab;
    box.innerHTML = matchPageHTML(p);
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

  $('matchpage').addEventListener('click', e => {
    const b = e.target.closest('button.tab');
    if (!b) return;
    const box = b.closest('.detail');
    box.querySelectorAll('button.tab').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    box.querySelectorAll('.tabpanel').forEach(x => x.hidden = x.dataset.panel !== b.dataset.tab);
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
  const DISPLAY = {'Milan': 'AC Milan', 'Inter': 'Inter Milan'};
  const dn = n => DISPLAY[n] || n;

  async function refresh() {
    try {
      const [raw, meta, sc] = await Promise.all([load('predictions.json'), load('meta.json').catch(() => null), load('scorecard.json').catch(() => null)]);
      const preds = raw.map(p => ({...p, home: dn(p.home), away: dn(p.away), form: p.form ? {h: (p.form.h || []).map(m => ({...m, o: dn(m.o)})), a: (p.form.a || []).map(m => ({...m, o: dn(m.o)}))} : p.form,
        stats: p.stats ? {...p.stats, h2h: (p.stats.h2h || []).map(m => ({...m, h: dn(m.h), a: dn(m.a)}))} : p.stats}));
      const openIds = [...document.querySelectorAll('button.head[aria-expanded="true"]')].map(b => b.getAttribute('aria-controls'));
      cache = {preds, meta, sc};
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
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
