// Laboratoire C1 : réglage et test de l'Elo européen. Données : lab/ucl (domestic.json + openfootball + football-data.org).
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {parseOpenfootball, makeResolver, runEuroElo, ordProbs, EURO_ELO_DEFAULTS} from './ucl-lib.mjs';
const L = f => new URL('../lab/ucl/' + f, import.meta.url);
const dom = JSON.parse(readFileSync(L('domestic.json')));
const known = {}; for (const [, c, h, a] of dom) { (known[c] ||= new Set()).add(h); known[c].add(a); }
const knownArr = Object.fromEntries(Object.entries(known).map(([c, s]) => [c, [...s]]));
const resolve = makeResolver(knownArr);
const SEASONS = ['2017-18', '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];
const cl = [];
for (const s of SEASONS) for (const m of parseOpenfootball(readFileSync(L(`of-${s}.txt`), 'utf8'))) cl.push({...m, season: s});
// 2026-27 : football-data.org (pays retrouvé par le nom de la saison précédente)
const countryOf = new Map(cl.map(m => [m.home, m.hc]).concat(cl.map(m => [m.away, m.ac])));
const fd = JSON.parse(readFileSync(L('fd-cl.json'))).filter(m => m.season === 2026 && m.status === 'FINISHED');
let fdSkip = 0;
for (const m of fd) { const hc = countryOf.get(m.home), ac = countryOf.get(m.away); if (!hc || !ac) { fdSkip++; continue; } cl.push({date: m.utc.slice(0, 10), home: m.home, away: m.away, hc, ac, hg: m.hg, ag: m.ag, neutral: false, season: '2026-27'}); }
const events = [];
for (const [d, c, h, a, hg, ag] of dom) events.push({date: d, h: c + '|' + h, a: c + '|' + a, hc: c, ac: c, hg, ag, cl: false});
for (const m of cl) events.push({date: m.date, h: resolve(m.home, m.hc), a: resolve(m.away, m.ac), hc: m.hc, ac: m.ac, hg: m.hg, ag: m.ag, cl: true, neutral: m.neutral, season: m.season});
events.sort((x, y) => x.date.localeCompare(y.date) || (x.cl - y.cl));
// Contrôle des noms : clubs de C1 non retrouvés dans leur championnat
const unk = new Set(); for (const e of events) if (e.cl) for (const [t, c] of [[e.h, e.hc], [e.a, e.ac]]) if (known[c] && !known[c].has(t.split('|')[1])) unk.add(t);
console.log('C1 :', cl.length, 'matchs ; 2026-27 ignorés (pays inconnu) :', fdSkip, '; clubs non retrouvés :', [...unk].join(' ; '));
export {events, cl};

// ---------- réglage
const TRAIN = s => s >= '2018-19' && s <= '2022-23', TEST = s => s >= '2023-24';
const COUNTRIES = ['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR', 'NED', 'BEL', 'SCO', 'TUR', 'GRE', 'AUT', 'SUI', 'DEN', 'SWE', 'RUS'];
// Pays absents de la C1 pendant le réglage (aucune donnée pour les régler) : niveau fixé à celui des pays comparables (Danemark, Suède, Autriche, Suisse).
const FIXED = {NOR: 1420, POL: 1420, ROU: 1420};
const idx = e => e.hg > e.ag ? 0 : e.hg === e.ag ? 1 : 2;
function evaluate(P, sel) {
  let ll = 0, br = 0, n = 0; const rows = [];
  runEuroElo(events, P, (e, rh, ra) => {
    if (e.hg == null || !sel(e.season)) return;
    const x = (rh + (e.neutral ? 0 : P.Hcl) - ra) / 100, p = ordProbs(x, P.ord), i = idx(e);
    ll += -Math.log(Math.max(1e-12, p[i])); br += p.reduce((t, v, k) => t + (v - (k === i ? 1 : 0)) ** 2, 0); n++;
    rows.push({x, p, i, hg: e.hg, ag: e.ag, season: e.season, h: e.h, a: e.a, neutral: e.neutral});
  });
  return {ll: ll / n, br: br / n, n, rows};
}
let LAMBDA = 0, FITSEL = null;
const pen = P => LAMBDA * COUNTRIES.concat(['__m']).reduce((t, c) => t + (((c === '__m' ? P.initMinor : P.init[c]) - 1500) / 100) ** 2, 0) / 1000;
function fit(P0, keys) {
  const SEL = FITSEL || TRAIN;
  const P = structuredClone(P0);
  const get = k => k.split('.').reduce((o, x) => o[x], P), set = (k, v) => { const ks = k.split('.'); const last = ks.pop(); ks.reduce((o, x) => o[x], P)[last] = v; };
  const step = Object.fromEntries(keys.map(k => [k, k.startsWith('init') ? 60 : k.startsWith('ord') ? 0.1 : 10]));
  let best = evaluate(P, SEL).ll + pen(P);
  for (let it = 0; it < 14; it++) {
    let improved = false;
    for (const k of keys) for (const dir of [1, -1]) {
      const v = get(k); set(k, v + dir * step[k]);
      const s = evaluate(P, SEL).ll + pen(P);
      if (s < best - 1e-6) { best = s; improved = true; } else set(k, v);
    }
    if (!improved) for (const k of keys) step[k] /= 2;
  }
  return {P, best};
}
const base = structuredClone(EURO_ELO_DEFAULTS);
for (const c of COUNTRIES) base.init[c] = 1500;
Object.assign(base.init, FIXED);
base.initMinor = 1500;
// A. Sans niveau de départ par pays (tous à 1500) : seuls Kcl, Hcl et la conversion sont réglés
const A = fit(base, ['Kcl', 'Hcl', 'ord.b', 'ord.t1', 'ord.t2']);
// B. Avec niveau de départ par pays
const KEYS = [...COUNTRIES.map(c => 'init.' + c), 'initMinor', 'Hcl', 'ord.b', 'ord.t1', 'ord.t2'];   // Kcl gardé (apprentissage entre pays)
// Choix de la prudence (pénalité sur les niveaux de départ) : réglage 2018-21, validation 2021-23 ; le test 2023-26 n'est pas utilisé.
const VAL = s => s >= '2021-22' && s <= '2022-23';
let bestLam = 0, bestVal = Infinity;
for (const lam of [0, 0.5, 1, 2, 4, 8]) { LAMBDA = lam; FITSEL = s => s >= '2018-19' && s <= '2020-21'; const f = fit(A.P, KEYS); const v = evaluate(f.P, VAL).ll; console.log('prudence', lam, 'validation', v.toFixed(4)); if (v < bestVal) { bestVal = v; bestLam = lam; } }
LAMBDA = bestLam; FITSEL = null;
const B0 = fit(A.P, KEYS);
const B = {P: B0.P, best: B0.best};
const freq = (() => { const r = evaluate(B.P, TRAIN).rows, f = [0, 0, 0]; r.forEach(x => f[x.i]++); return f.map(v => v / r.length); })();
const tA = evaluate(A.P, TEST), tB = evaluate(B.P, TEST);
const tBase = tB.rows.reduce((s, r) => s - Math.log(freq[r.i]), 0) / tB.n, bBase = tB.rows.reduce((s, r) => s + freq.reduce((t, v, k) => t + (v - (k === r.i ? 1 : 0)) ** 2, 0), 0) / tB.n;
// IC à 95 % de l'écart apparié B − référence
const ci = d => { const m = d.reduce((a, b) => a + b, 0) / d.length, v = d.reduce((a, b) => a + (b - m) ** 2, 0) / (d.length - 1); return [m, m - 1.96 * Math.sqrt(v / d.length), m + 1.96 * Math.sqrt(v / d.length)]; };
const brR = (p, i) => p.reduce((t, v, k) => t + (v - (k === i ? 1 : 0)) ** 2, 0);
const dBase = ci(tB.rows.map(r => brR(r.p, r.i) - brR(freq, r.i)));
const dA = ci(tB.rows.map((r, j) => brR(r.p, r.i) - brR(tA.rows[j].p, tA.rows[j].i)));
const out = {lambda: LAMBDA, train: {A: A.best, B: B.best}, test: {n: tB.n, logA: tA.ll, logB: tB.ll, logBase: tBase, brierA: tA.br, brierB: tB.br, brierBase: bBase, ecartBrierB_base: dBase, ecartBrierB_A: dA}, freq, P: B.P, PA: A.P};
console.log(JSON.stringify(out, (k, v) => typeof v === 'number' ? Math.round(v * 10000) / 10000 : v, 1));
writeFileSync(L('fit-result.json'), JSON.stringify(out, null, 1));
// calibration (test)
const bins = [[0, .2], [.2, .35], [.35, .5], [.5, .65], [.65, .8], [.8, 1.01]];
console.log('calibration test (annoncé / observé / n):', bins.map(([lo, hi]) => { let n = 0, sp = 0, so = 0; for (const r of tB.rows) r.p.forEach((v, j) => { if (v >= lo && v < hi) { n++; sp += v; so += +(j === r.i); } }); return `${lo}-${hi}: ${(sp / n * 100).toFixed(0)}/${(so / n * 100).toFixed(0)}/${n}`; }).join(' · '));

// ---------- buts attendus : log λdom = a + b·x, log λext = c − d·x (x = écart Elo / 100), réglé sur l'entraînement
const trainRows = evaluate(B.P, TRAIN).rows.filter(r => !r.neutral);
function poisFit(rows, sgn, key) {
  let a = 0.3, b = 0.1;
  for (let it = 0; it < 60; it++) { let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (const r of rows) { const x = sgn * r.x, y = r[key], l = Math.exp(a + b * x); g0 += y - l; g1 += (y - l) * x; h00 += l; h01 += l * x; h11 += l * x * x; }
    const det = h00 * h11 - h01 * h01; a += (h11 * g0 - h01 * g1) / det; b += (h00 * g1 - h01 * g0) / det; }
  return {a, b};
}
const GH = poisFit(trainRows, 1, 'hg'), GA = poisFit(trainRows, -1, 'ag');
console.log('buts : dom', GH, 'ext', GA);
const pois = (k, l) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
const testRows = tB.rows;
const mk = r => { const lh = Math.exp(GH.a + GH.b * r.x), la = Math.exp(GA.a - GA.b * r.x); let o25 = 0, o15 = 0, btts = 0, ph = [0, 0, 0];
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const p = pois(i, lh) * pois(j, la); if (i + j > 2) o25 += p; if (i + j > 1) o15 += p; if (i && j) btts += p; ph[i > j ? 0 : i === j ? 1 : 2] += p; }
  return {lh, la, o25, o15, btts, ph}; };
for (const [k, f] of [['o25', r => r.hg + r.ag > 2], ['o15', r => r.hg + r.ag > 1], ['btts', r => r.hg > 0 && r.ag > 0]]) {
  const ps = testRows.map(r => mk(r)[k]), ys = testRows.map(f), mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const bm = mean(ps.map((p, i) => (p - ys[i]) ** 2)), base = mean(ys.map(y => 0)) ; const fr = mean(trainRows.map(f));
  const bb = mean(ys.map(y => (fr - y) ** 2));
  console.log(k, 'annoncé', mean(ps).toFixed(3), 'observé', mean(ys).toFixed(3), 'Brier', bm.toFixed(4), 'naïf', bb.toFixed(4));
}
const bPo = testRows.reduce((s, r) => s + brR(mk(r).ph, r.i), 0) / testRows.length;
console.log('1N2 par Poisson : Brier', bPo.toFixed(4), '(ordonné :', tB.br.toFixed(4) + ')');
writeFileSync(L('fit-result.json'), JSON.stringify({...out, goals: {home: GH, away: GA}}, null, 1));

// ---------- graine pour la production : notes Elo au 1er juillet 2026 (avant la saison en cours) + buts réglés sur 2023-26
{
  const SEED_DATE = '2026-07-01';
  const evs = events.filter(e => e.date < SEED_DATE);
  const R = new Map(), C = new Map();
  for (const e of evs) { C.set(e.h, e.hc); C.set(e.a, e.ac); }
  const {ratings} = runEuroElo(evs, B.P);
  const recent = evaluate(B.P, s => s >= '2023-24' && s <= '2025-26').rows.filter(r => !r.neutral);
  const GH2 = poisFit(recent, 1, 'hg'), GA2 = poisFit(recent, -1, 'ag');
  const seed = {asOf: SEED_DATE, publish: true, note: 'Elo européen (championnats nationaux + C1, 2017-2026). Réglage sur les C1 2018-23, test sur 2023-26 : voir lab/RAPPORT-C1.md.',
    params: {...B.P, goals: {home: GH2, away: GA2}}, ratings: Object.fromEntries([...ratings].map(([k, v]) => [k, Math.round(v * 10) / 10]))};
  writeFileSync(new URL('../data/ucl-seed.json', import.meta.url), JSON.stringify(seed));
  console.log('graine :', ratings.size, 'clubs ; buts 2023-26', GH2, GA2);
  const top = [...ratings].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => k + ' ' + Math.round(v));
  console.log(top.join(' · '));
}

// ---------- contrôle : favoris très nets (test)
{
  const R = tB.rows; const grp = (f, lab) => { const g = R.filter(f); const ann = g.reduce((t, r) => t + Math.max(...r.p), 0) / g.length, obs = g.filter(r => r.p.indexOf(Math.max(...r.p)) === r.i).length / g.length; console.log('favoris forts', lab, 'n', g.length, 'annoncé', (ann * 100).toFixed(0), 'observé', (obs * 100).toFixed(0)); };
  grp(r => r.p[2] >= 0.7, 'extérieur ≥70 %'); grp(r => r.p[0] >= 0.7, 'domicile ≥70 %'); grp(r => Math.max(...r.p) >= 0.8, 'tous ≥80 %'); grp(r => Math.max(...r.p) >= 0.6 && Math.max(...r.p) < 0.8, 'tous 60-80 %');
}
