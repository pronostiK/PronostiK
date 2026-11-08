// Étude Dixon-Coles : v2 contre v2 + correction Dixon-Coles des petits scores (0-0, 1-0, 0-1, 1-1).
// Réglage de rho sur 2024-25, test unique de août 2025 à aujourd'hui. Lecture seule.
import {readFileSync} from 'node:fs';
import {createRatings} from '../model.mjs';
const hist = JSON.parse(readFileSync(new URL('../data/history.json', import.meta.url)));
const LGS = ['FL1', 'PL', 'BL1', 'SA', 'PD', 'PPL', 'DED', 'ELC'];
const pois = (k, l) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
const tau = (i, j, a, b, r) => i === 0 && j === 0 ? 1 - a * b * r : i === 0 && j === 1 ? 1 + a * r : i === 1 && j === 0 ? 1 + b * r : i === 1 && j === 1 ? 1 - r : 1;
function probs(a, b, r) { const o = [0, 0, 0]; let sc = 0, S = 0; const M = [];
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const p = pois(i, a) * pois(j, b) * tau(i, j, a, b, r); o[i > j ? 0 : i === j ? 1 : 2] += p; S += p; M.push([i, j, p]); }
  return {p: o.map(v => v / S), M, S}; }
const rows = [];
for (const lg of LGS) {
  const H = hist.filter(m => m.lg === lg).sort((a, b) => a.date.localeCompare(b.date)), R = createRatings(H);
  for (const m of H.filter(m => (m.division || 'L1') === 'L1' && m.date >= '2024-08-01')) {
    const r = R.predict(m.home, m.away, m.date); if (!r) continue;
    rows.push({lg, per: m.date >= '2025-08-01' ? 'test' : 'dev', a: r.lamH, b: r.lamA, hg: m.hg, ag: m.ag, y: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2});
  }
}
const ll = (p, y) => -Math.log(Math.max(1e-12, p[y])), br = (p, y) => p.reduce((s, v, k) => s + (v - (k === y)) ** 2, 0);
const scoreLL = (x, r) => { const q = probs(x.a, x.b, r), c = q.M.find(([i, j]) => i === Math.min(10, x.hg) && j === Math.min(10, x.ag)); return -Math.log(Math.max(1e-12, c[2] / q.S)); };
const DEV = rows.filter(x => x.per === 'dev'), TEST = rows.filter(x => x.per === 'test');
let best = {r: 0, v: Infinity};
for (let r = -0.25; r <= 0.1001; r += 0.01) { const v = DEV.reduce((s, x) => s + ll(probs(x.a, x.b, r).p, x.y), 0) / DEV.length; if (v < best.v) best = {r: +r.toFixed(2), v}; }
const stat = (S, f) => { const d = S.map(f), m = d.reduce((a, b) => a + b, 0) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (d.length - 1)), se = sd / Math.sqrt(d.length); return `n ${d.length} écart ${m.toFixed(5)} IC95 [${(m - 1.96 * se).toFixed(5)} ; ${(m + 1.96 * se).toFixed(5)}]`; };
const D = (S, f) => stat(S, x => f(probs(x.a, x.b, best.r).p, x.y) - f(probs(x.a, x.b, 0).p, x.y));
console.log('rho réglé sur 2024-25 :', best.r, '| dev', DEV.length, 'test', TEST.length);
console.log('TOTAL 1N2 log-loss', D(TEST, ll)); console.log('TOTAL 1N2 Brier', D(TEST, br));
console.log('TOTAL score exact log-loss', stat(TEST, x => scoreLL(x, best.r) - scoreLL(x, 0)));
const nul = S => [S.reduce((s, x) => s + probs(x.a, x.b, 0).p[1], 0) / S.length, S.reduce((s, x) => s + probs(x.a, x.b, best.r).p[1], 0) / S.length, S.filter(x => x.y === 1).length / S.length].map(v => (100 * v).toFixed(1));
console.log('Nuls prévus v2 / v2+DC / réels (%) :', nul(TEST).join(' / '));
for (const lg of LGS) { const S = TEST.filter(x => x.lg === lg); if (S.length) console.log(lg, '1N2 log-loss', D(S, ll)); }
