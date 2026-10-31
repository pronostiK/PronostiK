// Laboratoire : un équivalent d'xG construit avec les tirs (gratuit, mêmes fichiers football-data.co.uk) améliore-t-il le modèle ?
// Lancé par .github/workflows/lab.yml ; écrit lab/xg-result.json.
import {writeFileSync, mkdirSync} from 'node:fs';
import {createRatings} from '../model.mjs';
import {parseCSV} from '../csv.mjs';
import {LEAGUES} from '../leagues.mjs';

const SEASONS = ['2223', '2324', '2425', '2526', '2627'], SPLIT = '2025-08-01';
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, {signal: AbortSignal.timeout(30000)}); if (r.ok) return await r.text(); if (r.status === 404) return ''; } catch {}
    await new Promise(r => setTimeout(r, 1500));
  }
  return '';
}
const out = {split: SPLIT, leagues: {}, notes: []};
const data = {};
for (const lg of LEAGUES) {
  let rows = [];
  for (const s of SEASONS) { const t = await get(`https://www.football-data.co.uk/mmz4281/${s}/${lg.csv[0]}.csv`); if (t) rows = rows.concat(parseCSV(t, lg.code, {shots: true})); }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  data[lg.code] = rows;
  const withShots = rows.filter(m => m.hst != null && m.hs != null);
  out.notes.push(`${lg.code}: ${rows.length} matchs, ${withShots.length} avec tirs`);
}

// 1) Coefficients : buts ≈ a·tirs cadrés + b·tirs non cadrés (moindres carrés, avant la date de coupure, tous championnats)
let Sxx = [[0, 0], [0, 0]], Sxy = [0, 0];
for (const lg in data) for (const m of data[lg]) {
  if (m.date >= SPLIT || m.hst == null || m.ast == null || m.hs == null || m.as == null) continue;
  for (const [sot, sh, g] of [[m.hst, m.hs, m.hg], [m.ast, m.as, m.ag]]) {
    const x = [sot, Math.max(0, sh - sot)];
    for (let i = 0; i < 2; i++) { Sxy[i] += x[i] * g; for (let j = 0; j < 2; j++) Sxx[i][j] += x[i] * x[j]; }
  }
}
const det = Sxx[0][0] * Sxx[1][1] - Sxx[0][1] * Sxx[1][0];
const coef = [(Sxy[0] * Sxx[1][1] - Sxy[1] * Sxx[0][1]) / det, (Sxx[0][0] * Sxy[1] - Sxx[1][0] * Sxy[0]) / det];
out.coef = {cadre: +coef[0].toFixed(4), nonCadre: +coef[1].toFixed(4)};
const xg = (sot, sh) => Math.max(0, coef[0] * sot + coef[1] * Math.max(0, sh - sot));

// 2) Évaluation : forces calculées sur buts / mélange / xG-tirs, scores sur les matchs après la coupure
const br = (p, i) => p.reduce((s, v, k) => s + (v - (k === i ? 1 : 0)) ** 2, 0);
const ALPHAS = [1, 0.7, 0.5, 0.3, 0];   // 1 = buts seuls, 0 = xG-tirs seuls
const tot = {n: 0, market: 0, b: ALPHAS.map(() => 0)};
for (const lg in data) {
  const rows = data[lg], res = {n: 0, market: 0, b: ALPHAS.map(() => 0)};
  const models = ALPHAS.map(a => createRatings(rows.map(m => {
    if (m.hst == null || m.ast == null || m.hs == null || m.as == null) return m;
    return {...m, hg: a * m.hg + (1 - a) * xg(m.hst, m.hs), ag: a * m.ag + (1 - a) * xg(m.ast, m.as)};
  })));
  for (const m of rows.filter(m => m.date >= SPLIT)) {
    const o = [m.avgH, m.avgD, m.avgA].map(Number); if (!o.every(v => v > 1)) continue;
    const ps = models.map(M => M.predict(m.home, m.away, m.date)); if (ps.some(p => !p)) continue;
    const raw = o.map(v => 1 / v), s = raw.reduce((a, b) => a + b), mk = raw.map(v => v / s), i = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
    res.n++; res.market += br(mk, i); ps.forEach((p, k) => res.b[k] += br(p.p, i));
  }
  out.leagues[lg] = {n: res.n, marche: +(res.market / res.n).toFixed(4), ...Object.fromEntries(ALPHAS.map((a, k) => ['alpha_' + a, +(res.b[k] / res.n).toFixed(4)]))};
  tot.n += res.n; tot.market += res.market; res.b.forEach((v, k) => tot.b[k] += v);
}
out.total = {n: tot.n, marche: +(tot.market / tot.n).toFixed(4), ...Object.fromEntries(ALPHAS.map((a, k) => ['alpha_' + a, +(tot.b[k] / tot.n).toFixed(4)]))};
mkdirSync('lab', {recursive: true});
writeFileSync('lab/xg-result.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
