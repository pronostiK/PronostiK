// Étude Elo (branche experience-elo) : A = Poisson v2, B = Elo football, C = hybride Elo + v2.
// Réglages uniquement sur la saison 2024-25 (DEV) ; test final unique à partir du 2025-08-01 (TEST), mêmes matchs que le labo.
// Aucune donnée future : pour une date donnée, Elo et v2 n'utilisent que les matchs des jours précédents.
// Lancer : node scripts/lab-elo.mjs → lab/RAPPORT-ELO.md et lab/elo-result.json
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createRatings} from '../model.mjs';

const ROOT = new URL('../', import.meta.url);
const hist = JSON.parse(readFileSync(new URL('data/history.json', ROOT)));
const DEV_START = '2024-08-01', TEST_START = '2025-08-01';
const LG = {FL1: 'Ligue 1', PL: 'Premier League', BL1: 'Bundesliga', SA: 'Serie A', PD: 'La Liga'};
const out = (y, p) => y === 0 ? p[0] : y === 1 ? p[1] : p[2];
const brier = (p, y) => p.reduce((s, v, k) => s + (v - (k === y ? 1 : 0)) ** 2, 0);
const logl = (p, y) => -Math.log(Math.max(1e-12, out(y, p)));
const sig = z => 1 / (1 + Math.exp(-z));
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

// ---------- Matchs évalués : 1re division, cotes de clôture, prédiction v2 disponible
const games = {};   // par championnat : tous les matchs de 1re division triés (pour Elo)
const evalRows = []; // matchs DEV et TEST évalués
for (const lg of Object.keys(LG)) {
  const H = hist.filter(m => m.lg === lg).sort((a, b) => a.date.localeCompare(b.date) || a.home.localeCompare(b.home));
  games[lg] = H.filter(m => m.division === 'L1');
  const R = createRatings(H);
  for (const m of games[lg]) {
    if (m.date < DEV_START) continue;
    const o = [m.avgH, m.avgD, m.avgA].map(Number);
    if (!o.every(v => Number.isFinite(v) && v > 1)) continue;
    const r = R.predict(m.home, m.away, m.date); if (!r) continue;
    const raw = o.map(v => 1 / v), s = raw.reduce((a, b) => a + b, 0);
    evalRows.push({lg, date: m.date, home: m.home, away: m.away, y: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2, v2: r.p, mk: raw.map(v => v / s), period: m.date >= TEST_START ? 'test' : 'dev'});
  }
}
const keyOf = (lg, d, h, a) => `${lg}|${d}|${h}|${a}`;

// ---------- B. Elo football
// Mise à jour : r += K · G(écart) · (S − E), E = 1 / (1 + 10^(−(rDom + H − rExt)/400)), G = 1 (0-1 but), 1,5 (2), (11 + n)/8 (n ≥ 3).
// Nouvelle équipe en 1re division : note = moyenne des 3 plus faibles notes actuelles (elle remplace un relégué).
// Début de saison (1er août) : rappel vers la moyenne, r = m + reg · (r − m).
// Les matchs d'une même date sont tous prédits AVANT d'intégrer leurs résultats.
function runElo(lg, P) {
  const r = new Map(), pred = new Map(); let season = null;
  const G = gd => gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
  const byDate = new Map(); for (const m of games[lg]) { if (!byDate.has(m.date)) byDate.set(m.date, []); byDate.get(m.date).push(m); }
  for (const [date, ms] of byDate) {
    const se = +date.slice(5, 7) >= 8 ? date.slice(0, 4) : String(+date.slice(0, 4) - 1);
    if (season !== null && se !== season && r.size) { const mu = mean([...r.values()]); for (const [t, v] of r) r.set(t, mu + P.reg * (v - mu)); }
    season = se;
    for (const m of ms) for (const t of [m.home, m.away]) if (!r.has(t)) { const v = [...r.values()].sort((a, b) => a - b); r.set(t, v.length >= 3 ? mean(v.slice(0, 3)) : 1500); }
    for (const m of ms) pred.set(keyOf(lg, m.date, m.home, m.away), (r.get(m.home) + P.H - r.get(m.away)) / 100);
    for (const m of ms) {
      const d = r.get(m.home) + P.H - r.get(m.away), E = 1 / (1 + 10 ** (-d / 400)), S = m.hg > m.ag ? 1 : m.hg === m.ag ? 0.5 : 0, k = P.K * G(Math.abs(m.hg - m.ag));
      r.set(m.home, r.get(m.home) + k * (S - E)); r.set(m.away, r.get(m.away) - k * (S - E));
    }
  }
  return pred;
}
// Conversion écart Elo → 1/N/2 : logit ordonné, P(ext) = σ(t1 − b·x), P(ext ou nul) = σ(t2 − b·x)
const ordProb = (x, q) => { const pA = sig(q.t1 - q.b * x), pAD = sig(q.t2 - q.b * x); return [1 - pAD, Math.max(1e-9, pAD - pA), pA]; };
function fitOrd(X, Y) {
  let q = {b: 0.5, t1: -1, t2: 0.2};
  for (let it = 0; it < 3000; it++) {
    let gb = 0, g1 = 0, g2 = 0;
    for (let i = 0; i < X.length; i++) {
      const x = X[i], y = Y[i], a = sig(q.t1 - q.b * x), c = sig(q.t2 - q.b * x);
      // dérivées de log P(y)
      if (y === 2) { const d = 1 - a; g1 += d; gb -= d * x; }
      else if (y === 0) { const d = -c; g2 += d; gb -= d * x; }
      else { const p = Math.max(1e-9, c - a), dc = c * (1 - c) / p, da = a * (1 - a) / p; g2 += dc; g1 -= da; gb -= (dc - da) * x; }
    }
    const n = X.length, lr = 1.5; q = {b: q.b + lr * gb / n, t1: q.t1 + lr * g1 / n, t2: q.t2 + lr * g2 / n};
    if (q.t2 < q.t1 + 1e-3) q.t2 = q.t1 + 1e-3;
  }
  return q;
}
// ---------- Réglage d'Elo sur DEV uniquement (grille), score = log-loss DEV
const DEV = evalRows.filter(r => r.period === 'dev'), TEST = evalRows.filter(r => r.period === 'test');
const grid = [];
for (const K of [15, 20, 25, 30, 40]) for (const H of [40, 60, 80]) for (const reg of [0.7, 0.85, 1]) grid.push({K, H, reg});
let best = null;
const eloCache = new Map();
const eloAll = P => { const k = JSON.stringify(P); if (!eloCache.has(k)) { const m = new Map(); for (const lg of Object.keys(LG)) for (const [a, b] of runElo(lg, P)) m.set(a, b); eloCache.set(k, m); } return eloCache.get(k); };
for (const P of grid) {
  const E = eloAll(P), X = DEV.map(r => E.get(keyOf(r.lg, r.date, r.home, r.away))), Y = DEV.map(r => r.y);
  const q = fitOrd(X, Y), ll = mean(DEV.map((r, i) => logl(ordProb(X[i], q), r.y)));
  if (!best || ll < best.ll) best = {P, q, ll};
}
const Ebest = eloAll(best.P);
const xOf = r => Ebest.get(keyOf(r.lg, r.date, r.home, r.away));
for (const r of evalRows) r.elo = ordProb(xOf(r), best.q);

// ---------- C. Hybride : mélange log-linéaire p ∝ exp(w1·log p_v2 + w2·log p_Elo + βdom·[1] + βnul·[N]), réglé sur DEV
function fitPool(S) {
  let w = [1, 0, 0, 0];
  const f = (r, w) => { const z = [0, 1, 2].map(k => w[0] * Math.log(Math.max(1e-9, r.v2[k])) + w[1] * Math.log(Math.max(1e-9, r.elo[k])) + (k === 0 ? w[2] : 0) + (k === 1 ? w[3] : 0)); const mx = Math.max(...z), e = z.map(v => Math.exp(v - mx)), s = e[0] + e[1] + e[2]; return e.map(v => v / s); };
  for (let it = 0; it < 3000; it++) {
    const g = [0, 0, 0, 0];
    for (const r of S) {
      const p = f(r, w), l1 = r.v2.map(v => Math.log(Math.max(1e-9, v))), l2 = r.elo.map(v => Math.log(Math.max(1e-9, v)));
      g[0] += l1[r.y] - (p[0] * l1[0] + p[1] * l1[1] + p[2] * l1[2]); g[1] += l2[r.y] - (p[0] * l2[0] + p[1] * l2[1] + p[2] * l2[2]);
      g[2] += (r.y === 0) - p[0]; g[3] += (r.y === 1) - p[1];
    }
    w = w.map((v, i) => v + 0.5 * g[i] / S.length);
  }
  return {w, f: r => f(r, w)};
}
const pool = fitPool(DEV);
for (const r of evalRows) r.hyb = pool.f(r);

// ---------- Évaluation sur TEST (et rappel sur DEV, en échantillon)
function cmp(S, a, b) { const d = S.map(r => brier(r[a], r.y) - brier(r[b], r.y)), l = S.map(r => logl(r[a], r.y) - logl(r[b], r.y)); const ci = v => { const m = mean(v), se = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1) / v.length); return {diff: m, lo: m - 1.96 * se, hi: m + 1.96 * se}; }; return {brier: ci(d), log: ci(l)}; }
function slope(S, who) {
  const X = [], Y = []; for (const r of S) r[who].forEach((p, k) => { const q = Math.min(1 - 1e-6, Math.max(1e-6, p)); X.push(Math.log(q / (1 - q))); Y.push(+(k === r.y)); });
  let a = 0, b = 1; for (let it = 0; it < 50; it++) { let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0; for (let i = 0; i < X.length; i++) { const p = sig(a + b * X[i]), w = p * (1 - p), e = Y[i] - p; ga += e; gb += e * X[i]; haa += w; hab += w * X[i]; hbb += w * X[i] * X[i]; } const det = haa * hbb - hab * hab; a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det; }
  return b;
}
const MODELS = {v2: 'A. Poisson v2', elo: 'B. Elo', hyb: 'C. Hybride', mk: 'Marché'};
function block(S) {
  const res = {n: S.length};
  for (const k of Object.keys(MODELS)) res[k] = {brier: mean(S.map(r => brier(r[k], r.y))), log: mean(S.map(r => logl(r[k], r.y))), pente: slope(S, k)};
  res.BvsA = cmp(S, 'elo', 'v2'); res.CvsA = cmp(S, 'hyb', 'v2'); res.CvsMk = cmp(S, 'hyb', 'mk'); res.BvsMk = cmp(S, 'elo', 'mk');
  return res;
}
const results = {test: {Tous: block(TEST)}, dev: {Tous: block(DEV)}};
for (const [c, n] of Object.entries(LG)) results.test[n] = block(TEST.filter(r => r.lg === c));
const bins = [[0, .2], [.2, .3], [.3, .4], [.4, .5], [.5, .6], [.6, .7], [.7, 1.01]];
const calib = who => bins.map(([lo, hi]) => { let n = 0, sp = 0, so = 0; for (const r of TEST) r[who].forEach((p, k) => { if (p >= lo && p < hi) { n++; sp += p; so += +(k === r.y); } }); return {lo, hi, n, pred: n ? sp / n : null, obs: n ? so / n : null}; });

const json = {reglage: {grille: grid.length, meilleur: best.P, logLossDev: best.ll, logitOrdonne: best.q, hybride: {poidsV2: pool.w[0], poidsElo: pool.w[1], betaDom: pool.w[2], betaNul: pool.w[3]}},
  echantillons: {dev: DEV.length, test: TEST.length}, resultats: results, calibration: Object.fromEntries(Object.keys(MODELS).map(k => [k, calib(k)]))};
mkdirSync(new URL('lab/', ROOT), {recursive: true});
writeFileSync(new URL('lab/elo-result.json', ROOT), JSON.stringify(json, null, 1));

// ---------- Rapport
const f4 = v => v.toFixed(4).replace('.', ','), sg = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(4).replace('.', ',');
const ci = c => `${sg(c.diff)} [${sg(c.lo)} ; ${sg(c.hi)}]`;
const verdict = c => c.hi < 0 ? 'meilleur' : c.lo > 0 ? 'moins bon' : 'non significatif';
const T = results.test.Tous;
let md = `# Étude Elo : Poisson v2 (A), Elo (B), hybride (C)

Généré par \`scripts/lab-elo.mjs\` (branche \`experience-elo\`). La production n'est pas modifiée.

## Synthèse

- **B (Elo seul) contre A (v2)** : écart de Brier ${ci(T.BvsA.brier)}, soit ${verdict(T.BvsA.brier)} ; log-loss ${ci(T.BvsA.log)}.
- **C (hybride) contre A (v2)** : Brier ${ci(T.CvsA.brier)}, soit ${verdict(T.CvsA.brier)} ; log-loss ${ci(T.CvsA.log)}.
- **C contre le marché** : Brier ${ci(T.CvsMk.brier)}, soit ${verdict(T.CvsMk.brier)}.
- Les écarts sont des différences appariées (négatif = mieux que la référence), avec un IC à 95 %, sur ${TEST.length} matchs de test.

## Protocole

- **Elo** : une note par équipe et par championnat. Avantage du terrain H. Mise à jour pondérée par l'écart de buts (1 ; 1,5 ; (11+n)/8). Un promu démarre à la moyenne des 3 plus faibles notes. Rappel vers la moyenne à chaque 1er août. Les matchs d'une même date sont prédits avant d'intégrer leurs résultats.
- **Conversion en probabilités 1/N/2** : logit ordonné sur l'écart de notes.
- **Hybride** : mélange log-linéaire des probabilités v2 et Elo, plus deux constantes (domicile, nul).
- **Réglages** : uniquement sur ${DEV.length} matchs de la saison 2024-25 (DEV). Grille de ${grid.length} combinaisons (K, H, rappel), retenue : K = ${best.P.K}, H = ${best.P.H}, rappel = ${best.P.reg}. Hybride : poids v2 = ${pool.w[0].toFixed(3)}, poids Elo = ${pool.w[1].toFixed(3)}.
- **Test final** : ${TEST.length} matchs à partir du ${TEST_START} (les mêmes que dans les autres études), évalués une seule fois, sur les mêmes matchs pour A, B, C et le marché.

## Résultats sur le test final

| Championnat | n | Brier A | Brier B | Brier C | Brier marché | B − A [IC 95 %] | C − A [IC 95 %] | C − marché [IC 95 %] |
|---|---|---|---|---|---|---|---|---|
${Object.entries(results.test).map(([n, b]) => `| ${n === 'Tous' ? '**Tous**' : n} | ${b.n} | ${f4(b.v2.brier)} | ${f4(b.elo.brier)} | ${f4(b.hyb.brier)} | ${f4(b.mk.brier)} | ${ci(b.BvsA.brier)} | ${ci(b.CvsA.brier)} | ${ci(b.CvsMk.brier)} |`).join('\n')}

### Log-loss

| Championnat | Log-loss A | Log-loss B | Log-loss C | Log-loss marché | B − A [IC 95 %] | C − A [IC 95 %] |
|---|---|---|---|---|---|---|
${Object.entries(results.test).map(([n, b]) => `| ${n === 'Tous' ? '**Tous**' : n} | ${f4(b.v2.log)} | ${f4(b.elo.log)} | ${f4(b.hyb.log)} | ${f4(b.mk.log)} | ${ci(b.BvsA.log)} | ${ci(b.CvsA.log)} |`).join('\n')}

## Calibration (test, issues empilées)

Pente de calibration (1 = parfait, au-dessus de 1 = trop prudent) : A ${T.v2.pente.toFixed(2)}, B ${T.elo.pente.toFixed(2)}, C ${T.hyb.pente.toFixed(2)}, marché ${T.mk.pente.toFixed(2)}.

| Tranche | A : annoncé → observé | B : annoncé → observé | C : annoncé → observé |
|---|---|---|---|
${bins.map((b, i) => { const c = k => { const x = json.calibration[k][i]; return x.n ? `${(100 * x.pred).toFixed(1)} → ${(100 * x.obs).toFixed(1)} % (n = ${x.n})` : '—'; }; return `| ${Math.round(b[0] * 100)}–${Math.min(100, Math.round(b[1] * 100))} % | ${c('v2')} | ${c('elo')} | ${c('hyb')} |`; }).join('\n')}

## Limites

- La période de test a déjà été consultée dans des études précédentes (pas pour régler Elo). Les matchs joués après le 1er novembre 2026 serviront de confirmation.
- Elo démarre en août 2023 (début de l'historique). En 2024-25, les notes n'avaient qu'une saison de recul.
- Le réglage d'Elo (45 combinaisons) et de l'hybride (4 paramètres) a été fait sur DEV, avec un léger optimisme sur DEV mais aucun effet sur le test.
`;
writeFileSync(new URL('lab/RAPPORT-ELO.md', ROOT), md);
console.log(md);
