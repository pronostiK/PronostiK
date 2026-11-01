// Étude absences, étape 1 bis : coût réel d'une récupération par championnat-saison (au lieu de par match).
// 5 requêtes espacées de 8 s (limite par minute du plan gratuit). Résultat : lab/probe2-apifootball.json.
import {writeFileSync, mkdirSync} from 'node:fs';
const KEY = process.env.API_FOOTBALL_KEY, BASE = 'https://v3.football.api-sports.io';
const out = {date: new Date().toISOString(), essais: []};
const wait = ms => new Promise(r => setTimeout(r, ms));
async function call(path) {
  await wait(8000);
  const r = await fetch(BASE + path, {headers: {'x-apisports-key': KEY}, signal: AbortSignal.timeout(60000)});
  const j = await r.json();
  return j;
}
const keys = o => o && typeof o === 'object' ? Object.keys(o) : [];
for (const [lg, id, season] of [['FL1', 61, 2023], ['PL', 39, 2024]]) {
  const inj = await call(`/injuries?league=${id}&season=${season}`);
  const R = inj.response || [];
  const dates = R.map(x => x.fixture?.date).filter(Boolean).sort();
  out.essais.push({type: 'absences', lg, season, erreurs: inj.errors, paging: inj.paging, lignes: R.length,
    matchsCouverts: new Set(R.map(x => x.fixture?.id)).size, joueurs: new Set(R.map(x => x.player?.id)).size,
    premiereDate: dates[0] || null, derniereDate: dates[dates.length - 1] || null,
    types: [...new Set(R.map(x => x.player?.type))], raisons: Object.entries(R.reduce((a, x) => (a[x.player?.reason] = (a[x.player?.reason] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 12)});
  const pl = await call(`/players?league=${id}&season=${season}&page=1`);
  const p0 = pl.response?.[0], st = p0?.statistics?.[0];
  out.essais.push({type: 'joueurs', lg, season, erreurs: pl.errors, paging: pl.paging, lignesPage1: pl.response?.length || 0,
    champsJoueur: keys(p0?.player), champsStats: keys(st), champsMatchs: keys(st?.games),
    exemple: st ? {poste: st.games?.position, matchs: st.games?.appearences, titularisations: st.games?.lineups, minutes: st.games?.minutes, note: st.games?.rating, buts: st.goals?.total} : null});
}
const s = await call('/status'); out.quota = {utilisees: s.response?.requests?.current, limite: s.response?.requests?.limit_day};
mkdirSync('lab', {recursive: true});
writeFileSync('lab/probe2-apifootball.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
