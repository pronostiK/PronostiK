// Laboratoire « absents sur la page match » : quelles sources donnent les blessés/suspendus des matchs À VENIR ?
// Résultat : lab/absents/probe.json. Ne touche pas au site.
import {writeFileSync, mkdirSync} from 'node:fs';
const out = {at: new Date().toISOString(), espn: {}, apif: {}};
const UA = {'User-Agent': 'Mozilla/5.0 (PronostiK)'};
const j = async (u, h = UA) => { const r = await fetch(u, {headers: h, signal: AbortSignal.timeout(30000)}); const t = await r.text(); let x = null; try { x = JSON.parse(t); } catch {} return {http: r.status, x, t: x ? null : t.slice(0, 200)}; };
const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
// --- ESPN : prochains matchs de Premier League, puis le résumé d'un match et les fiches équipes
for (const lg of ['eng.1', 'fra.1', 'uefa.champions']) {
  const o = out.espn[lg] = {};
  try {
    let ev = null;
    for (let k = 0; k < 8 && !ev; k++) { const d = new Date(Date.now() + k * 864e5).toISOString().slice(0, 10).replace(/-/g, ''); const s = await j(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${d}`); ev = s.x?.events?.find(e => !e.competitions?.[0]?.status?.type?.completed); }
    if (!ev) { o.err = 'pas de match à venir'; continue; }
    o.match = ev.name; o.id = ev.id;
    const sm = await j(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/summary?event=${ev.id}`);
    o.summaryKeys = sm.x ? Object.keys(sm.x) : sm.t;
    o.injuriesSummary = sm.x?.injuries ? JSON.stringify(sm.x.injuries).slice(0, 1500) : null;
    const team = ev.competitions[0].competitors[0].team;
    o.team = team.displayName;
    for (const [k, u] of [['siteTeamInjuries', `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/teams/${team.id}/injuries`],
      ['coreTeamInjuries', `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${lg}/teams/${team.id}/injuries?limit=50`],
      ['siteTeamEnable', `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/teams/${team.id}?enable=roster,injuries`]]) {
      const r = await j(u); o[k] = {http: r.http, keys: r.x ? Object.keys(r.x).slice(0, 15) : r.t, sample: r.x ? JSON.stringify(r.x.items || r.x.injuries || r.x.team?.injuries || '').slice(0, 800) : null};
    }
  } catch (e) { o.err = String(e.message); }
}
// --- API-Football : statut du compte, blessés du jour (toutes ligues), saison en cours accessible ?
const K = process.env.API_FOOTBALL_KEY;
if (!K) out.apif.err = 'clé absente';
else {
  const H = {'x-apisports-key': K};
  const st = await j('https://v3.football.api-sports.io/status', H); out.apif.status = st.x?.response ? {plan: st.x.response.subscription?.plan, requests: st.x.response.requests} : st.x?.errors || st.t;
  const today = new Date().toISOString().slice(0, 10);
  const inj = await j(`https://v3.football.api-sports.io/injuries?date=${today}`, H);
  out.apif.injuriesToday = {errors: inj.x?.errors, results: inj.x?.results, paging: inj.x?.paging, sample: (inj.x?.response || []).slice(0, 3)};
  const inj2 = await j('https://v3.football.api-sports.io/injuries?league=39&season=2026', H);
  out.apif.pl2026 = {errors: inj2.x?.errors, results: inj2.x?.results, sample: (inj2.x?.response || []).slice(-2)};
}
mkdirSync('lab/absents', {recursive: true});
writeFileSync('lab/absents/probe.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out).slice(0, 3000));
