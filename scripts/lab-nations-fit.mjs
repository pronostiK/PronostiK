// Laboratoire équipes nationales : réglage (2014-2021) et test (2022-2026) de l'Elo des sélections.
import {readFileSync, writeFileSync} from 'node:fs';
import {parseResults, runNationsElo, nationsPredict, buildNationsSeed} from './nations-lib.mjs';
const all = parseResults(readFileSync(new URL('../lab/nations/results.csv', import.meta.url), 'utf8')).sort((a, b) => a.date.localeCompare(b.date));
const UEFA = new Set(); for (const m of all) if (/UEFA|Euro/.test(m.t)) { UEFA.add(m.home); UEFA.add(m.away); }
const target = (m, from, to) => m.date >= from && m.date < to && UEFA.has(m.home) && UEFA.has(m.away) && m.t !== 'Friendly';
const idx = m => m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
const sig = z => 1 / (1 + Math.exp(-z));
function rows(P, from, to, all2 = all) { const R = []; runNationsElo(all2, P, (m, rh, ra) => { if (target(m, from, to)) R.push({x: (rh + (m.neutral ? 0 : P.H) - ra) / 100, neutral: m.neutral, rh, ra, i: idx(m), hg: m.hg, ag: m.ag, m}); }); return R; }
const ll = (R, q) => R.reduce((s, r) => { const pA = sig(q.t1 - q.b * r.x), pAD = sig(q.t2 - q.b * r.x), p = [1 - pAD, Math.max(1e-9, pAD - pA), pA]; return s - Math.log(p[r.i]); }, 0) / R.length;
function fitOrd(R) { let q = {b: 0.5, t1: -0.4, t2: 0.7}, best = ll(R, q), st = 0.2; for (let it = 0; it < 200 && st > 1e-4; it++) { let imp = false; for (const k of ['b', 't1', 't2']) for (const d of [st, -st]) { const q2 = {...q, [k]: q[k] + d}, v = ll(R, q2); if (v < best) { best = v; q = q2; imp = true; } } if (!imp) st /= 2; } return {q, best}; }
// grille : multiplicateur de K, avantage du terrain
let bestP = null, bestV = Infinity;
for (const kMul of [0.6, 0.7, 0.8, 1, 1.25]) for (const H of [30, 45, 60, 80, 100]) {
  const P = {init: 1500, kMul, H}; const R = rows(P, '2014-01-01', '2022-01-01'); const {q, best} = fitOrd(R);
  if (best < bestV) { bestV = best; bestP = {...P, ord: q}; }
}
console.log('réglage', JSON.stringify(bestP), bestV.toFixed(4));
// buts
const trainR = rows(bestP, '2014-01-01', '2022-01-01').filter(r => !r.neutral);
function poisFit(R, sgn, key) { let a = 0.2, b = 0.1; for (let it = 0; it < 60; it++) { let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0; for (const r of R) { const x = sgn * r.x, y = r[key], l = Math.exp(a + b * x); g0 += y - l; g1 += (y - l) * x; h00 += l; h01 += l * x; h11 += l * x * x; } const det = h00 * h11 - h01 * h01; a += (h11 * g0 - h01 * g1) / det; b += (h00 * g1 - h01 * g0) / det; } return {a, b}; }
bestP.goals = {home: poisFit(trainR, 1, 'hg'), away: poisFit(trainR, -1, 'ag')};
// test
const T = rows(bestP, '2022-01-01', '2027-01-01');
const freq = [0, 0, 0]; trainR.forEach(r => freq[r.i]++); const fs = freq.map(v => v / trainR.length);
const br = (p, i) => p.reduce((t, v, k) => t + (v - (k === i ? 1 : 0)) ** 2, 0);
const preds = T.map(r => nationsPredict(r.rh, r.ra, r.neutral, bestP).p);
const bM = T.reduce((s, r, j) => s + br(preds[j], r.i), 0) / T.length, bN = T.reduce((s, r) => s + br(fs, r.i), 0) / T.length;
const lM = T.reduce((s, r, j) => s - Math.log(preds[j][r.i]), 0) / T.length;
const d = T.map((r, j) => br(preds[j], r.i) - br(fs, r.i)), mu = d.reduce((a, b) => a + b, 0) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - mu) ** 2, 0) / (d.length - 1) / d.length);
const bins = [[0, .2], [.2, .35], [.35, .5], [.5, .65], [.65, .8], [.8, 1.01]];
const cal = bins.map(([lo, hi]) => { let n = 0, sp = 0, so = 0; T.forEach((r, j) => preds[j].forEach((v, k) => { if (v >= lo && v < hi) { n++; sp += v; so += +(k === r.i); } })); return `${Math.round(sp / n * 100)}/${Math.round(so / n * 100)}(${n})`; });
const res = {n: T.length, brierModel: bM, brierNaif: bN, logModel: lM, ecart: [mu, mu - 1.96 * sd, mu + 1.96 * sd], calibration: cal, P: bestP};
console.log(JSON.stringify(res, (k, v) => typeof v === 'number' ? Math.round(v * 10000) / 10000 : v));
writeFileSync(new URL('../lab/nations/fit-result.json', import.meta.url), JSON.stringify(res, null, 1));
// graine : notes à la date du fichier
const seed = buildNationsSeed(readFileSync(new URL('../lab/nations/results.csv', import.meta.url), 'utf8'), bestP);
writeFileSync(new URL('../data/nations-seed.json', import.meta.url), JSON.stringify(seed));
console.log('graine au', seed.asOf, Object.keys(seed.ratings).length, 'sélections,', seed.recent.length, 'matchs récents');
