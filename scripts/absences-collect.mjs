// Étude absences : collecte gratuite et progressive depuis API-Football (≤ 90 requêtes par passage, reprise automatique).
// Données : absences par championnat-saison (2023, 2024) et statistiques joueurs de la saison précédente (2022, 2023).
// Tout est écrit dans lab/absences/ sur la branche experience-absences. La clé n'est jamais écrite.
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
const KEY = process.env.API_FOOTBALL_KEY, BASE = 'https://v3.football.api-sports.io';
const BUDGET = Number(process.env.BUDGET || 90), DELAY = Number(process.env.DELAY_MS || 7000);
const DIR = 'lab/absences';
const LEAGUES = {FL1: 61, PL: 39, BL1: 78, SA: 135, PD: 140};
mkdirSync(DIR, {recursive: true});
const read = (f, d) => existsSync(`${DIR}/${f}`) ? JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) : d;
const write = (f, v) => writeFileSync(`${DIR}/${f}`, JSON.stringify(v));
const state = read('state.json', {done: {}, pages: {}, log: []});
const wait = ms => new Promise(r => setTimeout(r, ms));
let used = 0;
async function call(path) {
  if (used >= BUDGET) throw new Error('BUDGET');
  used++; await wait(DELAY);
  const r = await fetch(BASE + path, {headers: {'x-apisports-key': KEY}, signal: AbortSignal.timeout(60000)});
  const j = await r.json();
  const errs = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
  if (errs && errs.length) throw new Error(errs.join(' '));
  return j;
}
const tasks = [];
for (const [lg, id] of Object.entries(LEAGUES)) for (const s of [2023, 2024]) tasks.push({kind: 'inj', lg, id, s});
// Joueurs : le plan gratuit limite la pagination à 3 pages par requête « championnat », on passe donc équipe par équipe.
// Pour chaque saison prédite S (2023, 2024), on prend les équipes présentes cette saison-là (fichier d'absences)
// et leurs statistiques de la saison précédente S-1 (1re ou 2e division : cas des promus).
const DIV2 = {FL1: 62, PL: 40, BL1: 79, SA: 136, PD: 141};
for (const [lg, id] of Object.entries(LEAGUES)) for (const S of [2023, 2024]) {
  const inj = read(`inj-${lg}-${S}.json`, []);
  const teams = [...new Map(inj.map(x => [x.teamId, x.team])).entries()].filter(([t]) => t);
  for (const [teamId, team] of teams) tasks.push({kind: 'team', lg, id, s: S - 1, teamId, team, ids: [id, DIV2[lg]]});
}
let stop = null;
try {
  for (const t of tasks) {
    const key = t.kind === 'team' ? `team-${t.lg}-${t.s}-${t.teamId}` : `${t.kind}-${t.lg}-${t.s}`;
    if (state.done[key]) continue;
    if (t.kind === 'inj') {
      const j = await call(`/injuries?league=${t.id}&season=${t.s}`);
      write(`${key}.json`, (j.response || []).map(x => ({fx: x.fixture?.id, date: x.fixture?.date, team: x.team?.name, teamId: x.team?.id, pid: x.player?.id, name: x.player?.name, type: x.player?.type, reason: x.player?.reason})));
      state.done[key] = true;
    } else {
      const rows = read(`${key}.json`, []);
      let page = (state.pages[key] || 0) + 1;
      for (;;) {
        const j = await call(`/players?team=${t.teamId}&season=${t.s}&page=${page}`);
        for (const p of j.response || []) for (const st of p.statistics || []) {
          if (st.team?.id !== t.teamId || !t.ids.includes(st.league?.id)) continue;
          rows.push({pid: p.player?.id, name: p.player?.name, team: st.team?.name, teamId: st.team?.id, league: st.league?.id, pos: st.games?.position, apps: st.games?.appearences || 0, starts: st.games?.lineups || 0, min: st.games?.minutes || 0, rating: st.games?.rating ? Number(st.games.rating) : null, goals: st.goals?.total || 0, assists: st.goals?.assists || 0});
        }
        write(`${key}.json`, rows); state.pages[key] = page;
        const total = Math.min(j.paging?.total || page, 3);
        if (page >= total) { state.done[key] = true; break; }
        page++;
      }
    }
  }
} catch (e) { stop = String(e.message || e); }
const keyOf = t => t.kind === 'team' ? `team-${t.lg}-${t.s}-${t.teamId}` : `${t.kind}-${t.lg}-${t.s}`;
const remaining = tasks.filter(t => !state.done[keyOf(t)]).map(keyOf);
state.total = tasks.length; state.restant = remaining.length;
state.log.push({date: new Date().toISOString(), requetes: used, arret: stop === 'BUDGET' ? 'budget du jour atteint' : stop, restant: remaining.length});
state.complete = remaining.length === 0;
write('state.json', state);
console.log(`Requêtes : ${used} · tâches restantes : ${remaining.length}${stop ? ' · arrêt : ' + stop : ''}`);
// Quota du jour ou limite par minute atteints : arrêt normal, reprise au prochain passage.
if (stop && stop !== 'BUDGET' && !/limit|too many|requests/i.test(stop)) process.exitCode = 1;
