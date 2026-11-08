// Compositions : onze de départ du dernier match de championnat de chaque équipe (API publique d'ESPN, gratuite).
// Les noms ESPN sont reliés aux noms du site par les matchs communs (même date à un jour près, mêmes adversaires).
export const ESPN_LG = {FL1: 'fra.1', PL: 'eng.1', BL1: 'ger.1', SA: 'ita.1', PD: 'esp.1', PPL: 'por.1', DED: 'ned.1', ELC: 'eng.2', FL2: 'fra.2'};
const UA = {'User-Agent': 'Mozilla/5.0 (PronostiK)'};
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(fc|afc|cf|sc|ac|as|ss|sv|rc|ogc|losc|club|de|of)\b/g, '').replace(/[^a-z0-9]/g, '');
async function getJSON(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, {headers: UA, signal: AbortSignal.timeout(20000)}); if (r.ok) return await r.json(); } catch {}
    await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}
// Paris : dates des matchs en heure française, comme l'historique
const parisDate = iso => new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Paris'}).format(new Date(iso));
const dayDiff = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

// Lit le tableau des scores jour par jour (21 derniers jours ; les jours de plus de 2 jours sont gardés en cache).
// Renvoie les matchs terminés {id, date, home, away, hs, as}. cache : {AAAAMMJJ: [matchs]} (modifié sur place).
export async function espnRecent(slug, cache = {}, now = new Date()) {
  const out = [], keep = {};
  for (let k = 0; k <= 21; k++) {
    const d = ymd(new Date(now.getTime() - k * 864e5));
    if (k > 2 && cache[d]) { keep[d] = cache[d]; out.push(...cache[d]); continue; }
    const j = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${d}`);
    if (!j) continue;
    const day = [];
    for (const e of j.events || []) {
      const c = e.competitions?.[0]; if (!c || !c.status?.type?.completed) continue;
      const h = c.competitors.find(x => x.homeAway === 'home'), a = c.competitors.find(x => x.homeAway === 'away');
      if (!h || !a) continue;
      day.push({id: String(e.id), date: parisDate(e.date), home: h.team.displayName, away: a.team.displayName, hs: +h.score, as: +a.score});
    }
    keep[d] = day; out.push(...day);
  }
  for (const d of Object.keys(cache)) delete cache[d];
  Object.assign(cache, keep);
  return out;
}
// Relie les noms ESPN aux noms du site (matchs de l'historique du même championnat)
export function mapNames(events, hist, known = {}) {
  const map = {...known}, ours = new Set(hist.flatMap(m => [m.home, m.away]));
  const byNorm = {}; ours.forEach(n => byNorm[norm(n)] = n);
  const score = {};
  for (const e of events) for (const m of hist) {
    if (dayDiff(e.date, m.date) > 1) continue;
    if (m.hg !== e.hs || m.ag !== e.as) continue;
    (score[e.home] ||= {})[m.home] = (score[e.home][m.home] || 0) + 1;
    (score[e.away] ||= {})[m.away] = (score[e.away][m.away] || 0) + 1;
  }
  const names = new Set(events.flatMap(e => [e.home, e.away]));
  for (const n of names) {
    if (map[n]) continue;
    if (byNorm[norm(n)]) { map[n] = byNorm[norm(n)]; continue; }
    const s = Object.entries(score[n] || {}).sort((a, b) => b[1] - a[1]);
    if (s.length && s[0][1] >= 2 && (!s[1] || s[0][1] >= 2 * s[1][1])) map[n] = s[0][0];
  }
  return map;
}
// Onze de départ d'un match ESPN : {home:{formation, xi:[[n°, nom, poste]]}, away:{…}}
export async function espnLineup(slug, id) {
  const j = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${id}`);
  if (!j) return null;
  const out = {};
  for (const r of j.rosters || []) {
    const xi = (r.roster || []).filter(p => p.starter).map(p => [p.jersey || '', p.athlete?.shortName || p.athlete?.displayName || '', p.position?.abbreviation || '', +p.formationPlace || 0])
      .sort((a, b) => (a[3] || 99) - (b[3] || 99)).map(p => p.slice(0, 3));
    if (xi.length >= 10) out[r.homeAway] = {formation: r.formation || '', xi};
  }
  return out.home || out.away ? out : {};
}
