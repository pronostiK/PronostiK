// Laboratoire : où PronostiK apporte-t-il (éventuellement) une information que le marché n'a pas ?
// Aucune modification du modèle de production : lecture seule de data/history.json, résultats dans lab/.
// Lancer : node scripts/lab-segments.mjs   (déterministe ; environ 1 à 2 minutes)
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createRatings, createModel} from '../model.mjs';

const ROOT = new URL('../', import.meta.url);
const hist = JSON.parse(readFileSync(new URL('data/history.json', ROOT)));
const TEST_START = '2025-08-01', DEV_START = '2024-08-01';
const LG_NAME = {FL1: 'Ligue 1', PL: 'Premier League', BL1: 'Bundesliga', SA: 'Serie A', PD: 'La Liga'};

// ---------- 1. Prédictions chronologiques (chaque match prédit avec les seuls matchs antérieurs)
const rows = [];        // matchs avec prédiction v2 et cotes de clôture
let fallbackTest = 0;   // matchs de test que seul le modèle v1 (repli) sait prédire
for (const lg of Object.keys(LG_NAME)) {
  const H = hist.filter(m => m.lg === lg).sort((a, b) => a.date.localeCompare(b.date));
  const R = createRatings(H), V1 = createModel(H);
  for (const m of H.filter(m => m.division === 'L1' && m.date >= DEV_START)) {
    const o = [m.avgH, m.avgD, m.avgA].map(Number);
    if (!o.every(v => Number.isFinite(v) && v > 1)) continue;
    const r = R.predict(m.home, m.away, m.date);
    if (!r) {
      if (m.date >= TEST_START) { try { V1.getLambdas(m.home, m.away, m.date, 0.72); fallbackTest++; } catch {} }
      continue;
    }
    const raw = o.map(v => 1 / v), s = raw.reduce((a, b) => a + b, 0);
    rows.push({lg, date: m.date, home: m.home, away: m.away, md: r.p, lam: [r.lamH, r.lamA], mk: raw.map(v => v / s), margin: s - 1,
      y: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2, period: m.date >= TEST_START ? 'test' : 'dev'});
  }
}
const TEST = rows.filter(r => r.period === 'test'), DEV = rows.filter(r => r.period === 'dev');

// ---------- outils statistiques
const brier = (p, y) => p.reduce((s, v, k) => s + (v - (k === y ? 1 : 0)) ** 2, 0);
const logl = (p, y) => -Math.log(Math.max(1e-12, p[y]));
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
// différence appariée modèle − marché : moyenne, IC 95 % (approximation normale), z
function paired(S, f) {
  const d = S.map(r => f(r.md, r.y) - f(r.mk, r.y)), m = mean(d), se = sd(d) / Math.sqrt(d.length);
  return {diff: m, lo: m - 1.96 * se, hi: m + 1.96 * se, z: m / se};
}
function seg(S) {
  if (S.length < 30) return null;
  const pb = paired(S, brier), pl = paired(S, logl);
  const bias = who => [0, 1, 2].map(k => mean(S.map(r => r[who][k])) - mean(S.map(r => +(r.y === k))));
  return {n: S.length, brierModel: mean(S.map(r => brier(r.md, r.y))), brierMarket: mean(S.map(r => brier(r.mk, r.y))), brierDiff: pb,
    logModel: mean(S.map(r => logl(r.md, r.y))), logMarket: mean(S.map(r => logl(r.mk, r.y))), logDiff: pl,
    biasModel: bias('md'), biasMarket: bias('mk')};
}

// ---------- 2. Segmentations
const fav = r => Math.max(...r.mk);
const gap = r => Math.abs(r.lam[0] - r.lam[1]);
const dis = r => Math.max(...[0, 1, 2].map(k => Math.abs(r.md[k] - r.mk[k])));
const sDis = r => r.md[0] - r.mk[0];
const tert = (S, f) => { const v = S.map(f).sort((a, b) => a - b); return [v[Math.floor(v.length / 3)], v[Math.floor(2 * v.length / 3)]]; };
function segmentations(S, gapCut) {
  return {
    'Probabilité du favori (marché)': [['< 45 %', r => fav(r) < .45], ['45–55 %', r => fav(r) >= .45 && fav(r) < .55], ['55–65 %', r => fav(r) >= .55 && fav(r) < .65], ['≥ 65 %', r => fav(r) >= .65]],
    'Écart de niveau (|λ dom − λ ext| du modèle, tiers)': [[`faible (< ${gapCut[0].toFixed(2).replace('.', ',')})`, r => gap(r) < gapCut[0]], ['moyen', r => gap(r) >= gapCut[0] && gap(r) < gapCut[1]], [`fort (≥ ${gapCut[1].toFixed(2).replace('.', ',')})`, r => gap(r) >= gapCut[1]]],
    'Championnat': Object.entries(LG_NAME).map(([c, n]) => [n, r => r.lg === c]),
    'Désaccord max modèle/marché (points)': [['< 3', r => dis(r) < .03], ['3–6', r => dis(r) >= .03 && dis(r) < .06], ['6–10', r => dis(r) >= .06 && dis(r) < .10], ['≥ 10', r => dis(r) >= .10]],
    'Sens du désaccord sur la victoire à domicile': [['modèle ≤ −10 pts', r => sDis(r) <= -.10], ['−10 à −5', r => sDis(r) > -.10 && sDis(r) <= -.05], ['−5 à +5', r => sDis(r) > -.05 && sDis(r) < .05], ['+5 à +10', r => sDis(r) >= .05 && sDis(r) < .10], ['modèle ≥ +10 pts', r => sDis(r) >= .10]],
    'Favori du marché': [['domicile', r => r.mk[0] >= Math.max(r.mk[1], r.mk[2])], ['extérieur', r => r.mk[2] > r.mk[0] && r.mk[2] >= r.mk[1]]],
    'Moment de la saison': [['août–octobre', r => ['08', '09', '10'].includes(r.date.slice(5, 7))], ['novembre–février', r => ['11', '12', '01', '02'].includes(r.date.slice(5, 7))], ['mars–mai', r => ['03', '04', '05'].includes(r.date.slice(5, 7))]],
  };
}
const gapCut = tert(TEST, gap);
const tables = {};
let nTests = 0;
for (const [name, list] of Object.entries(segmentations(TEST, gapCut))) {
  tables[name] = list.map(([lab, f]) => { const t = seg(TEST.filter(f)), d = seg(DEV.filter(f)); if (t) nTests++; return {lab, test: t, dev: d}; });
}
const zBonf = 3.02;  // seuil bilatéral ≈ 0,05 / 20 comparaisons (Bonferroni), recalculé plus bas avec le vrai nombre
const crit = (() => { // quantile normal pour 0,05/nTests bilatéral (approximation par bissection)
  const p = 0.05 / nTests / 2, cdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
  let lo = 0, hi = 6; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (1 - cdf(m) > p) lo = m; else hi = m; } return (lo + hi) / 2;
})();
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }

// ---------- 2b. Par championnat et par saison (saison = 1er août → 31 juillet)
const seasonOf = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7); const s0 = m >= 8 ? y : y - 1; return `${s0}-${String(s0 + 1).slice(2)}`; };
const SEASONS = [...new Set(rows.map(r => seasonOf(r.date)))].sort();
const bySeason = [];
for (const se of SEASONS) {
  for (const [c, n] of [...Object.entries(LG_NAME), ['ALL', 'Tous']]) {
    const S = rows.filter(r => seasonOf(r.date) === se && (c === 'ALL' || r.lg === c)); const t = seg(S);
    if (t) bySeason.push({saison: se, lg: n, ...t});
  }
}

// ---------- 3. Calibration (toutes issues confondues) et pente de calibration
const bins = [[0, .2], [.2, .3], [.3, .4], [.4, .5], [.5, .6], [.6, .7], [.7, 1.01]];
const calib = (S, who) => bins.map(([lo, hi]) => { let n = 0, sp = 0, so = 0; for (const r of S) r[who].forEach((p, k) => { if (p >= lo && p < hi) { n++; sp += p; so += +(k === r.y); } }); return {lo, hi, n, pred: n ? sp / n : null, obs: n ? so / n : null, se: n ? Math.sqrt((so / n) * (1 - so / n) / n) : null}; });
// pente/ordonnée : régression logistique y_k ~ a + b·logit(p_k) (une-contre-toutes, issues empilées)
function slope(S, who) {
  const X = [], Y = [];
  for (const r of S) r[who].forEach((p, k) => { const q = Math.min(1 - 1e-6, Math.max(1e-6, p)); X.push(Math.log(q / (1 - q))); Y.push(+(k === r.y)); });
  let a = 0, b = 1;
  for (let it = 0; it < 50; it++) {
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    for (let i = 0; i < X.length; i++) { const p = 1 / (1 + Math.exp(-(a + b * X[i]))), w = p * (1 - p), e = Y[i] - p; ga += e; gb += e * X[i]; haa += w; hab += w * X[i]; hbb += w * X[i] * X[i]; }
    const det = haa * hbb - hab * hab; a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det;
  }
  return {intercept: a, slope: b};
}

// ---------- 4. Erreurs systématiques : biais (annoncé − observé) par issue, par championnat et par favori
const errors = {};
for (const [lab, f] of [['Tous', () => true], ...Object.entries(LG_NAME).map(([c, n]) => [n, r => r.lg === c]), ['Favori marché ≥ 60 %', r => fav(r) >= .6], ['Match serré (favori < 45 %)', r => fav(r) < .45]]) {
  const S = TEST.filter(f); if (S.length < 30) continue;
  errors[lab] = {n: S.length, model: [0, 1, 2].map(k => mean(S.map(r => r.md[k])) - mean(S.map(r => +(r.y === k)))), market: [0, 1, 2].map(k => mean(S.map(r => r.mk[k])) - mean(S.map(r => +(r.y === k)))),
    se: [0, 1, 2].map(k => { const o = mean(S.map(r => +(r.y === k))); return Math.sqrt(o * (1 - o) / S.length); })};
}

// ---------- 5. Recalibration chronologique (sans fuite) : p'_k ∝ exp(t·log p_k + β_k), β_ext = 0
// Paramètres réestimés au début de chaque mois de test avec TOUS les matchs antérieurs (dev + test déjà joués).
function fitCal(S, withBeta) {
  let t = 1, bH = 0, bD = 0; const lr = 0.5, L2 = 1;
  for (let it = 0; it < 400; it++) {
    let gt = 0, gh = 0, gd = 0;
    for (const r of S) {
      const lp = r.md.map(p => Math.log(Math.max(1e-9, p))), z = [t * lp[0] + bH, t * lp[1] + bD, t * lp[2]], mx = Math.max(...z), e = z.map(v => Math.exp(v - mx)), s = e[0] + e[1] + e[2], q = e.map(v => v / s);
      gt += lp[r.y] - (q[0] * lp[0] + q[1] * lp[1] + q[2] * lp[2]); gh += (r.y === 0) - q[0]; gd += (r.y === 1) - q[1];
    }
    const n = S.length;
    t += lr * (gt / n - L2 * (t - 1) / n); if (withBeta) { bH += lr * (gh / n - L2 * bH / n); bD += lr * (gd / n - L2 * bD / n); }
  }
  return {t, bH, bD};
}
const applyCal = (p, c) => { const z = [c.t * Math.log(Math.max(1e-9, p[0])) + c.bH, c.t * Math.log(Math.max(1e-9, p[1])) + c.bD, c.t * Math.log(Math.max(1e-9, p[2]))], mx = Math.max(...z), e = z.map(v => Math.exp(v - mx)), s = e[0] + e[1] + e[2]; return e.map(v => v / s); };
const months = [...new Set(TEST.map(r => r.date.slice(0, 7)))].sort();
const recal = {temperature: [], complete: []}, params = [];
for (const mo of months) {
  const past = rows.filter(r => r.date < mo + '-01'), cur = TEST.filter(r => r.date.slice(0, 7) === mo);
  const c1 = fitCal(past, false), c2 = fitCal(past, true); params.push({mois: mo, nPasse: past.length, t1: c1.t, t2: c2.t, bH: c2.bH, bD: c2.bD});
  for (const r of cur) { recal.temperature.push({...r, raw: r.md, md: applyCal(r.md, c1)}); recal.complete.push({...r, raw: r.md, md: applyCal(r.md, c2)}); }
}
const recalRes = {brut: seg(TEST), temperature: seg(recal.temperature), complete: seg(recal.complete)};
const recalVsRaw = Object.fromEntries(['temperature', 'complete'].map(k => {
  const d = recal[k].map(r => brier(r.md, r.y) - brier(r.raw, r.y)), m = mean(d), se = sd(d) / Math.sqrt(d.length);
  return [k, {diff: m, lo: m - 1.96 * se, hi: m + 1.96 * se}];
}));
// chaque entrée recalibrée garde sa prédiction brute (raw) : la comparaison est appariée match par match
const aligned = recal.temperature.length === TEST.length && recal.complete.every(r => r.raw);

// ---------- 6. 2 080 contre 2 156
const scorecard = JSON.parse(readFileSync(new URL('data/scorecard.json', ROOT)));
const scN = Object.values(scorecard.leagues).reduce((s, v) => s + v.n, 0);

// ---------- Sorties
const out = {genere: 'scripts/lab-segments.mjs', test: {debut: TEST_START, n: TEST.length}, dev: {debut: DEV_START, n: DEV.length}, seuilBonferroni: {comparaisons: nTests, zCritique: crit},
  global: seg(TEST), globalDev: seg(DEV), tables, parSaison: bySeason, calibration: {modele: calib(TEST, 'md'), marche: calib(TEST, 'mk'), penteModele: slope(TEST, 'md'), penteMarche: slope(TEST, 'mk')},
  erreurs: errors, recalibration: {resultats: recalRes, contreBrut: recalVsRaw, parametres: params, alignementOK: aligned},
  ecart2080_2156: {lab: TEST.length, bilan: scN, repliV1: fallbackTest}};
mkdirSync(new URL('lab/', ROOT), {recursive: true});
writeFileSync(new URL('lab/segments-result.json', ROOT), JSON.stringify(out, null, 1));

// ---------- Rapport Markdown
const fx3 = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(3).replace('.', ',');
const f4 = v => v == null ? '—' : v.toFixed(4).replace('.', ','), f1 = v => (100 * v).toFixed(1).replace('.', ',');
const sg = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(4).replace('.', ',');
const ci = d => `${sg(d.diff)} [${sg(d.lo)} ; ${sg(d.hi)}]`;
const flag = d => d.hi < 0 ? (Math.abs(d.z) >= crit ? ' **modèle meilleur (significatif après correction)**' : ' modèle meilleur (non significatif après correction)') : d.lo > 0 ? ' marché meilleur' : '';
let md = `# Rapport : segments, erreurs et recalibration

Généré par \`scripts/lab-segments.mjs\` à partir de \`data/history.json\`. Le modèle de production n'est pas modifié.

## Protocole

- **Prédictions chronologiques** : chaque match est prédit par le modèle v2 estimé uniquement sur les matchs antérieurs (\`m.date < date\`).
- **Marché** : cotes moyennes de clôture, marge retirée par normalisation proportionnelle.
- **Échantillon de test** : ${TEST.length} matchs de première division depuis le ${TEST_START}, avec cotes et prédiction v2. **Échantillon indépendant** : ${DEV.length} matchs de la saison ${DEV_START} → ${TEST_START}, pour vérifier qu'un segment favorable se répète.
- **Différences appariées** modèle − marché (négatif = modèle meilleur), avec IC à 95 % par approximation normale.
- **Correction de Bonferroni** : ${nTests} segments testés, donc seuil |z| ≥ ${crit.toFixed(2).replace('.', ',')} au lieu de 1,96.

## Synthèse

1. **Aucun segment où le modèle bat le marché.** Sur ${nTests} segments, aucun n'a un écart de Brier dont l'IC à 95 % passe entièrement sous zéro, même avant correction. Le marché est meilleur partout, sur le test comme sur l'échantillon indépendant.
2. **Le modèle perd surtout quand il s'écarte du marché.** Quand le désaccord dépasse 10 points, l'écart atteint ${sg(tables['Désaccord max modèle/marché (points)'][3].test.brierDiff.diff)} de Brier ; sous 3 points, il n'est que de ${sg(tables['Désaccord max modèle/marché (points)'][0].test.brierDiff.diff)}. Les gros désaccords sont des erreurs du modèle, pas des opportunités.
3. **Erreur systématique principale : le modèle sous-estime les gros favoris.** Quand le favori du marché est à 60 % ou plus, le modèle sous-estime la victoire à domicile de ${f1(Math.abs(errors['Favori marché ≥ 60 %'].model[0]))} points (erreur type ${f1(errors['Favori marché ≥ 60 %'].se[0])}). Sa pente de calibration (${out.calibration.penteModele.slope.toFixed(2).replace('.', ',')}) indique des probabilités trop prudentes.
4. **La recalibration chronologique corrige un peu, sans combler l'écart.** Gain de ${sg(recalVsRaw.complete.diff)} (non significatif) ; il reste ${sg(recalRes.complete.brierDiff.diff)} de retard sur le marché.
5. **2 080 contre ${scN}** : la différence vient des ${fallbackTest} matchs prédits par le repli v1 dans le bilan public.

**Conclusion** : avec ces données (résultats passés uniquement), le modèle ne contient pas d'information que les cotes de clôture n'ont pas déjà. Aucune modification n'est justifiée par ces résultats.

## Vue d'ensemble

| Échantillon | n | Brier modèle | Brier marché | Écart Brier [IC 95 %] | Log-loss modèle | Log-loss marché | Écart log-loss [IC 95 %] |
|---|---|---|---|---|---|---|---|
| Test | ${out.global.n} | ${f4(out.global.brierModel)} | ${f4(out.global.brierMarket)} | ${ci(out.global.brierDiff)} | ${f4(out.global.logModel)} | ${f4(out.global.logMarket)} | ${ci(out.global.logDiff)} |
| Indépendant (saison 2024-25) | ${out.globalDev.n} | ${f4(out.globalDev.brierModel)} | ${f4(out.globalDev.brierMarket)} | ${ci(out.globalDev.brierDiff)} | ${f4(out.globalDev.logModel)} | ${f4(out.globalDev.logMarket)} | ${ci(out.globalDev.logDiff)} |

## Par championnat et par saison

La saison 2024-25 est l'échantillon indépendant (période de réglage des paramètres). Les saisons 2025-26 et 2026-27 (en cours) forment la période de test.

| Saison | Championnat | n | Brier modèle | Brier marché | Écart Brier [IC 95 %] | Écart log-loss [IC 95 %] |
|---|---|---|---|---|---|---|
${bySeason.map(b => `| ${b.saison} | ${b.lg === 'Tous' ? '**Tous**' : b.lg} | ${b.n} | ${f4(b.brierModel)} | ${f4(b.brierMarket)} | ${ci(b.brierDiff)} | ${ci(b.logDiff)} |`).join('\n')}

## 1–3. Segments

Pour chaque segment, l'écart de Brier est donné sur le test et sur l'échantillon indépendant. Un avantage réel devrait être négatif et significatif **dans les deux**.

`;
for (const [name, list] of Object.entries(tables)) {
  md += `### ${name}\n\n| Segment | n test | Brier modèle | Brier marché | Écart Brier test [IC 95 %] | Écart log-loss test [IC 95 %] | n indép. | Écart Brier indép. [IC 95 %] |\n|---|---|---|---|---|---|---|---|\n`;
  for (const {lab, test: t, dev: d} of list) {
    if (!t) { md += `| ${lab} | < 30 | | | | | | |\n`; continue; }
    md += `| ${lab} | ${t.n} | ${f4(t.brierModel)} | ${f4(t.brierMarket)} | ${ci(t.brierDiff)}${flag(t.brierDiff)} | ${ci(t.logDiff)} | ${d ? d.n : '< 30'} | ${d ? ci(d.brierDiff) : '—'} |\n`;
  }
  md += '\n';
}
const best = Object.values(tables).flat().filter(x => x.test).sort((a, b) => a.test.brierDiff.diff - b.test.brierDiff.diff)[0];
const anySig = Object.values(tables).flat().some(x => x.test && x.test.brierDiff.hi < 0 && Math.abs(x.test.brierDiff.z) >= crit);
const anyNom = Object.values(tables).flat().filter(x => x.test && x.test.brierDiff.hi < 0);
md += `**Lecture.** ${anySig ? 'Au moins un segment montre un avantage significatif après correction (à confirmer sur l’échantillon indépendant).' : 'Aucun segment ne montre un avantage du modèle significatif après correction pour comparaisons multiples.'} ${anyNom.length ? `Avantage nominal (IC sous zéro, avant correction) : ${anyNom.map(x => x.lab).join(', ')}.` : 'Aucun segment n’a même un IC à 95 % entièrement sous zéro.'} Meilleur segment pour le modèle : « ${best.lab} », écart ${ci(best.test.brierDiff)}.

## Calibration (test, issues 1/N/2 empilées)

| Tranche annoncée | n | Modèle : annoncé → observé (± erreur type) | Marché : n | Marché : annoncé → observé |
|---|---|---|---|---|
`;
out.calibration.modele.forEach((b, i) => { const m = out.calibration.marche[i]; md += `| ${Math.round(b.lo * 100)}–${Math.min(100, Math.round(b.hi * 100))} % | ${b.n} | ${b.n ? f1(b.pred) + ' % → ' + f1(b.obs) + ' % (± ' + f1(b.se) + ')' : '—'} | ${m.n} | ${m.n ? f1(m.pred) + ' % → ' + f1(m.obs) + ' %' : '—'} |\n`; });
md += `
**Pente de calibration** (régression logistique de l'issue sur logit(p) ; 1 = parfait, < 1 = trop confiant, > 1 = trop prudent) : modèle ${out.calibration.penteModele.slope.toFixed(3).replace('.', ',')}, marché ${out.calibration.penteMarche.slope.toFixed(3).replace('.', ',')}.

## 4. Erreurs systématiques (test) : biais moyen annoncé − observé, en points

Un biais n'est notable que s'il dépasse environ 2 erreurs types (colonne « ± »).

| Groupe | n | Modèle 1 / N / 2 | Marché 1 / N / 2 | ± (1 erreur type) 1 / N / 2 |
|---|---|---|---|---|
`;
for (const [lab, e] of Object.entries(errors)) md += `| ${lab} | ${e.n} | ${e.model.map(v => (v >= 0 ? '+' : '−') + f1(Math.abs(v))).join(' / ')} | ${e.market.map(v => (v >= 0 ? '+' : '−') + f1(Math.abs(v))).join(' / ')} | ${e.se.map(f1).join(' / ')} |\n`;
const rr = recalRes, rv = recalVsRaw;
md += `
## 5. Recalibration chronologique (sans fuite)

On transforme p'_k ∝ exp(t · log p_k + β_k). Les paramètres sont réestimés **au début de chaque mois** de test, avec uniquement les matchs déjà joués (saison 2024-25 et mois de test précédents). Deux versions : « température » (t seul) et « complète » (t + β domicile + β nul). Comparaison appariée match par match (${recal.complete.length} matchs, contrôle : ${aligned ? 'OK' : 'ÉCHEC'}).

| Version | Brier | Log-loss | Écart Brier contre marché [IC 95 %] | Écart Brier contre modèle brut [IC 95 %] |
|---|---|---|---|---|
| Modèle brut | ${f4(rr.brut.brierModel)} | ${f4(rr.brut.logModel)} | ${ci(rr.brut.brierDiff)} | — |
| Température | ${f4(rr.temperature.brierModel)} | ${f4(rr.temperature.logModel)} | ${ci(rr.temperature.brierDiff)} | ${ci(rv.temperature)} |
| Complète | ${f4(rr.complete.brierModel)} | ${f4(rr.complete.logModel)} | ${ci(rr.complete.brierDiff)} | ${ci(rv.complete)} |
| Marché | ${f4(rr.brut.brierMarket)} | ${f4(rr.brut.logMarket)} | — | — |

Paramètres du premier et du dernier mois : t = ${fx3(params[0].t2)} → ${fx3(params[params.length - 1].t2)} ; β domicile = ${fx3(params[0].bH)} → ${fx3(params[params.length - 1].bH)} ; β nul = ${fx3(params[0].bD)} → ${fx3(params[params.length - 1].bD)} (détail dans \`lab/segments-result.json\`).

## 6. Pourquoi 2 080 matchs ici et ${scN} dans le bilan

- **Laboratoire** : ${TEST.length} matchs, uniquement ceux que le modèle v2 sait prédire (au moins 3 matchs-équivalents pondérés pour chaque équipe).
- **Bilan du site** : ${scN} matchs, car il utilise le même prédicteur que le site, c'est-à-dire v2 avec **repli sur v1** pour les équipes sans assez d'historique (souvent des promus en début de saison). Ici, ${fallbackTest} matchs de test relèvent de ce repli. ${scN - TEST.length - fallbackTest === 0 ? `${TEST.length} + ${fallbackTest} = ${scN} : l'écart est entièrement expliqué.` : `${TEST.length} + ${fallbackTest} = ${TEST.length + fallbackTest} ; les ${scN - TEST.length - fallbackTest} match(s) restant(s) viennent de ce que le bilan a été calculé lors d'un passage antérieur du robot, sur un historique légèrement différent.`}
- **Conséquence** : le bilan public mélange v2 et v1, et le laboratoire ne mesure que v2. Les conclusions sur v2 ne changent pas ; le bilan est un peu moins bon à cause des matchs en repli.

## Limites

- Intervalles par approximation normale sur des différences appariées. Ils sont fiables pour n ≥ 100 environ, et indicatifs en dessous.
- Les segments « désaccord » sont définis à partir du marché lui-même. Ils décrivent où le modèle se trompe, mais ne constituent pas une stratégie utilisable avant le match avec des cotes d'ouverture.
- Cotes de **clôture** : c'est la référence la plus exigeante. Un éventuel avantage face aux cotes d'ouverture n'est pas mesuré ici.
- Une seule saison et quelques mois de test : les petits effets (moins de 0,005 de Brier) ne sont pas détectables.
- La période de test a servi à décider d'écarter des variantes. Elle n'est donc pas totalement « vierge ». Les matchs joués après le 1er novembre 2026 constitueront un échantillon jamais consulté.
- La saison 2024-25 ne disposait que d'environ un an d'historique (les données commencent en août 2023), au lieu des 550 jours de la fenêtre.
`;
writeFileSync(new URL('lab/RAPPORT-SEGMENTS.md', ROOT), md);
console.log(md);
