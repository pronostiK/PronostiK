// Laboratoire « autres marchés » : +/-1,5 et 2,5 buts, les deux équipes marquent, résultat à la mi-temps, score exact.
// Les probabilités viennent de la loi de Poisson du modèle v2 (aucun réglage nouveau). Version « recalibrée » :
// correction réglée sur la saison 2024-25 (DEV) uniquement, évaluée sur 2025-08 → (TEST). Comparaisons appariées, IC 95 %.
import {writeFileSync, mkdirSync} from 'node:fs';
import {createRatings} from '../model.mjs';
import {parseCSV} from '../csv.mjs';
import {LEAGUES} from '../leagues.mjs';

const SEASONS = ['2223', '2324', '2425', '2526', '2627'], DEV = '2024-08-01', TEST = '2025-08-01';
async function get(url) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, {signal: AbortSignal.timeout(30000)}); if (r.ok) return await r.text(); if (r.status === 404) return ''; } catch {} await new Promise(r => setTimeout(r, 1500)); } return ''; }
const pois = (k, l) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const ci = d => { const m = mean(d), se = Math.sqrt(d.reduce((s, v) => s + (v - m) ** 2, 0) / (d.length - 1) / d.length); return {diff: +m.toFixed(4), lo: +(m - 1.96 * se).toFixed(4), hi: +(m + 1.96 * se).toFixed(4)}; };
const b2 = (p, y) => (p - y) ** 2;   // Brier binaire

const rows = [];
for (const lg of LEAGUES) {
  let H = [];
  for (const s of SEASONS) for (const c of lg.csv) { const t = await get(`https://www.football-data.co.uk/mmz4281/${s}/${c}.csv`); if (t) H = H.concat(parseCSV(t, lg.code, {ou: true})); }
  H.sort((a, b) => a.date.localeCompare(b.date));
  const R = createRatings(H);
  for (const m of H.filter(m => m.division === 'L1' && m.date >= DEV)) {
    const r = R.predict(m.home, m.away, m.date); if (!r) continue;
    const g = [], h1 = [];
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) g.push({i, j, p: pois(i, r.lamH) * pois(j, r.lamA)});
    const S = f => g.filter(f).reduce((s, x) => s + x.p, 0);
    const lh = r.lamH * 0.45, la = r.lamA * 0.45;   // part des buts en 1re mi-temps (≈ 45 %, valeur standard, vérifiée plus bas)
    let ht = [0, 0, 0]; for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { const p = pois(i, lh) * pois(j, la); ht[i > j ? 0 : i === j ? 1 : 2] += p; }
    const top = g.slice().sort((a, b) => b.p - a.p)[0];
    const ou = m.o25 && m.u25 ? (1 / m.o25) / (1 / m.o25 + 1 / m.u25) : null;
    rows.push({lg: lg.code, date: m.date, per: m.date >= TEST ? 'test' : 'dev',
      p: {o15: S(x => x.i + x.j > 1), o25: S(x => x.i + x.j > 2), btts: S(x => x.i > 0 && x.j > 0), ht, score: top.p, scoreLab: `${top.i}-${top.j}`, ouMk: ou},
      y: {o15: +(m.hg + m.ag > 1), o25: +(m.hg + m.ag > 2), btts: +(m.hg > 0 && m.ag > 0), ht: m.hthg == null ? null : (m.hthg > m.htag ? 0 : m.hthg === m.htag ? 1 : 2), score: +(`${m.hg}-${m.ag}` === `${top.i}-${top.j}`), htGoals: m.hthg == null ? null : m.hthg + m.htag, goals: m.hg + m.ag}});
  }
}
const dev = rows.filter(r => r.per === 'dev'), test = rows.filter(r => r.per === 'test');
const out = {n: {dev: dev.length, test: test.length}, marches: {}};
// part réelle des buts en 1re mi-temps (DEV)
const devHT = dev.filter(r => r.y.htGoals != null); out.partButs1reMT = +(devHT.reduce((s, r) => s + r.y.htGoals, 0) / devHT.reduce((s, r) => s + r.y.goals, 0)).toFixed(3);
// recalibration logistique p' = σ(a + b·logit p), réglée sur DEV
const logit = p => Math.log(Math.min(1 - 1e-6, Math.max(1e-6, p)) / (1 - Math.min(1 - 1e-6, Math.max(1e-6, p))));
const sig = z => 1 / (1 + Math.exp(-z));
const calParams = {};
function fitCal(X, Y, key) { let a = 0, b = 1; for (let it = 0; it < 60; it++) { let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0; for (let i = 0; i < X.length; i++) { const x = logit(X[i]), p = sig(a + b * x), w = p * (1 - p), e = Y[i] - p; ga += e; gb += e * x; haa += w; hab += w * x; hbb += w * x * x; } const det = haa * hbb - hab * hab; a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det; } if (key) calParams[key] = {a, b}; return p => sig(a + b * logit(p)); }
for (const k of ['o15', 'o25', 'btts']) {
  const base = mean(dev.map(r => r.y[k]));                       // fréquence moyenne (référence naïve), réglée sur DEV
  const cal = fitCal(dev.map(r => r.p[k]), dev.map(r => r.y[k]), k);
  const T = test, mod = T.map(r => b2(r.p[k], r.y[k])), calb = T.map(r => b2(cal(r.p[k]), r.y[k])), nai = T.map(r => b2(base, r.y[k]));
  const res = {n: T.length, frequenceReelle: +mean(T.map(r => r.y[k])).toFixed(3), probMoyenneModele: +mean(T.map(r => r.p[k])).toFixed(3),
    brierModele: +mean(mod).toFixed(4), brierRecalibre: +mean(calb).toFixed(4), brierNaif: +mean(nai).toFixed(4),
    modeleMoinsNaif: ci(mod.map((v, i) => v - nai[i])), recalibreMoinsNaif: ci(calb.map((v, i) => v - nai[i]))};
  if (k === 'o25') { const M = T.filter(r => r.p.ouMk != null); res.marche = {n: M.length, brierMarche: +mean(M.map(r => b2(r.p.ouMk, r.y.o25))).toFixed(4), brierModele: +mean(M.map(r => b2(r.p.o25, r.y.o25))).toFixed(4), modeleMoinsMarche: ci(M.map(r => b2(r.p.o25, r.y.o25) - b2(r.p.ouMk, r.y.o25))), recalibreMoinsMarche: ci(M.map(r => b2(cal(r.p.o25), r.y.o25) - b2(r.p.ouMk, r.y.o25)))}; }
  const bins = [[0, .4], [.4, .5], [.5, .6], [.6, .7], [.7, .8], [.8, 1.01]];
  res.calibration = bins.map(([lo, hi]) => { const s = T.filter(r => r.p[k] >= lo && r.p[k] < hi); return {tranche: `${lo * 100}-${Math.min(100, hi * 100)}`, n: s.length, annonce: s.length ? +mean(s.map(r => r.p[k])).toFixed(3) : null, observe: s.length ? +mean(s.map(r => r.y[k])).toFixed(3) : null}; });
  out.marches[k] = res;
}
{ const T = test.filter(r => r.y.ht != null), D = dev.filter(r => r.y.ht != null);
  const base = [0, 1, 2].map(k => mean(D.map(r => +(r.y.ht === k))));
  const bri = (p, y) => p.reduce((s, v, k) => s + (v - (k === y ? 1 : 0)) ** 2, 0);
  const mod = T.map(r => bri(r.p.ht, r.y.ht)), nai = T.map(r => bri(base, r.y.ht));
  out.marches.miTemps = {n: T.length, brierModele: +mean(mod).toFixed(4), brierNaif: +mean(nai).toFixed(4), modeleMoinsNaif: ci(mod.map((v, i) => v - nai[i])), frequenceNulMT: +mean(T.map(r => +(r.y.ht === 1))).toFixed(3), probNulMTModele: +mean(T.map(r => r.p.ht[1])).toFixed(3)}; }
{ const T = test; out.marches.scoreExact = {n: T.length, probMoyenneAnnoncee: +mean(T.map(r => r.p.score)).toFixed(3), tauxReussite: +mean(T.map(r => r.y.score)).toFixed(3), scoresLesPlusProposes: Object.entries(T.reduce((a, r) => (a[r.p.scoreLab] = (a[r.p.scoreLab] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 4)}; }
out.recalibration = calParams;
mkdirSync('lab', {recursive: true});
writeFileSync('lab/markets-result.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
