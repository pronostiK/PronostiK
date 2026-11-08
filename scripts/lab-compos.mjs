// Sondage compositions ESPN (lecture seule) : écrit lab/compos/probe.json
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {ESPN_LG, espnRecent, mapNames, espnLineup} from './compos-lib.mjs';
const hist = JSON.parse(readFileSync('data/history.json'));
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
