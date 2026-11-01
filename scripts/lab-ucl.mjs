// Laboratoire Ligue des champions : sondage des sources et collecte des données de calibration.
// 1. football-data.org : matchs de C1 (saison en cours + saisons passées si le plan gratuit les donne)
// 2. ClubElo : classement Elo de tous les clubs européens, à chaque date de match de C1
// 3. openfootball (GitHub) : résultats des C1 passées, en secours
// Écrit dans lab/ucl/ ; n'a aucune incidence sur le site.
import {writeFileSync, mkdirSync, existsSync, readFileSync} from 'node:fs';

const OUT = new URL('../lab/ucl/', import.meta.url);
mkdirSync(OUT, {recursive: true});
const save = (f, o) => writeFileSync(new URL(f, OUT), typeof o === 'string' ? o : JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOKEN = process.env.FD_TOKEN;
const report = {at: new Date().toISOString(), fd: {}, elo: {}, openfootball: {}};

async function get(url, opt = {}) {
  try {
    const r = await fetch(url, {...opt, signal: AbortSignal.timeout(30000)});
    const txt = await r.text();
    return {status: r.status, txt};
  } catch (e) { return {status: 0, txt: String(e.message || e)}; }
}

// 1. football-data.org
const fdMatches = [];
for (const season of [2026, 2025, 2024, 2023, 2022]) {
  const r = await get(`https://api.football-data.org/v4/competitions/CL/matches?season=${season}`, {headers: {'X-Auth-Token': TOKEN}});
  let n = 0;
  if (r.status === 200) {
    const j = JSON.parse(r.txt);
    for (const m of j.matches || []) {
      fdMatches.push({season, id: m.id, utc: m.utcDate, stage: m.stage, md: m.matchday, status: m.status,
        home: m.homeTeam?.name, away: m.awayTeam?.name, hs: m.homeTeam?.shortName, as: m.awayTeam?.shortName,
        hg: m.score?.fullTime?.home ?? null, ag: m.score?.fullTime?.away ?? null, dur: m.score?.duration || null,
        ht: [m.score?.halfTime?.home ?? null, m.score?.halfTime?.away ?? null]});
      n++;
    }
    if (season === 2026) report.fd.emblem = j.competition?.emblem || null;
  }
  report.fd[season] = {status: r.status, matches: n, msg: r.status === 200 ? '' : r.txt.slice(0, 200)};
  await sleep(7000);
}
save('fd-cl.json', fdMatches);

// 3. openfootball (secours pour l'historique)
const ofSeasons = ['2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];
for (const s of ofSeasons) {
  for (const f of ['cl.txt', 'champs.txt']) {
    const r = await get(`https://raw.githubusercontent.com/openfootball/champions-league/master/${s}/${f}`);
    if (r.status === 200) { save(`of-${s}.txt`, r.txt); report.openfootball[s] = {file: f, bytes: r.txt.length}; break; }
    report.openfootball[s] = {status: r.status};
  }
}

// 2. ClubElo : dates à couvrir = dates des matchs de C1 connus (football-data.org + openfootball), plus aujourd'hui
const dates = new Set(fdMatches.map(m => (m.utc || '').slice(0, 10)).filter(Boolean));
for (const s of ofSeasons) {
  const f = new URL(`of-${s}.txt`, OUT);
  if (!existsSync(f)) continue;
  const txt = readFileSync(f, 'utf8');
  const y1 = Number(s.slice(0, 4));
  const MON = {Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12};
  for (const mm of txt.matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\/(\d{1,2})(?:\s+(\d{4}))?/g)) {
    const mo = MON[mm[1]], d = Number(mm[2]); const y = mm[3] ? Number(mm[3]) : (mo >= 7 ? y1 : y1 + 1);
    dates.add(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
}
const today = new Date().toISOString().slice(0, 10);
dates.add(today);
const snaps = {};
let ok = 0, fail = 0, first = null;
for (const d of [...dates].sort()) {
  if (d < '2018-07-01' || d > today) continue;
  const r = await get(`http://api.clubelo.com/${d}`);
  if (r.status !== 200) { fail++; if (!first) first = `${d} : ${r.status} ${r.txt.slice(0, 120)}`; continue; }
  const rows = r.txt.trim().split('\n').slice(1).map(l => l.split(','));
  // colonnes : Rank,Club,Country,Level,Elo,From,To
  const top = rows.filter(c => c[4]).map(c => [c[1], c[2], Math.round(Number(c[4]) * 10) / 10]).sort((a, b) => b[2] - a[2]).slice(0, 450);
  snaps[d] = top; ok++;
  await sleep(150);
}
report.elo = {dates: dates.size, ok, fail, firstError: first};
save('elo-snapshots.json', snaps);

// Pronostics de ClubElo pour les matchs à venir (référence de comparaison)
const fx = await get('http://api.clubelo.com/Fixtures');
report.elo.fixtures = {status: fx.status, bytes: fx.txt.length};
if (fx.status === 200) save('elo-fixtures.csv', fx.txt);

save('report.json', report);
console.log(JSON.stringify(report, null, 1));
