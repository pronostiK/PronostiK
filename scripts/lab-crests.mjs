// Sondage : sources de logos pour les clubs de Ligue 2 (et autres équipes sans logo).
import {writeFileSync, mkdirSync} from 'node:fs';
mkdirSync(new URL('../lab/crests/', import.meta.url), {recursive: true});
const rep = {};
const tries = {
  tsdb_l2: 'https://www.thesportsdb.com/api/v1/json/123/search_all_teams.php?l=French%20Ligue%202',
  tsdb_l2b: 'https://www.thesportsdb.com/api/v1/json/123/lookup_all_teams.php?id=4401',
  espn_l2: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.2/teams',
  espn_l1: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/teams',
};
for (const [k, u] of Object.entries(tries)) {
  try {
    const r = await fetch(u, {signal: AbortSignal.timeout(30000), headers: {'User-Agent': 'Mozilla/5.0'}}); const t = await r.text(); let out = t.slice(0, 200);
    try { const j = JSON.parse(t);
      if (j.teams) out = j.teams.map(x => [x.strTeam, x.strBadge || x.strTeamBadge]);
      else if (j.sports) out = j.sports[0].leagues[0].teams.map(x => [x.team.displayName, x.team.shortDisplayName, (x.team.logos || [])[0]?.href]);
    } catch {}
    rep[k] = {status: r.status, out};
  } catch (e) { rep[k] = {error: String(e.message)}; }
}
writeFileSync(new URL('../lab/crests/report.json', import.meta.url), JSON.stringify(rep, null, 1));
console.log(JSON.stringify(rep).slice(0, 3000));
