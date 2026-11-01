// Étape 1 de l'étude « absences et compositions » : que donne réellement API-Football avec notre clé ?
// Ne touche ni au modèle ni au site. ~15 requêtes. Résultat : lab/probe-apifootball.json (la clé n'est jamais écrite).
import {writeFileSync, mkdirSync} from 'node:fs';
const KEY = process.env.API_FOOTBALL_KEY;
const BASE = 'https://v3.football.api-sports.io';
const LEAGUES = {FL1: 61, PL: 39, BL1: 78, SA: 135, PD: 140};
const out = {date: new Date().toISOString(), requetes: 0, statut: null, ligues: {}, saisons: {}, exemples: {}, erreurs: []};
async function call(path) {
  out.requetes++;
  try {
    const r = await fetch(BASE + path, {headers: {'x-apisports-key': KEY}, signal: AbortSignal.timeout(30000)});
    const j = await r.json();
    const errs = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
    if (errs && errs.length) out.erreurs.push({path, erreurs: errs});
    return j;
  } catch (e) { out.erreurs.push({path, erreurs: [String(e.message || e)]}); return null; }
}
const keysOf = o => o && typeof o === 'object' ? Object.keys(o) : [];
if (!KEY) { out.erreurs.push({path: '-', erreurs: ['Secret API_FOOTBALL_KEY absent']}); }
else {
  const st = await call('/status'); const s = st?.response;
  out.statut = s ? {plan: s.subscription?.plan, fin: s.subscription?.end, actif: s.subscription?.active, limiteJour: s.requests?.limit_day, utiliseesJour: s.requests?.current} : null;
  // 1. couverture déclarée par saison
  for (const [code, id] of Object.entries(LEAGUES)) {
    const j = await call(`/leagues?id=${id}`);
    const seasons = j?.response?.[0]?.seasons || [];
    out.ligues[code] = seasons.filter(x => x.year >= 2022).map(x => ({saison: x.year, debut: x.start, fin: x.end,
      blessures: x.coverage?.injuries, compositions: x.coverage?.fixtures?.lineups, statsJoueursMatch: x.coverage?.fixtures?.statistics_players, evenements: x.coverage?.fixtures?.events}));
  }
  // 2. saisons réellement accessibles avec ce plan (Ligue 1)
  let sample = null;
  for (const season of [2022, 2023, 2024, 2025, 2026]) {
    const j = await call(`/fixtures?league=61&season=${season}`);
    const fx = j?.response || [];
    out.saisons['FL1-' + season] = {matchs: fx.length, termines: fx.filter(f => f.fixture?.status?.short === 'FT').length, message: j?.errors && Object.values(j.errors).join(' ') || null};
    if (!sample && fx.length) { const ft = fx.filter(f => f.fixture?.status?.short === 'FT'); if (ft.length > 10) sample = {season, ids: [ft[5].fixture.id, ft[ft.length - 5].fixture.id]}; }
  }
  // 3. détail d'un match terminé : compositions, minutes, et champ de date/heure éventuel
  if (sample) {
    const d = await call(`/fixtures?ids=${sample.ids.join('-')}`);
    const f = d?.response?.[0];
    if (f) {
      const lu = f.lineups?.[0], pl = f.players?.[0]?.players?.[0];
      out.exemples.detailMatch = {saison: sample.season, id: f.fixture?.id, date: f.fixture?.date, champs: keysOf(f), compositions: f.lineups?.length || 0,
        champsComposition: keysOf(lu), titulaires: lu?.startXI?.length || 0, remplacants: lu?.substitutes?.length || 0,
        exempleTitulaire: lu?.startXI?.[0]?.player ? {nom: lu.startXI[0].player.name, poste: lu.startXI[0].player.pos} : null,
        statsJoueurs: f.players?.length || 0, champsStatsJoueur: keysOf(pl?.statistics?.[0]?.games), exempleMinutes: pl?.statistics?.[0]?.games?.minutes ?? null};
    }
    const inj = await call(`/injuries?fixture=${sample.ids[0]}`);
    const i0 = inj?.response?.[0];
    out.exemples.absencesMatch = {n: inj?.response?.length || 0, champs: keysOf(i0), champsJoueur: keysOf(i0?.player), champsMatch: keysOf(i0?.fixture),
      exemple: i0 ? {type: i0.player?.type, raison: i0.player?.reason, dateMatch: i0.fixture?.date, horodatageInfo: i0.player?.date || i0.update || null} : null};
  }
  // 4. volume des absences sur une saison (pagination)
  const season = sample?.season || 2024;
  const injS = await call(`/injuries?league=61&season=${season}`);
  out.exemples.absencesSaison = {saison: season, n: injS?.response?.length || 0, paging: injS?.paging || null,
    types: [...new Set((injS?.response || []).map(x => x.player?.type))], raisons: [...new Set((injS?.response || []).map(x => x.player?.reason))].slice(0, 15),
    matchsCouverts: new Set((injS?.response || []).map(x => x.fixture?.id)).size};
  const st2 = await call('/status'); out.statut && (out.statut.utiliseesApres = st2?.response?.requests?.current);
}
mkdirSync('lab', {recursive: true});
writeFileSync('lab/probe-apifootball.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
