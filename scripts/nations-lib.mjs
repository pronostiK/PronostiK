// Équipes nationales : Elo « World Football » (pondération par type de match, écart de buts, avantage du terrain).
// Code partagé entre le laboratoire (scripts/lab-nations-fit.mjs) et le robot.
export function parseResults(csv) {
  const out = [];
  for (const l of csv.trim().split('\n').slice(1)) {
    const f = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { f.push(c); c = ''; } else c += ch; } f.push(c);
    const [date, home, away, hs, as, tournament, , , neutral] = f;
    if (hs === 'NA' || hs === '' || as === '' || isNaN(+hs) || isNaN(+as)) continue;
    out.push({date, home, away, hg: +hs, ag: +as, t: tournament, neutral: neutral.trim() === 'TRUE'});
  }
  return out;
}
export function kOf(t) {
  if (t === 'FIFA World Cup') return 60;
  if (/^(UEFA Euro|Copa América|African Cup of Nations|AFC Asian Cup|Gold Cup|Confederations Cup)$/.test(t)) return 50;
  if (/qualification|Nations League/i.test(t)) return 40;
  if (t === 'Friendly') return 20;
  return 30;
}
const G = gd => gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
// Parcourt les matchs (triés) ; onMatch(m, rh, ra) est appelé AVANT la mise à jour (prédiction sans fuite).
export function runNationsElo(matches, P, onMatch, seed = null) {
  const r = new Map(seed ? Object.entries(seed) : []);
  const get = t => r.has(t) ? r.get(t) : P.init;
  for (const m of matches) {
    const rh = get(m.home), ra = get(m.away);
    if (onMatch) onMatch(m, rh, ra);
    const x = rh + (m.neutral ? 0 : P.H) - ra, E = 1 / (1 + 10 ** (-x / 400)), S = m.hg > m.ag ? 1 : m.hg === m.ag ? 0.5 : 0, k = kOf(m.t) * P.kMul * G(Math.abs(m.hg - m.ag));
    r.set(m.home, rh + k * (S - E)); r.set(m.away, ra - k * (S - E));
  }
  return r;
}
const sig = z => 1 / (1 + Math.exp(-z));
export function nationsPredict(rh, ra, neutral, P) {
  const one = (a, b) => { const x = (a + P.H - b) / 100, q = P.ord, pA = sig(q.t1 - q.b * x), pAD = sig(q.t2 - q.b * x), g = P.goals;
    return {p: [1 - pAD, Math.max(1e-9, pAD - pA), pA], lam: [Math.exp(g.home.a + g.home.b * x), Math.exp(g.away.a - g.away.b * x)]}; };
  if (!neutral) return one(rh, ra);
  const u = one(rh, ra), v = one(ra, rh);
  return {p: [0, 1, 2].map(k => (u.p[k] + v.p[2 - k]) / 2), lam: [(u.lam[0] + v.lam[1]) / 2, (u.lam[1] + v.lam[0]) / 2]};
}
// Noms UEFA → noms de la base de résultats
export const NATION_ALIASES = {'Türkiye': 'Turkey', 'Türki̇ye': 'Turkey', 'Turkiye': 'Turkey', 'Czechia': 'Czech Republic', 'Republic of Ireland': 'Republic of Ireland', 'Northern Ireland': 'Northern Ireland', 'Bosnia-Herzegovina': 'Bosnia and Herzegovina', 'FYR Macedonia': 'North Macedonia'};
export const nationName = n => NATION_ALIASES[n] || NATION_ALIASES[String(n).normalize('NFC')] || String(n).normalize('NFC').replace('İ', 'I');

// Graine : notes Elo à la date du fichier + matchs récents (forme, face-à-face) des sélections européennes.
export function buildNationsSeed(csv, P) {
  const all = parseResults(csv).sort((a, b) => a.date.localeCompare(b.date));
  const ratings = runNationsElo(all, P);
  const UEFA = new Set(); for (const m of all) if (/UEFA|Euro/.test(m.t)) { UEFA.add(m.home); UEFA.add(m.away); }
  const recent = all.filter(m => m.date >= '2016-01-01' && (UEFA.has(m.home) || UEFA.has(m.away))).map(m => [m.date, m.home, m.away, m.hg, m.ag]);
  return {asOf: all[all.length - 1].date, params: P, ratings: Object.fromEntries([...ratings].map(([k, v]) => [k, Math.round(v * 10) / 10])), recent};
}
