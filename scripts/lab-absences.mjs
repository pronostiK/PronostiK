// Étude absences : v2 contre v2 + absences. Réglage sur 2023-24, test unique sur 2024-25.
import {readFileSync, readdirSync} from 'node:fs';
import {createRatings} from '../model.mjs';
const AB = process.argv[2] || 'lab/absences';
const hist = JSON.parse(readFileSync(new URL('../data/history.json', import.meta.url)));
const LGS = ['FL1', 'PL', 'BL1', 'SA', 'PD'], GAMES = {BL1: 34, FL1: 34};
const files = readdirSync(AB);
// importance : part des minutes jouées la saison précédente
const imp = {2023: {}, 2024: {}};
for (const f of files.filter(f => f.startsWith('team-'))) {
  const [, lg, s] = f.split('-'), S = +s + 1;
  for (const p of JSON.parse(readFileSync(`${AB}/${f}`))) {
    const sh = Math.min(1, (p.min || 0) / ((GAMES[lg] || 38) * 90)), att = p.pos === 'Attacker' || p.pos === 'Midfielder';
    if (!imp[S][p.pid] || imp[S][p.pid].sh < sh) imp[S][p.pid] = {sh, att};
  }
}
const pois = (k, l) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
const x12 = (a, b) => { let H = 0, D = 0, A = 0; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const p = pois(i, a) * pois(j, b); if (i > j) H += p; else if (i === j) D += p; else A += p; } const s = H + D + A; return [H / s, D / s, A / s]; };
const rows = []; let unmatched = 0, cover = 0;
for (const lg of LGS) {
  const H = hist.filter(m => m.lg === lg).sort((a, b) => a.date.localeCompare(b.date)), R = createRatings(H);
  const fx = new Map(); // date|teamId -> {att, def}
  const apiDates = {};
  for (const S of [2023, 2024]) {
    for (const i of JSON.parse(readFileSync(`${AB}/inj-${lg}-${S}.json`))) {
      const d = i.date.slice(0, 10); (apiDates[i.teamId] ||= new Set()).add(d);
      if (i.type !== 'Missing Fixture') continue;
      const k = d + '|' + i.teamId, o = fx.get(k) || {att: 0, def: 0, n: 0}, w = imp[S][i.pid];
      if (w) { o[w.att ? 'att' : 'def'] += w.sh; } o.n++; fx.set(k, o);
    }
  }
  // correspondance noms : équipe API ↔ équipe de l'historique par recouvrement des dates
  const hDates = {}; H.forEach(m => { (hDates[m.home] ||= new Set()).add(m.date); (hDates[m.away] ||= new Set()).add(m.date); });
  const map = {};
  for (const [id, ds] of Object.entries(apiDates)) {
    let best = null, bs = 0; for (const [n, hs] of Object.entries(hDates)) { let c = 0; ds.forEach(d => hs.has(d) && c++); if (c > bs) { bs = c; best = n; } }
    if (bs >= 5) map[best] = id;
  }
  for (const m of H.filter(m => m.division === 'L1' && m.date >= '2023-08-01' && m.date < '2025-07-01')) {
    const r = R.predict(m.home, m.away, m.date); if (!r) continue;
    const ih = map[m.home], ia = map[m.away]; if (!ih || !ia) { unmatched++; continue; }
    const g = id => fx.get(m.date + '|' + id) || {att: 0, def: 0, n: 0}, h = g(ih), a = g(ia);
    if (h.n || a.n) cover++;
    rows.push({lg, S: m.date < '2024-07-01' ? 'reg' : 'test', lam: [r.lamH, r.lamA], h, a, y: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2});
  }
}
const pred = (r, al, be) => x12(r.lam[0] * Math.exp(-al * r.h.att + be * r.a.def), r.lam[1] * Math.exp(-al * r.a.att + be * r.h.def));
const ll = (p, y) => -Math.log(Math.max(1e-12, p[y])), br = (p, y) => p.reduce((s, v, k) => s + (v - (k === y)) ** 2, 0);
const REG = rows.filter(r => r.S === 'reg'), TEST = rows.filter(r => r.S === 'test');
REG.forEach(r => r.p0 = x12(...r.lam)); TEST.forEach(r => r.p0 = x12(...r.lam));
let best = {al: 0, be: 0, v: Infinity};
for (let al = 0; al <= 0.8001; al += 0.05) for (let be = 0; be <= 0.8001; be += 0.05) {
  const v = REG.reduce((s, r) => s + ll(pred(r, al, be), r.y), 0) / REG.length; if (v < best.v) best = {al, be, v};
}
const v0 = REG.reduce((s, r) => s + ll(r.p0, r.y), 0) / REG.length;
const stat = (S, f) => { const d = S.map(r => f(r.p1, r.y) - f(r.p0, r.y)), m = d.reduce((a, b) => a + b, 0) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (d.length - 1)), se = sd / Math.sqrt(d.length); return {n: d.length, diff: +m.toFixed(5), lo: +(m - 1.96 * se).toFixed(5), hi: +(m + 1.96 * se).toFixed(5)}; };
TEST.forEach(r => r.p1 = pred(r, best.al, best.be));
console.log(JSON.stringify({rows: rows.length, reg: REG.length, test: TEST.length, unmatched, cover, params: {alpha: +best.al.toFixed(2), beta: +best.be.toFixed(2)}, regLL: {v2: +v0.toFixed(5), abs: +best.v.toFixed(5)}}));
console.log('TOTAL logloss', JSON.stringify(stat(TEST, ll)), 'brier', JSON.stringify(stat(TEST, br)));
for (const lg of LGS) { const S = TEST.filter(r => r.lg === lg); console.log(lg, 'logloss', JSON.stringify(stat(S, ll)), 'brier', JSON.stringify(stat(S, br))); }
const avg = k => (TEST.reduce((s, r) => s + r.h[k] + r.a[k], 0) / TEST.length / 2).toFixed(3);
console.log('absence moyenne par équipe (part de minutes) att', avg('att'), 'def', avg('def'));
