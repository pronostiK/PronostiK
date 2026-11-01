// Test gratuit : football-data.org (plan gratuit, clé FD_TOKEN) donne-t-il les compositions des matchs ?
// Résultat : lab/probe-fd-lineups.json (la clé n'est jamais écrite).
import {writeFileSync, mkdirSync} from 'node:fs';
const T = process.env.FD_TOKEN, B = 'https://api.football-data.org/v4';
const out = {date: new Date().toISOString(), etapes: []};
const keys = o => o && typeof o === 'object' ? Object.keys(o) : null;
async function get(path) {
  await new Promise(r => setTimeout(r, 7000));
  const r = await fetch(B + path, {headers: {'X-Auth-Token': T}});
  const j = await r.json().catch(() => ({}));
  return {status: r.status, j, reste: r.headers.get('x-requests-available-minute')};
}
const L = await get('/competitions/FL1/matches?status=FINISHED&dateFrom=2026-10-20&dateTo=2026-10-31');
const ms = L.j.matches || [];
out.etapes.push({appel: 'liste des matchs terminés (Ligue 1)', http: L.status, matchs: ms.length, champsMatch: keys(ms[0]), champsEquipe: keys(ms[0]?.homeTeam), message: L.j.message || null});
const m = ms[ms.length - 1];
if (m) {
  const D = await get(`/matches/${m.id}`);
  const h = D.j.homeTeam || {};
  out.etapes.push({appel: `détail du match ${m.homeTeam?.name} – ${m.awayTeam?.name}`, http: D.status, message: D.j.message || null, champsMatch: keys(D.j), champsEquipe: keys(h),
    composition: Array.isArray(h.lineup) ? h.lineup.length : null, remplacants: Array.isArray(h.bench) ? h.bench.length : null, formation: h.formation ?? null,
    exempleTitulaire: Array.isArray(h.lineup) && h.lineup[0] ? {nom: h.lineup[0].name, poste: h.lineup[0].position} : null,
    buteurs: Array.isArray(D.j.goals) ? D.j.goals.length : null, remplacements: Array.isArray(D.j.substitutions) ? D.j.substitutions.length : null, cartons: Array.isArray(D.j.bookings) ? D.j.bookings.length : null});
  const S = await get(`/teams/${m.homeTeam?.id}`);
  out.etapes.push({appel: `effectif de ${m.homeTeam?.name}`, http: S.status, message: S.j.message || null, joueurs: Array.isArray(S.j.squad) ? S.j.squad.length : null, champsJoueur: keys(S.j.squad?.[0])});
}
out.conclusion = (() => {
  const d = out.etapes[1];
  if (!d) return 'Aucun match trouvé : test incomplet.';
  if (d.composition > 0) return 'Compositions DISPONIBLES avec le plan gratuit.';
  return 'Compositions NON fournies par le plan gratuit (champ absent ou vide).';
})();
mkdirSync('lab', {recursive: true});
writeFileSync('lab/probe-fd-lineups.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
