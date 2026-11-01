// Laboratoire C1, étape 2 : championnats nationaux (1re division) des pays présents en C1, saisons 2017-18 → en cours,
// et C1 2017-18 / 2026-27 (openfootball). Écrit lab/ucl/domestic.json ; aucune incidence sur le site.
import {writeFileSync, mkdirSync} from 'node:fs';
const OUT = new URL('../lab/ucl/', import.meta.url);
mkdirSync(OUT, {recursive: true});
const MAIN = {ENG: 'E0', GER: 'D1', ITA: 'I1', ESP: 'SP1', FRA: 'F1', POR: 'P1', NED: 'N1', BEL: 'B1', SCO: 'SC0', TUR: 'T1', GRE: 'G1'};
const EXTRA = {AUT: 'AUT', SUI: 'SWZ', DEN: 'DNK', NOR: 'NOR', SWE: 'SWE', POL: 'POL', ROU: 'ROU', RUS: 'RUS'};
const get = async u => { try { const r = await fetch(u, {signal: AbortSignal.timeout(30000)}); return {s: r.status, t: r.status === 200 ? await r.text() : ''}; } catch (e) { return {s: 0, t: ''}; } };
const split = l => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o.map(x => x.trim()); };
const iso = d => { const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; };
const rows = [], report = {};
function parse(txt, c, kind) {
  const lines = txt.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean); if (!lines.length) return 0;
  const H = split(lines[0]); const ix = n => H.indexOf(n);
  const [iD, iH, iA, iG, iJ] = kind === 'main' ? [ix('Date'), ix('HomeTeam'), ix('AwayTeam'), ix('FTHG'), ix('FTAG')] : [ix('Date'), ix('Home'), ix('Away'), ix('HG'), ix('AG')];
  let n = 0;
  for (const l of lines.slice(1)) { const f = split(l); const d = iso(f[iD] || ''), hg = f[iG], ag = f[iJ];
    if (!d || d < '2017-07-01' || !f[iH] || hg === '' || ag === '' || hg == null || ag == null || isNaN(+hg) || isNaN(+ag)) continue;
    rows.push([d, c, f[iH], f[iA], +hg, +ag]); n++; }
  return n;
}
for (const [c, code] of Object.entries(MAIN)) {
  report[c] = {};
  for (let y = 2017; y <= 2026; y++) {
    const s = `${String(y).slice(2)}${String(y + 1).slice(2)}`;
    const r = await get(`https://www.football-data.co.uk/mmz4281/${s}/${code}.csv`);
    report[c][s] = r.s === 200 ? parse(r.t, c, 'main') : 'HTTP ' + r.s;
  }
}
for (const [c, code] of Object.entries(EXTRA)) { const r = await get(`https://www.football-data.co.uk/new/${code}.csv`); report[c] = r.s === 200 ? parse(r.t, c, 'new') : 'HTTP ' + r.s; }
rows.sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(new URL('domestic.json', OUT), JSON.stringify(rows));
for (const s of ['2017-18', '2026-27']) { const r = await get(`https://raw.githubusercontent.com/openfootball/champions-league/master/${s}/cl.txt`); report['of-' + s] = r.s; if (r.s === 200) writeFileSync(new URL(`of-${s}.txt`, OUT), r.t); }
writeFileSync(new URL('domestic-report.json', OUT), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report), rows.length);
