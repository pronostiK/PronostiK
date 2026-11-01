// Tests du moteur de calcul, sur des données FIGÉES (tests/fixtures/) pour ne pas dépendre de l'historique vivant,
// que le robot complète toutes les 3 heures.
//   A. Modèle v1 (repli) : identique à la page PronostiK d'origine (12 matchs, Ligue 1).
//   B. Modèle v2 : 13 références Ligue 1 du banc d'essai qui a servi à le choisir.
//   C. Modèle v2 : 10 références par championnat, calculées par l'implémentation de laboratoire (code indépendant).
//   D. Absence de fuite : une prédiction ne change pas si l'on supprime ou modifie les matchs à partir de sa date.
//   E. Cohérence : probabilités dans [0, 1] et de somme 1.
//   F. Paramètres de production inchangés (toute modification doit passer par une preuve statistique).
import {readFileSync} from 'node:fs';
import {createModel, createRatings, RATINGS_DEFAULTS, createElo, hybridProbs, ELO_PARAMS} from '../model.mjs';

const load = f => JSON.parse(readFileSync(new URL(f, import.meta.url)));
const isLg = lg => m => (m.lg || 'FL1') === lg;
const LEAGUES = ['FL1', 'PL', 'BL1', 'SA', 'PD'];
let failed = 0;
const report = (ok, msg) => { console.log((ok ? '  ok  ' : ' FAIL ') + msg); if (!ok) failed++; };
const maxDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

// A. v1 contre la page d'origine (jeu figé utilisé par la page : Ligue 1 + Ligue 2, jusqu'au 10/10/2026)
{
  const seed = load('./fixtures/history-FL1-seed.json').filter(isLg('FL1'));
  const refs = load('./reference.json'), M = createModel(seed);
  let bad = 0;
  for (const r of refs) {
    const x = M.getLambdas(r.h, r.a, r.d), p = M.calcProb(x.lamH, x.lamA);
    const d = Math.max(Math.abs(x.lamH - r.lamH), Math.abs(x.lamA - r.lamA), maxDiff([p.h, p.d, p.a], r.p));
    if (d > 1e-12 || p.score !== r.score) { bad++; console.log('       écart', r.h, r.a, r.d, d); }
  }
  report(!bad, `A. v1 : ${refs.length - bad}/${refs.length} matchs identiques à la page d'origine (Ligue 1)`);
}

// B. v2, 13 références Ligue 1 (même jeu figé, filtré sur la Ligue 1)
{
  const seed = load('./fixtures/history-FL1-seed.json').filter(isLg('FL1'));
  const refs = load('./reference-ratings.json'), R = createRatings(seed);
  let bad = 0, worst = 0;
  for (const r of refs) { const x = R.predict(r.h, r.a, r.d); const d = x ? maxDiff(x.p, r.p) : 1; worst = Math.max(worst, d); if (d > 1e-9) { bad++; console.log('       écart', r.h, r.a, r.d, d); } }
  report(!bad && refs.length === 13, `B. v2 Ligue 1 : ${refs.length - bad}/${refs.length} références exactes (écart max ${worst.toExponential(1)})`);
}

// C. v2 par championnat contre l'implémentation de laboratoire
for (const lg of LEAGUES) {
  const H = load(`./fixtures/history-${lg}.json`).filter(isLg(lg));
  const refs = load(`./reference-ratings-${lg}.json`), R = createRatings(H);
  let bad = 0, worst = 0;
  for (const r of refs) { const x = R.predict(r.h, r.a, r.d); const d = x ? maxDiff(x.p, r.p) : 1; worst = Math.max(worst, d); if (d > 1e-9) { bad++; console.log('       écart', lg, r.h, r.a, r.d, d); } }
  report(!bad && refs.length >= 10, `C. v2 ${lg} : ${refs.length - bad}/${refs.length} identiques au laboratoire (écart max ${worst.toExponential(1)})`);
}

// D. Absence de fuite d'information future
for (const lg of LEAGUES) {
  const H = load(`./fixtures/history-${lg}.json`).filter(isLg(lg));
  const refs = load(`./reference-ratings-${lg}.json`);
  const full = createRatings(H);
  let bad = 0;
  for (const r of refs.slice(0, 4)) {
    const cut = createRatings(H.filter(m => m.date < r.d));                                         // futur supprimé
    const fake = createRatings(H.map(m => m.date >= r.d ? {...m, hg: 9, ag: 0} : m));              // futur falsifié
    const a = full.predict(r.h, r.a, r.d), b = cut.predict(r.h, r.a, r.d), c = fake.predict(r.h, r.a, r.d);
    if (!a || !b || !c || maxDiff(a.p, b.p) > 1e-12 || maxDiff(a.p, c.p) > 1e-12) { bad++; console.log('       fuite ?', lg, r.h, r.a, r.d); }
  }
  report(!bad, `D. ${lg} : aucune fuite (prédictions identiques avec le futur supprimé ou falsifié, 4 dates)`);
}

// E. Cohérence des probabilités
{
  let bad = 0, n = 0;
  for (const lg of LEAGUES) {
    const H = load(`./fixtures/history-${lg}.json`).filter(isLg(lg)), R = createRatings(H);
    for (const r of load(`./reference-ratings-${lg}.json`)) { const x = R.predict(r.h, r.a, r.d); n++; if (!x || x.p.some(v => v < 0 || v > 1) || Math.abs(x.p[0] + x.p[1] + x.p[2] - 1) > 1e-9 || !(x.lamH > 0 && x.lamA > 0)) bad++; }
  }
  report(!bad, `E. ${n - bad}/${n} prédictions cohérentes (probabilités dans [0, 1], somme = 1, buts attendus > 0)`);
}

// G. Hybride Elo + v2 (en coulisse) : pas de fuite, probabilités cohérentes, réglages figés
for (const lg of LEAGUES) {
  const H = load(`./fixtures/history-${lg}.json`).filter(isLg(lg)), refs = load(`./reference-ratings-${lg}.json`);
  const E = createElo(H); let bad = 0;
  for (const r of refs.slice(0, 4)) {
    const a = E.predict(r.h, r.a, r.d), b = createElo(H.filter(m => m.date < r.d)).predict(r.h, r.a, r.d), c = createElo(H.map(m => m.date >= r.d ? {...m, hg: 9, ag: 0} : m)).predict(r.h, r.a, r.d);
    const h = hybridProbs(r.p, a.p);
    if (maxDiff(a.p, b.p) > 1e-12 || maxDiff(a.p, c.p) > 1e-12 || Math.abs(h[0] + h[1] + h[2] - 1) > 1e-9 || h.some(v => v <= 0 || v >= 1)) bad++;
  }
  report(!bad, `G. Elo/hybride ${lg} : aucune fuite, probabilités cohérentes (4 dates)`);
}
report(JSON.stringify(ELO_PARAMS) === JSON.stringify({K: 20, H: 80, reg: 1, ord: {b: 0.5300431619279119, t1: -0.37603656229315574, t2: 0.8128742251704589}, pool: {wV2: 0.7511677930724845, wElo: 0.3991237434408407, bDom: -0.06568771090046427, bNul: 0.09069661636795369}}),
  'G. tous les réglages de l’hybride figés pendant l’observation (Elo, conversion, mélange)');

// F. Paramètres de production
{
  const expected = {span: 550, half: 365, k: 8, minW: 3};
  report(JSON.stringify(RATINGS_DEFAULTS) === JSON.stringify(expected), `F. paramètres v2 inchangés ${JSON.stringify(RATINGS_DEFAULTS)}`);
}

console.log(failed ? `\n${failed} test(s) en échec` : '\nTous les tests du modèle passent');
process.exit(failed ? 1 : 0);
