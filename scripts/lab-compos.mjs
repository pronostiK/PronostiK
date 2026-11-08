// Sondage compositions ESPN (lecture seule) : écrit lab/compos/probe.json
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {ESPN_LG, espnRecent, mapNames, espnLineup} from './compos-lib.mjs';
const hist = JSON.parse(readFileSync('data/history.json'));
for (const u of ['https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?dates=20261011-20261108&limit=400','https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?dates=20261011-20261108','https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?dates=20261101']) {
  try { const r = await fetch(u, {headers: {'User-Agent': 'Mozilla/5.0 (PronostiK)'}}); const t = await r.text(); console.log('DBG', r.status, t.length, t.slice(0, 150)); } catch (e) { console.log('DBG err', e.message); }
}
const out = {};
for (const [lg, slug] of Object.entries(ESPN_LG)) {
  const ev = await espnRecent(slug);
  if (!ev) { out[lg] = {err: 'scoreboard'}; continue; }
  const H = hist.filter(m => m.lg === lg && m.date >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const map = mapNames(ev, H), names = [...new Set(ev.flatMap(e => [e.home, e.away]))];
  const last = ev.sort((a, b) => b.date.localeCompare(a.date))[0];
  const lu = last ? await espnLineup(slug, last.id) : null;
  out[lg] = {events: ev.length, teams: names.length, mapped: Object.keys(map).length, unmapped: names.filter(n => !map[n]), sample: last && {...last, lineup: lu}};
}
mkdirSync('lab/compos', {recursive: true});
writeFileSync('lab/compos/probe.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, {e: v.events, t: v.teams, m: v.mapped, u: v.unmapped}]))));
