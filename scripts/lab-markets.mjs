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
    const dist = {}; for (const x of g) { const k = x.i <= 3 && x.j <= 3 ? `${x.i}-${x.j}` : 'autre'; dist[k] = (dist[k] || 0) + x.p; }
    const ou = m.o25 && m.u25 ? (1 / m.o25) / (1 / m.o25 + 1 / m.u25) : null;
    rows.push({lg: lg.code, date: m.date, per: m.date >= TEST ? 'test' : 'dev',
      p: {dist, o15: S(x => x.i + x.j > 1), o25: S(x => x.i + x.j > 2), btts: S(x => x.i > 0 && x.j > 0), ht, score: top.p, scoreLab: `${top.i}-${top.j}`, ouMk: ou},
      y: {o15: +(m.hg + m.ag > 1), o25: +(m.hg + m.ag > 2), btts: +(m.hg > 0 && m.ag > 0), ht: m.hthg == null ? null : (m.hthg > m.htag ? 0 : m.hthg === m.htag ? 1 : 2), score: +(`${m.hg}-${m.ag}` === `${top.i}-${top.j}`), htGoals: m.hthg == null ? null : m.hthg + m.htag, goals: m.hg + m.ag, scoreReel: m.hg <= 3 && m.ag <= 3 ? `${m.hg}-${m.ag}` : 'autre'}});
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
// ================= Rapport détaillé (audit) =================
const LL = (p, y) => -(y ? Math.log(Math.max(1e-12, p)) : Math.log(Math.max(1e-12, 1 - p)));
const seasonOf = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7), s0 = m >= 8 ? y : y - 1; return `${s0}-${String(s0 + 1).slice(2)}`; };
const LGN = {FL1: 'Ligue 1', PL: 'Premier League', BL1: 'Bundesliga', SA: 'Serie A', PD: 'La Liga'};
const f4 = v => (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(4).replace('.', ','), n4 = v => v.toFixed(4).replace('.', ',');
const fci = c => `${f4(c.diff)} [${f4(c.lo)} ; ${f4(c.hi)}]`;
const verdict = c => c.hi < 0 ? 'meilleur' : c.lo > 0 ? 'moins bon' : 'non significatif';
const cals = {}; for (const k of ['o15', 'o25', 'btts']) cals[k] = (() => { const c = calParams[k]; return p => sig(c.a + c.b * logit(p)); })();
const baseOf = {}; for (const k of ['o15', 'o25', 'btts']) baseOf[k] = mean(dev.map(r => r.y[k]));
const NAMES = {o15: 'Plus de 1,5 but', o25: 'Plus de 2,5 buts', btts: 'Les deux équipes marquent'};
let md = `# Rapport : autres marchés (audit détaillé)

Généré par \`scripts/lab-markets.mjs\`. Le moteur et le site ne sont pas modifiés.

## Protocole

- **Réglage (DEV)** : saison 2024-25, ${dev.length} matchs. Les corrections des marchés de buts et les références naïves (fréquences moyennes) y sont estimées.
- **Validation (TEST)** : matchs à partir du 2025-08-01, ${test.length} matchs, jamais utilisés pour un réglage. Chaque prédiction n'utilise que les matchs antérieurs.
- **Mesures** : Brier binaire (ou à 3 issues pour la mi-temps), log-loss, calibration par tranches. Différences appariées modèle − référence sur les mêmes matchs, IC à 95 %. Négatif = le modèle fait mieux.
- **Marché (bookmakers)** : seulement pour +/- 2,5 buts (cotes moyennes de clôture, marge retirée). Les fichiers ne contiennent pas de cotes pour les autres marchés.

`;
// 1. Marchés binaires
md += `## 1. Marchés de buts (TEST, n = ${test.length})

| Marché | Version | Brier | Log-loss | Δ Brier vs naïf [IC 95 %] | Δ log-loss vs naïf [IC 95 %] | Verdict (Brier) |
|---|---|---|---|---|---|---|
`;
for (const k of ['o15', 'o25', 'btts']) for (const [vn, f] of [['brut', p => p], ['recalibré', cals[k]]]) {
  const b = test.map(r => b2(f(r.p[k]), r.y[k])), l = test.map(r => LL(f(r.p[k]), r.y[k])), bn = test.map(r => b2(baseOf[k], r.y[k])), ln = test.map(r => LL(baseOf[k], r.y[k]));
  const cb = ci(b.map((v, i) => v - bn[i])), cl = ci(l.map((v, i) => v - ln[i]));
  md += `| ${NAMES[k]} | ${vn} | ${n4(mean(b))} | ${n4(mean(l))} | ${fci(cb)} | ${fci(cl)} | ${verdict(cb)} |\n`;
}
{ const M = test.filter(r => r.p.ouMk != null);
  md += `\n**Plus de 2,5 buts contre les bookmakers** (n = ${M.length}) :\n\n| Version | Brier modèle | Brier marché | Δ Brier [IC 95 %] | Δ log-loss [IC 95 %] |\n|---|---|---|---|---|\n`;
  for (const [vn, f] of [['brut', p => p], ['recalibré', cals.o25]]) {
    const bm = M.map(r => b2(f(r.p.o25), r.y.o25)), bk = M.map(r => b2(r.p.ouMk, r.y.o25)), lm = M.map(r => LL(f(r.p.o25), r.y.o25)), lk = M.map(r => LL(r.p.ouMk, r.y.o25));
    md += `| ${vn} | ${n4(mean(bm))} | ${n4(mean(bk))} | ${fci(ci(bm.map((v, i) => v - bk[i])))} | ${fci(ci(lm.map((v, i) => v - lk[i])))} |\n`;
  } }
md += `\n### Calibration (version affichée sur le site : recalibrée)\n\n| Marché | Tranche | n | Annoncé | Observé | ± (erreur type) |\n|---|---|---|---|---|---|\n`;
for (const k of ['o15', 'o25']) for (const [lo, hi] of [[0, .4], [.4, .5], [.5, .6], [.6, .7], [.7, .8], [.8, .9], [.9, 1.01]]) {
  const s = test.filter(r => cals[k](r.p[k]) >= lo && cals[k](r.p[k]) < hi); if (s.length < 20) continue;
  const o = mean(s.map(r => r.y[k]));
  md += `| ${NAMES[k]} | ${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))} % | ${s.length} | ${(100 * mean(s.map(r => cals[k](r.p[k])))).toFixed(1)} % | ${(100 * o).toFixed(1)} % | ${(100 * Math.sqrt(o * (1 - o) / s.length)).toFixed(1)} |\n`;
}
// 2. Mi-temps
{ const T = test.filter(r => r.y.ht != null), D = dev.filter(r => r.y.ht != null), base = [0, 1, 2].map(k => mean(D.map(r => +(r.y.ht === k))));
  const bri = (p, y) => p.reduce((s, v, k) => s + (v - (k === y ? 1 : 0)) ** 2, 0), ll3 = (p, y) => -Math.log(Math.max(1e-12, p[y]));
  const bm = T.map(r => bri(r.p.ht, r.y.ht)), bn = T.map(r => bri(base, r.y.ht)), lm = T.map(r => ll3(r.p.ht, r.y.ht)), ln = T.map(r => ll3(base, r.y.ht));
  md += `\n## 2. Résultat à la mi-temps (TEST, n = ${T.length})\n\n| | Brier | Log-loss |\n|---|---|---|\n| Modèle | ${n4(mean(bm))} | ${n4(mean(lm))} |\n| Référence naïve (fréquences 2024-25) | ${n4(mean(bn))} | ${n4(mean(ln))} |\n| Δ modèle − naïf [IC 95 %] | ${fci(ci(bm.map((v, i) => v - bn[i])))} | ${fci(ci(lm.map((v, i) => v - ln[i])))} |\n\n### Calibration de chaque issue\n\n| Issue | Tranche | n | Annoncé | Observé | ± |\n|---|---|---|---|---|---|\n`;
  for (const [k, lab] of [[0, '1 (domicile mène)'], [1, 'N (égalité)'], [2, '2 (extérieur mène)']]) for (const [lo, hi] of [[0, .2], [.2, .3], [.3, .4], [.4, .5], [.5, .6], [.6, 1.01]]) {
    const s = T.filter(r => r.p.ht[k] >= lo && r.p.ht[k] < hi); if (s.length < 20) continue;
    const o = mean(s.map(r => +(r.y.ht === k)));
    md += `| ${lab} | ${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))} % | ${s.length} | ${(100 * mean(s.map(r => r.p.ht[k]))).toFixed(1)} % | ${(100 * o).toFixed(1)} % | ${(100 * Math.sqrt(o * (1 - o) / s.length)).toFixed(1)} |\n`;
  }
  md += `\nMoyennes globales : annoncé ${[0, 1, 2].map(k => (100 * mean(T.map(r => r.p.ht[k]))).toFixed(1) + ' %').join(' / ')} · observé ${[0, 1, 2].map(k => (100 * mean(T.map(r => +(r.y.ht === k)))).toFixed(1) + ' %').join(' / ')}.\n`; }
// 3. Score exact
{ const T = test, keys = []; for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) keys.push(`${i}-${j}`); keys.push('autre');
  const freqDev = Object.fromEntries(keys.map(k => [k, mean(dev.map(r => +(r.y.scoreReel === k)))]));
  const lm = T.map(r => -Math.log(Math.max(1e-12, r.p.dist[r.y.scoreReel] || 0))), ln = T.map(r => -Math.log(Math.max(1e-12, freqDev[r.y.scoreReel])));
  md += `\n## 3. Score exact (TEST, n = ${T.length})\n\nLog-loss sur les 17 catégories (16 scores de 0-0 à 3-3, plus « autre ») : modèle ${n4(mean(lm))}, référence naïve (fréquences 2024-25) ${n4(mean(ln))}, Δ ${fci(ci(lm.map((v, i) => v - ln[i])))}.\n\n### Distribution complète : probabilité moyenne annoncée contre fréquence observée\n\n| Score | Annoncé | Observé | n observés | ± |\n|---|---|---|---|---|\n`;
  for (const k of keys) { const a = mean(T.map(r => r.p.dist[k] || 0)), o = mean(T.map(r => +(r.y.scoreReel === k))); md += `| ${k} | ${(100 * a).toFixed(1)} % | ${(100 * o).toFixed(1)} % | ${T.filter(r => r.y.scoreReel === k).length} | ${(100 * Math.sqrt(o * (1 - o) / T.length)).toFixed(1)} |\n`; }
  md += `\n### Le score annoncé comme le plus probable\n\n| Probabilité annoncée du score n°1 | n | Annoncé | Réalisé |\n|---|---|---|---|\n`;
  for (const [lo, hi] of [[0, .1], [.1, .12], [.12, .14], [.14, 1]]) { const s = T.filter(r => r.p.score >= lo && r.p.score < hi); if (s.length < 20) continue; md += `| ${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))} % | ${s.length} | ${(100 * mean(s.map(r => r.p.score))).toFixed(1)} % | ${(100 * mean(s.map(r => r.y.score))).toFixed(1)} % |\n`; } }
// 4. Ventilation saison × championnat
md += `\n## 4. Ventilation par saison et par championnat (Δ Brier modèle − naïf, version affichée)\n\nUne cellule n'est fiable qu'avec un effectif suffisant : avec moins de 150 matchs, l'intervalle est large.\n\n| Saison | Championnat | n | +1,5 recalibré | +2,5 recalibré | +2,5 vs marché | Mi-temps 1N2 |\n|---|---|---|---|---|---|---|\n`;
{ const D = dev.filter(r => r.y.ht != null), baseHT = [0, 1, 2].map(k => mean(D.map(r => +(r.y.ht === k))));
  const bri = (p, y) => p.reduce((s, v, k) => s + (v - (k === y ? 1 : 0)) ** 2, 0);
  const seasons = [...new Set(test.map(r => seasonOf(r.date)))].sort();
  for (const se of seasons) for (const lg of [...Object.keys(LGN), 'ALL']) {
    const S = test.filter(r => seasonOf(r.date) === se && (lg === 'ALL' || r.lg === lg)); if (S.length < 30) continue;
    const c15 = ci(S.map(r => b2(cals.o15(r.p.o15), r.y.o15) - b2(baseOf.o15, r.y.o15))), c25 = ci(S.map(r => b2(cals.o25(r.p.o25), r.y.o25) - b2(baseOf.o25, r.y.o25)));
    const M = S.filter(r => r.p.ouMk != null), cm = M.length > 1 ? ci(M.map(r => b2(cals.o25(r.p.o25), r.y.o25) - b2(r.p.ouMk, r.y.o25))) : null;
    const H = S.filter(r => r.y.ht != null), ch = H.length > 1 ? ci(H.map(r => bri(r.p.ht, r.y.ht) - bri(baseHT, r.y.ht))) : null;
    md += `| ${se} | ${lg === 'ALL' ? '**Tous**' : LGN[lg]} | ${S.length} | ${fci(c15)} | ${fci(c25)} | ${cm ? fci(cm) : '—'} | ${ch ? fci(ch) : '—'} |\n`;
  } }
md += `\n## Limites\n\n- La validation compte une saison complète plus le début de la suivante : un écart inférieur à environ 0,003 de Brier n'est pas détectable de façon fiable.\n- La « référence naïve » est un plancher : la battre montre que le modèle apporte de l'information, pas qu'il bat les bookmakers.\n- Pas de cotes de bookmakers dans les fichiers pour la mi-temps, le score exact et « les deux équipes marquent » : la comparaison au marché n'est pas possible pour ces marchés.\n- La mi-temps suppose 45 % des buts avant la pause (mesuré : ${(100 * out.partButs1reMT).toFixed(1)} % sur 2024-25) et l'indépendance des deux mi-temps.\n`;

// ================= 5. Contrôle de robustesse demandé par l'audit =================
// (a) référence naïve propre à chaque championnat (fréquences 2024-25 du championnat) ;
// (b) intervalles par bootstrap par blocs : on rééchantillonne des SEMAINES entières (lundi→dimanche), 4 000 tirages,
//     ce qui conserve la dépendance entre matchs d'une même journée et des mêmes équipes.
{
  let seed = 20261101; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const weekOf = d => { const t = new Date(d + 'T12:00:00Z'), day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day); return t.toISOString().slice(0, 10); };
  const bootstrap = (S, diffOf, B = 4000) => {
    const weeks = {}; S.forEach(r => (weeks[weekOf(r.date)] ||= []).push(diffOf(r)));
    const W = Object.values(weeks).map(a => [a.reduce((x, y) => x + y, 0), a.length]);
    const tot = W.reduce((x, w) => x + w[0], 0) / W.reduce((x, w) => x + w[1], 0), stats = [];
    for (let b = 0; b < B; b++) { let s = 0, n = 0; for (let k = 0; k < W.length; k++) { const w = W[Math.floor(rnd() * W.length)]; s += w[0]; n += w[1]; } stats.push(s / n); }
    stats.sort((a, b) => a - b);
    return {diff: tot, lo: stats[Math.floor(0.025 * B)], hi: stats[Math.ceil(0.975 * B) - 1], semaines: W.length};
  };
  const lgs = Object.keys(LGN);
  const baseLg = {}; for (const lg of lgs) { const D = dev.filter(r => r.lg === lg), DH = D.filter(r => r.y.ht != null);
    baseLg[lg] = {o15: mean(D.map(r => r.y.o15)), o25: mean(D.map(r => r.y.o25)), btts: mean(D.map(r => r.y.btts)), ht: [0, 1, 2].map(k => mean(DH.map(r => +(r.y.ht === k))))}; }
  const keysSc = []; for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) keysSc.push(`${i}-${j}`); keysSc.push('autre');
  const scLg = {}; for (const lg of lgs) { const D = dev.filter(r => r.lg === lg); scLg[lg] = Object.fromEntries(keysSc.map(k => [k, Math.max(1e-4, mean(D.map(r => +(r.y.scoreReel === k))))])); }
  const bri3 = (p, y) => p.reduce((s, v, k) => s + (v - (k === y ? 1 : 0)) ** 2, 0);
  const baseHTglob = (() => { const D = dev.filter(r => r.y.ht != null); return [0, 1, 2].map(k => mean(D.map(r => +(r.y.ht === k)))); })();
  const freqDevGlob = Object.fromEntries(keysSc.map(k => [k, mean(dev.map(r => +(r.y.scoreReel === k)))]));
  const T = test, TH = test.filter(r => r.y.ht != null), TM = test.filter(r => r.p.ouMk != null);
  const lines = [
    ['Plus de 1,5 (recalibré) − naïf', T, r => b2(cals.o15(r.p.o15), r.y.o15) - b2(baseOf.o15, r.y.o15), r => b2(cals.o15(r.p.o15), r.y.o15) - b2(baseLg[r.lg].o15, r.y.o15)],
    ['Plus de 2,5 (recalibré) − naïf', T, r => b2(cals.o25(r.p.o25), r.y.o25) - b2(baseOf.o25, r.y.o25), r => b2(cals.o25(r.p.o25), r.y.o25) - b2(baseLg[r.lg].o25, r.y.o25)],
    ['Les deux marquent (recalibré) − naïf', T, r => b2(cals.btts(r.p.btts), r.y.btts) - b2(baseOf.btts, r.y.btts), r => b2(cals.btts(r.p.btts), r.y.btts) - b2(baseLg[r.lg].btts, r.y.btts)],
    ['Mi-temps 1N2 − naïf (Brier)', TH, r => bri3(r.p.ht, r.y.ht) - bri3(baseHTglob, r.y.ht), r => bri3(r.p.ht, r.y.ht) - bri3(baseLg[r.lg].ht, r.y.ht)],
    ['Score exact − naïf (log-loss)', T, r => -Math.log(Math.max(1e-12, r.p.dist[r.y.scoreReel] || 0)) + Math.log(Math.max(1e-12, freqDevGlob[r.y.scoreReel])), r => -Math.log(Math.max(1e-12, r.p.dist[r.y.scoreReel] || 0)) + Math.log(scLg[r.lg][r.y.scoreReel])],
  ];
  const sig2 = c => c.hi < 0 ? '**meilleur**' : c.lo > 0 ? 'moins bon' : 'non significatif';
  md += `\n## 5. Contrôle de robustesse (demandé par l’audit)\n\n- **Référence naïve par championnat** : fréquences de chaque championnat sur 2024-25 (au lieu d’une moyenne des 5).\n- **Bootstrap par blocs de semaines** : ${Object.keys(T.reduce((a, r) => (a[weekOf(r.date)] = 1, a), {})).length} semaines rééchantillonnées avec remise, 4 000 tirages, IC à 95 % par percentiles. Les matchs d’une même semaine (mêmes équipes, même calendrier) restent ensemble.\n\n| Comparaison | Rapport initial (naïf global, IC indépendants) | Naïf global, bootstrap par semaines | **Naïf par championnat, bootstrap par semaines** | Conclusion inchangée ? |\n|---|---|---|---|---|\n`;
  const res5 = {};
  for (const [lab, S, fG, fL] of lines) {
    const c0 = ci(S.map(fG)), c1 = bootstrap(S, fG), c2 = bootstrap(S, fL);
    res5[lab] = {initial: c0, globalBloc: c1, parChampBloc: c2};
    md += `| ${lab} | ${fci(c0)} ${sig2(c0)} | ${fci(c1)} ${sig2(c1)} | ${fci(c2)} ${sig2(c2)} | ${sig2(c0) === sig2(c2) ? 'oui' : '**non**'} |\n`;
  }
  { const fM = r => b2(cals.o25(r.p.o25), r.y.o25) - b2(r.p.ouMk, r.y.o25), c0 = ci(TM.map(fM)), c1 = bootstrap(TM, fM);
    res5['Plus de 2,5 (recalibré) − bookmakers'] = {initial: c0, globalBloc: c1};
    md += `| Plus de 2,5 (recalibré) − **bookmakers** | ${fci(c0)} ${sig2(c0)} | ${fci(c1)} ${sig2(c1)} | (sans objet : comparaison directe au marché) | ${sig2(c0) === sig2(c1) ? 'oui' : '**non**'} |\n`; }
  md += `\nFréquences 2024-25 par championnat (référence naïve) : ${lgs.map(lg => `${LGN[lg]} +2,5 = ${(100 * baseLg[lg].o25).toFixed(0)} %, nul à la mi-temps = ${(100 * baseLg[lg].ht[1]).toFixed(0)} %`).join(' ; ')}.\n`;
  out.robustesse = res5;
  writeFileSync('lab/markets-result.json', JSON.stringify(out, null, 1));
}
writeFileSync('lab/RAPPORT-MARCHES.md', md);
mkdirSync('lab', {recursive: true});
writeFileSync('lab/markets-result.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
