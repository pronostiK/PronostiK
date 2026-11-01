// Laboratoire équipes nationales : sources possibles pour le calendrier de la trêve (sondage).
import {writeFileSync} from 'node:fs';
const rep = {};
const tries = {
  espn_nations: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/scoreboard?dates=20261109-20261118&limit=200',
  espn_friendly: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.friendly/scoreboard?dates=20261109-20261118&limit=200',
  espn_wcq_uefa: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldq.uefa/scoreboard?dates=20261109-20261118&limit=200',
  espn_nations_oct: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/scoreboard?dates=20261001-20261015&limit=200',
  uefa_unl: 'https://match.uefa.com/v5/matches?competitionId=2014&seasonYear=2027&fromDate=2026-11-09&toDate=2026-11-18&limit=100&offset=0&order=ASC',
};
for (const [k, u] of Object.entries(tries)) {
  try { const r = await fetch(u, {signal: AbortSignal.timeout(30000), headers: {'User-Agent': 'Mozilla/5.0'}}); const t = await r.text();
    let sample = t.slice(0, 300), n = null;
    try { const j = JSON.parse(t); if (j.events) { n = j.events.length; sample = j.events.slice(0, 60).map(e => `${e.date} ${e.name} | ${e.competitions?.[0]?.status?.type?.name} | ${(e.competitions?.[0]?.competitors || []).map(c => c.homeAway + ':' + c.team?.displayName + ':' + c.score).join(' ')} | neutre=${e.competitions?.[0]?.neutralSite}`); } else if (Array.isArray(j)) { n = j.length; sample = j.slice(0, 40).map(m => `${m.kickOffTime?.dateTime} ${m.homeTeam?.internationalName} - ${m.awayTeam?.internationalName} ${m.status}`); } } catch {}
    rep[k] = {status: r.status, n, sample};
  } catch (e) { rep[k] = {error: String(e.message)}; }
}
writeFileSync(new URL('../lab/nations/fx-report.json', import.meta.url), JSON.stringify(rep, null, 1));
console.log(JSON.stringify(rep, null, 1));
