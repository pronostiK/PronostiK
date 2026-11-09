// Laboratoire Coupe du Roi, étape 3 : modèle pour TOUS les matchs (petits clubs compris) et test.
//
// Modèle (logit ordonné, résultat à 90 minutes) :
//   d = c[division dom.] − c[division ext.] + β·(zDom − zExt) + η (avantage du terrain, 0 en terrain neutre)
//   P(1) = σ(d − θ), P(2) = σ(−d − θ), P(N) = le reste.
//   c[1] = 0 (Liga), c[2..6] réglés ; z = écart à la moyenne de sa division (Elo Liga / 2e division, en centaines de points), 0 pour les divisions 3 à 6.
// Réglage : éditions 2021-22 à 2024-25. Test UNIQUE : 2025-26 + 2026-27 (matchs joués). Tour préliminaire exclu (aller-retour entre clubs régionaux).
// Critères fixés AVANT le test (sinon la Coupe du Roi reste hors du site) :
//   1. le modèle bat la référence « fréquences 1/N/2 » en perte logarithmique, IC 95 % de l'écart entièrement sous 0 ;
//   2. calibrage : |% annoncé pour le favori − % de favoris gagnants| < 5 points ET l'IC 95 % de l'écart contient 0.
// Résultat : lab/cdr/result.json
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {parseCSV} from '../csv.mjs';
import {resolveName} from '../lib.mjs';
import {ALIASES} from '../leagues.mjs';

const M = JSON.parse(readFileSync('lab/cdr/matches.json', 'utf8'));
const CAL = new Set(['2021-22', '2022-23', '2023-24', '2024-25']), TEST = new Set(['2025-26', '2026-27']);

// --- 1. Elo Liga + 2e division (football-data.co.uk), chronologique
const rows = [];
for (const f of readdirSync('lab/cdr/csv').sort()) {
  const div = f.startsWith('SP1') ? 1 : 2, code = f.slice(4, 8), season = `20${code.slice(0, 2)}-${code.slice(2)}`;
  for (const r of parseCSV(readFileSync('lab/cdr/csv/' + f, 'utf8'), 'PD', {top: 'SP1'})) rows.push({...r, div, season});
}
rows.sort((a, b) => a.date.localeCompare(b.date));
const K = 20, HA = 60, elo = new Map(), divOf = new Map(), snaps = [];   // snaps : notes au fil du temps
const E = t => elo.get(t) ?? (divOf.get(t) === 2 ? 1400 : 1500);
let ri = 0;
function advance(date) {   // joue tous les matchs de championnat AVANT cette date
  while (ri < rows.length && rows[ri].date < date) {
    const m = rows[ri++]; divOf.set(m.home, m.div); divOf.set(m.away, m.div);
    const eh = E(m.home), ea = E(m.away), exp = 1 / (1 + 10 ** ((ea - eh - HA) / 400)), s = m.hg > m.ag ? 1 : m.hg === m.ag ? 0.5 : 0;
    const g = Math.log(Math.abs(m.hg - m.ag) + 1) + 1;   // marge de victoire
    elo.set(m.home, eh + K * g * (s - exp)); elo.set(m.away, ea - K * g * (s - exp));
  }
}
const seasonTeams = {}; for (const r of rows) for (const t of [r.home, r.away]) ((seasonTeams[r.season] ||= {})[r.div] ||= new Set()).add(t);
const EXTRA = {'athletic bilbao': 'Ath Bilbao', 'cultural y deportiva leonesa': 'Leonesa', 'cultural leonesa': 'Leonesa', 'sporting de gijon': 'Sp Gijon', 'sporting gijon': 'Sp Gijon',
  'real racing club de santander': 'Santander', 'racing santander': 'Santander', 'racing de santander': 'Santander', 'racing club de ferrol': 'Ferrol', 'racing ferrol': 'Ferrol',
  'deportivo de la coruna': 'La Coruna', 'deportivo la coruna': 'La Coruna', 'rcd mallorca': 'Mallorca', 'real valladolid': 'Valladolid', 'real zaragoza': 'Zaragoza', 'sd eibar': 'Eibar',
  'sd huesca': 'Huesca', 'cd leganes': 'Leganes', 'cd mirandes': 'Mirandes', 'cd tenerife': 'Tenerife', 'ud almeria': 'Almeria', 'cd castellon': 'Castellon', 'cordoba cf': 'Cordoba',
  'malaga cf': 'Malaga', 'granada cf': 'Granada', 'cadiz cf': 'Cadiz', 'elche cf': 'Elche', 'levante ud': 'Levante', 'girona fc': 'Girona', 'getafe cf': 'Getafe', 'valencia cf': 'Valencia',
  'sevilla fc': 'Sevilla', 'real betis': 'Betis', 'real oviedo': 'Oviedo', 'ca osasuna': 'Osasuna', 'albacete balompie': 'Albacete', 'ad alcorcon': 'Alcorcon', 'burgos cf': 'Burgos',
  'sd ponferradina': 'Ponferradina', 'fc cartagena': 'Cartagena', 'ud ibiza': 'Ibiza', 'cf fuenlabrada': 'Fuenlabrada', 'sd amorebieta': 'Amorebieta', 'real sociedad b': 'Sociedad B',
  'villarreal cf b': 'Villarreal B', 'villarreal b': 'Villarreal B', 'cd lugo': 'Lugo', 'ud las palmas': 'Las Palmas', 'deportivo alaves': 'Alaves', 'rcd espanyol': 'Espanol', 'espanyol': 'Espanol',
  'atletico madrid': 'Ath Madrid', 'fc barcelona': 'Barcelona', 'real madrid': 'Real Madrid', 'rayo vallecano': 'Vallecano', 'celta vigo': 'Celta', 'rc celta de vigo': 'Celta', 'ud logrones': 'Logrones',
  'cf rayo majadahonda': 'Majadahonda', 'real murcia': 'Real Murcia', 'ce sabadell fc': 'Sabadell', 'cd eldense': 'Eldense', 'sd eibar': 'Eibar', 'ad ceuta fc': 'Ceuta', 'fc andorra': 'Andorra', 'cultural leonesa': 'Leonesa'};
const unmatched = new Set();
function zOf(name, disp, tier, season, date) {
  if (tier > 2) return 0;
  const pool = [...(seasonTeams[season]?.[tier] || [])];
  if (!pool.length) return 0;
  const n = resolveName(name, pool, {...ALIASES.PD, ...EXTRA}) || resolveName(disp, pool, {...ALIASES.PD, ...EXTRA});
  if (!n) { unmatched.add(`${season} D${tier} ${name}`); return 0; }
  (globalThis.PAIRS ||= new Set()).add(`${name} → ${n}`);
  const mean = pool.reduce((s, t) => s + E(t), 0) / pool.length;
  return (E(n) - mean) / 100;
}

// --- 2. jeu de données (résultat à 90 minutes)
const data = [];
for (const m of M.slice().sort((a, b) => a.date.localeCompare(b.date))) {
  if (/preliminary/i.test(m.round || '')) continue;
  if (!m.th || !m.ta) continue;
  if (m.aet && /semi/i.test(m.round || '')) continue;   // demi-finale aller-retour : score à 90 min inconnu
  advance(m.date);
  const y = m.aet ? 1 : m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
  data.push({season: m.season, date: m.date, home: m.hn, away: m.an, th: Math.min(m.th, 6), ta: Math.min(m.ta, 6), zh: zOf(m.home, m.hn, m.th, m.season, m.date), za: zOf(m.away, m.an, m.ta, m.season, m.date), neutral: m.neutral, y});
}
if (process.env.ONLY_NAMES) { console.log(data.length, [...unmatched].sort(), [...(globalThis.PAIRS||[])].sort().join('\n')); process.exit(0); }
const cal = data.filter(d => CAL.has(d.season)), test = data.filter(d => TEST.has(d.season));

// --- 3. modèle + réglage (maximum de vraisemblance, descente de gradient numérique)
const sig = x => 1 / (1 + Math.exp(-x));
const probs = (P, d, useZ = true) => { const c = [0, 0, ...P.c]; const x = c[d.th] - c[d.ta] + (useZ ? P.b * (d.zh - d.za) : 0) + (d.neutral ? 0 : P.eta);
  const h = sig(x - P.th), a = sig(-x - P.th); return [h, Math.max(1e-6, 1 - h - a), a]; };
const pack = P => [...P.c, P.b, P.eta, P.th], unpack = v => ({c: v.slice(0, 5), b: v[5], eta: v[6], th: v[7]});
function fit(D, useZ) {
  let v = [-0.5, -1, -1.5, -2, -2.5, 0.5, 0.3, 0.5]; if (!useZ) v[5] = 0;
  const nll = w => { const P = unpack(w); let s = 0; for (const d of D) s -= Math.log(probs(P, d, useZ)[d.y]); return s / D.length + 0.001 * w.reduce((a, x) => a + x * x, 0) / w.length; };
  let lr = 0.5;
  for (let it = 0; it < 4000; it++) {
    const f0 = nll(v), g = v.map((x, i) => { if (!useZ && i === 5) return 0; const w = v.slice(); w[i] += 1e-5; return (nll(w) - f0) / 1e-5; });
    const nv = v.map((x, i) => x - lr * g[i]);
    if (nll(nv) < f0) { v = nv; lr *= 1.05; } else lr *= 0.5;
    if (lr < 1e-9) break;
  }
  return unpack(v);
}
const P1 = fit(cal, true), P0 = fit(cal, false);
const base = [0, 1, 2].map(k => cal.filter(d => d.y === k).length / cal.length);

// --- 4. test unique
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const ci = a => { const m = mean(a), sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)), e = 1.96 * sd / Math.sqrt(a.length); return {m: +m.toFixed(4), lo: +(m - e).toFixed(4), hi: +(m + e).toFixed(4)}; };
const ll = (p, y) => -Math.log(p[y]);
function evalSet(D) {
  const r = D.map(d => { const p1 = probs(P1, d, true), p0 = probs(P0, d, false); const f = p1.indexOf(Math.max(...p1));
    return {l1: ll(p1, d.y), l0: ll(p0, d.y), lb: ll(base, d.y), pf: p1[f], hit: f === d.y ? 1 : 0, p1, d}; });
  const bins = [[0, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.01]].map(([lo, hi]) => { const s = r.filter(x => x.pf >= lo && x.pf < hi);
    return s.length ? {de: lo, a: hi, n: s.length, annonce: +mean(s.map(x => x.pf)).toFixed(3), observe: +mean(s.map(x => x.hit)).toFixed(3)} : null; }).filter(Boolean);
  return {n: D.length, perteModele: +mean(r.map(x => x.l1)).toFixed(4), perteDivisionsSeules: +mean(r.map(x => x.l0)).toFixed(4), perteReference: +mean(r.map(x => x.lb)).toFixed(4),
    ecartModeleReference: ci(r.map(x => x.l1 - x.lb)), ecartModeleDivisions: ci(r.map(x => x.l1 - x.l0)),
    favori: {annonce: +mean(r.map(x => x.pf)).toFixed(4), gagne: +mean(r.map(x => x.hit)).toFixed(4), ecart: ci(r.map(x => x.pf - x.hit))}, tranches: bins, _r: r};
}
const T = evalSet(test), C = evalSet(cal);
const parSaison = Object.fromEntries([...TEST].map(s => { const R = evalSet(test.filter(d => d.season === s)); return [s, {n: R.n, perteModele: R.perteModele, perteReference: R.perteReference, ecart: R.ecartModeleReference, favori: R.favori}]; }));
const surprises = T._r.filter(x => x.pf > 0.85 && !x.hit).map(x => `${x.d.date} ${x.d.home} (D${x.d.th}) – ${x.d.away} (D${x.d.ta})`);
const c1 = T.ecartModeleReference.hi < 0, c2 = Math.abs(T.favori.ecart.m) < 0.05 && T.favori.ecart.lo <= 0 && T.favori.ecart.hi >= 0;
const exemples = T._r.filter((x, i) => i % 12 === 0).map(x => ({date: x.d.date, match: `${x.d.home} (D${x.d.th}) – ${x.d.away} (D${x.d.ta})`, p: x.p1.map(v => Math.round(v * 100)), resultat: '1N2'[x.d.y]}));
delete T._r; delete C._r;
const out = {date: new Date().toISOString(), reglage: [...CAL], test: [...TEST], nReglage: cal.length, nTest: test.length,
  parametres: {divisions: Object.fromEntries([2, 3, 4, 5, 6].map((k, i) => [`D${k}`, +P1.c[i].toFixed(3)])), beta: +P1.b.toFixed(3), terrain: +P1.eta.toFixed(3), nul: +P1.th.toFixed(3)},
  test_: T, reglage_: C, criteres: {battreReference: c1, calibrage: c2}, verdict: c1 && c2 ? 'VALIDÉ' : 'REFUSÉ', parSaison, surprises, nomsNonReconnus: [...unmatched].sort(), exemples};
writeFileSync('lab/cdr/result.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({n: [cal.length, test.length], params: out.parametres, test: {...T, tranches: undefined}, tranches: T.tranches, parSaison, surprises, reglage: {perte: C.perteModele, ref: C.perteReference, favori: C.favori}, verdict: out.verdict, criteres: out.criteres, nonReconnus: out.nomsNonReconnus.length}, null, 1));
