// Ligue des champions : outils partagés (laboratoire et robot).
// - parseOpenfootball : résultats de C1 au format texte openfootball (score à 90 minutes, finale sur terrain neutre)
// - createEuroElo : Elo européen unique (championnats nationaux + C1), pour comparer des clubs de pays différents
import {resolveName} from '../lib.mjs';

const MON = {Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12};
// Codes pays openfootball → championnat national de nos données (Monaco joue en France).
export const COUNTRY_OF = {MCO: 'FRA'};

export function parseOpenfootball(txt) {
  const out = []; let y = null, date = null, stage = '';
  const m0 = txt.match(/(\d{4})\/(\d{2})/); const y1 = m0 ? +m0[1] : null;
  for (const raw of txt.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (/^▪/.test(line.trim())) { stage = line.trim().slice(1).trim(); continue; }
    const dm = line.match(/^\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:\s+(\d{4}))?\s*$/);
    if (dm) { const mo = MON[dm[1]]; y = dm[3] ? +dm[3] : (y ?? (mo >= 7 ? y1 : y1 + 1)); if (!dm[3] && date && mo < +date.slice(5, 7) - 3) y = y + 1; date = `${y}-${String(mo).padStart(2, '0')}-${dm[2].padStart(2, '0')}`; continue; }
    const mm = line.match(/^\s+(?:\d{1,2}[:.]\d{2}\s+)?(.+?)\s+\(([A-Z]{3})\)\s+v\s+(.+?)\s+\(([A-Z]{3})\)\s+(\d+)-(\d+)(\s+a\.e\.t\.)?(?:\s+\((\d+)-(\d+)(?:,\s*(\d+)-(\d+))?\))?/);
    if (!mm || !date) continue;
    let hg = +mm[5], ag = +mm[6];
    if (mm[7] && mm[8] != null) { hg = +mm[8]; ag = +mm[9]; }          // prolongation : score à 90 minutes
    out.push({date, home: mm[1].trim(), hc: COUNTRY_OF[mm[2]] || mm[2], away: mm[3].trim(), ac: COUNTRY_OF[mm[4]] || mm[4], hg, ag, neutral: /(^|, )Final$/i.test(stage), stage});
  }
  return out;
}

// Noms de C1 → noms des fichiers nationaux, quand la recherche approchée ne suffit pas.
export const CL_ALIASES = {
  POR: {'sport lisboa e benfica': 'Benfica', 'sl benfica': 'Benfica', 'sporting clube de portugal': 'Sp Lisbon', 'sporting cp': 'Sp Lisbon', 'fc porto': 'Porto', 'sporting braga': 'Sp Braga', 'sporting clube de braga': 'Sp Braga', 'sc braga': 'Sp Braga'},
  NED: {'psv': 'PSV Eindhoven', 'psv eindhoven': 'PSV Eindhoven', 'feyenoord rotterdam': 'Feyenoord', 'afc ajax': 'Ajax', 'az alkmaar': 'AZ Alkmaar', 'fc twente': 'Twente'},
  BEL: {'club brugge kv': 'Club Brugge', 'club brugge': 'Club Brugge', 'krc genk': 'Genk', 'kaa gent': 'Gent', 'royale union saint gilloise': 'St. Gilloise', 'union saint gilloise': 'St. Gilloise', 'rsc anderlecht': 'Anderlecht', 'royal antwerp fc': 'Antwerp'},
  SCO: {'celtic fc': 'Celtic', 'rangers fc': 'Rangers'},
  TUR: {'galatasaray': 'Galatasaray', 'galatasaray sk': 'Galatasaray', 'fenerbahce': 'Fenerbahce', 'besiktas': 'Besiktas', 'besiktas jk': 'Besiktas', 'istanbul basaksehir': 'Buyuksehyr'},
  GRE: {'olympiacos': 'Olympiakos', 'olympiacos fc': 'Olympiakos', 'olympiakos': 'Olympiakos', 'aek athens': 'AEK', 'aek athens fc': 'AEK', 'paok': 'PAOK', 'panathinaikos': 'Panathinaikos'},
  AUT: {'fc red bull salzburg': 'Salzburg', 'red bull salzburg': 'Salzburg', 'sk sturm graz': 'Sturm Graz', 'lask': 'LASK', 'sk rapid wien': 'Rapid Vienna'},
  SUI: {'bsc young boys': 'Young Boys', 'fc basel 1893': 'Basel', 'fc basel': 'Basel'},
  DEN: {'fc k benhavn': 'FC Copenhagen', 'fc kobenhavn': 'FC Copenhagen', 'fc copenhagen': 'FC Copenhagen', 'fc midtjylland': 'Midtjylland'},
  NOR: {'fk bod glimt': 'Bodo/Glimt', 'fk bodo glimt': 'Bodo/Glimt', 'bodo glimt': 'Bodo/Glimt', 'molde fk': 'Molde'},
  RUS: {'cska moskva': 'CSKA Moscow', 'spartak moskva': 'Spartak Moscow', 'lokomotiv moskva': 'Lokomotiv Moscow', 'zenit st petersburg': 'Zenit'},
  SWE: {'malmo ff': 'Malmo FF'},
  ENG: {'manchester city fc': 'Man City', 'manchester city': 'Man City', 'manchester united fc': 'Man United', 'manchester united': 'Man United', 'tottenham hotspur fc': 'Tottenham', 'tottenham hotspur': 'Tottenham', 'newcastle united fc': 'Newcastle', 'newcastle united': 'Newcastle'},
  GER: {'fc bayern munchen': 'Bayern Munich', 'bayern munchen': 'Bayern Munich', 'borussia dortmund': 'Dortmund', 'bayer 04 leverkusen': 'Leverkusen', 'eintracht frankfurt': 'Ein Frankfurt', 'borussia monchengladbach': "M'gladbach", 'bor monchengladbach': "M'gladbach", 'vfb stuttgart': 'Stuttgart', 'tsg 1899 hoffenheim': 'Hoffenheim', 'vfl wolfsburg': 'Wolfsburg', '1 fc union berlin': 'Union Berlin'},
  ITA: {'fc internazionale milano': 'Inter', 'internazionale': 'Inter', 'ac milan': 'Milan', 'ssc napoli': 'Napoli', 'as roma': 'Roma', 'ss lazio': 'Lazio', 'lazio roma': 'Lazio', 'atalanta bc': 'Atalanta', 'bologna fc 1909': 'Bologna', 'juventus fc': 'Juventus'},
  ESP: {'club atletico de madrid': 'Ath Madrid', 'atletico madrid': 'Ath Madrid', 'athletic club': 'Ath Bilbao', 'real madrid cf': 'Real Madrid', 'fc barcelona': 'Barcelona', 'villarreal cf': 'Villarreal', 'sevilla fc': 'Sevilla', 'real sociedad de futbol': 'Sociedad', 'real sociedad': 'Sociedad', 'girona fc': 'Girona', 'valencia cf': 'Valencia', 'real betis balompie': 'Betis'},
  FRA: {'paris saint germain fc': 'Paris SG', 'paris saint germain': 'Paris SG', 'as monaco fc': 'Monaco', 'olympique de marseille': 'Marseille', 'olympique lyonnais': 'Lyon', 'stade brestois 29': 'Brest', 'losc lille': 'Lille', 'lille osc': 'Lille', 'rc lens': 'Lens', 'ogc nice': 'Nice', 'stade rennais fc 1901': 'Rennes'},
};

// Clé d'équipe unique : « PAYS|nom national » si le club est retrouvé dans son championnat, sinon « PAYS|nom C1 ».
export function makeResolver(knownByCountry) {
  const cache = new Map(), seen = {};
  return (name, c) => {
    const k = c + '|' + name;
    if (cache.has(k)) return cache.get(k);
    let r = null;
    if (knownByCountry[c]) r = resolveName(name, knownByCountry[c], CL_ALIASES[c] || {}, c === 'FRA');
    else { const s = seen[c] ||= []; r = s.length ? resolveName(name, s, {}) : null; if (!r) { s.push(name); r = name; } }   // pays sans championnat suivi : même club, noms différents selon la saison
    const out = c + '|' + (r || name);
    cache.set(k, out); return out;
  };
}

// Elo européen : un seul classement pour tous les clubs. Les matchs nationaux font bouger les clubs à l'intérieur
// d'un pays ; les matchs de C1 font circuler les points entre pays. Un club qui apparaît pour la première fois
// démarre au niveau de départ de son pays (réglé sur les C1 passées) ou au bas de son championnat (promu).
export const EURO_ELO_DEFAULTS = {K: 20, H: 80, Kcl: 30, Hcl: 70, init: {}, initMinor: 1400, ord: {b: 0.55, t1: -0.4, t2: 0.8}};
const G = gd => gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;

export function runEuroElo(events, P, onCL, seed = null, onPlayed = null) {
  // events : triés par date ; {date, h, a, hc, ac, hg, ag, cl, neutral}. seed : notes de départ {"PAYS|club": elo}.
  const r = new Map(), byCountry = new Map();
  if (seed) for (const [t, v] of Object.entries(seed)) { const c = t.split('|')[0]; r.set(t, v); if (!byCountry.has(c)) byCountry.set(c, []); byCountry.get(c).push(t); }
  const add = (t, c) => {
    if (r.has(t)) return;
    let v;
    const lst = byCountry.get(c);
    if (lst && lst.length >= 8) { const s = lst.map(x => r.get(x)).sort((x, y) => x - y); v = (s[0] + s[1] + s[2]) / 3; }
    else v = P.init[c] ?? P.initMinor;
    r.set(t, v); if (!byCountry.has(c)) byCountry.set(c, []); byCountry.get(c).push(t);
  };
  for (let i = 0; i < events.length;) {
    const d = events[i].date, day = [];
    while (i < events.length && events[i].date === d) day.push(events[i++]);
    for (const e of day) { add(e.h, e.hc); add(e.a, e.ac); }
    if (onCL) for (const e of day) if (e.cl) onCL(e, r.get(e.h), r.get(e.a));
    for (const e of day) {
      if (e.hg == null) continue;
      const H = e.cl ? (e.neutral ? 0 : P.Hcl) : P.H, K = e.cl ? P.Kcl : P.K;
      const x = r.get(e.h) + H - r.get(e.a), E = 1 / (1 + 10 ** (-x / 400)), S = e.hg > e.ag ? 1 : e.hg === e.ag ? 0.5 : 0, k = K * G(Math.abs(e.hg - e.ag));
      r.set(e.h, r.get(e.h) + k * (S - E)); r.set(e.a, r.get(e.a) - k * (S - E));
      if (onPlayed) onPlayed(e);
    }
  }
  return {ratings: r, add};
}

const sig = z => 1 / (1 + Math.exp(-z));
export function ordProbs(x, q) { const pA = sig(q.t1 - q.b * x), pAD = sig(q.t2 - q.b * x); return [1 - pAD, Math.max(1e-9, pAD - pA), pA]; }

// Probabilités d'un match de C1 à partir des notes : 1N2 (modèle ordonné, testé) et buts attendus (Poisson).
export function uclPredict(rh, ra, neutral, P) {
  const g = P.goals, one = (a, b) => { const x = (a + P.Hcl - b) / 100; return {p: ordProbs(x, P.ord), lam: [Math.exp(g.home.a + g.home.b * x), Math.exp(g.away.a - g.away.b * x)], x}; };
  if (!neutral) return one(rh, ra);
  // Terrain neutre (finale) : moyenne des deux situations « à domicile » et « à l'extérieur »
  const u = one(rh, ra), v = one(ra, rh);
  return {p: [0, 1, 2].map(k => (u.p[k] + v.p[2 - k]) / 2), lam: [(u.lam[0] + v.lam[1]) / 2, (u.lam[1] + v.lam[0]) / 2], x: (rh - ra) / 100};
}

// Championnats nationaux hors des 5 suivis (servent uniquement à l'Elo européen).
export const EXTRA_MAIN = {BEL: 'B1', SCO: 'SC0', TUR: 'T1', GRE: 'G1'};
export const EXTRA_NEW = {AUT: 'AUT', SUI: 'SWZ', DEN: 'DNK', NOR: 'NOR', SWE: 'SWE', POL: 'POL', ROU: 'ROU'};
export const LG_COUNTRY = {FL1: 'FRA', PL: 'ENG', BL1: 'GER', SA: 'ITA', PD: 'ESP', PPL: 'POR', DED: 'NED'};
export const EXTRA_VERSION = 2;   // 2 : Portugal et Pays-Bas viennent désormais de l'historique principal
const splitCSV = l => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o.map(x => x.trim()); };
const isoDate = d => { const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; };
// Renvoie [date, pays, domicile, extérieur, buts dom, buts ext] pour les matchs joués à partir de « from ».
export function parseDomesticCSV(txt, c, kind, from) {
  const lines = txt.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean); if (!lines.length) return [];
  const H = splitCSV(lines[0]), ix = n => H.indexOf(n);
  const [iD, iH, iA, iG, iJ] = kind === 'main' ? [ix('Date'), ix('HomeTeam'), ix('AwayTeam'), ix('FTHG'), ix('FTAG')] : [ix('Date'), ix('Home'), ix('Away'), ix('HG'), ix('AG')];
  const out = [];
  for (const l of lines.slice(1)) {
    const f = splitCSV(l), d = isoDate(f[iD] || ''), hg = f[iG], ag = f[iJ];
    if (!d || d < from || !f[iH] || !f[iA] || hg == null || ag == null || hg === '' || ag === '' || isNaN(+hg) || isNaN(+ag)) continue;
    out.push([d, c, f[iH], f[iA], +hg, +ag]);
  }
  return out;
}
// Pays d'un club selon football-data.org (nom de la zone, ou code).
const AREA = {england: 'ENG', spain: 'ESP', germany: 'GER', italy: 'ITA', france: 'FRA', monaco: 'FRA', portugal: 'POR', netherlands: 'NED', belgium: 'BEL', scotland: 'SCO', turkey: 'TUR', turkiye: 'TUR', 'türkiye': 'TUR', greece: 'GRE',
  austria: 'AUT', switzerland: 'SUI', denmark: 'DEN', norway: 'NOR', sweden: 'SWE', poland: 'POL', romania: 'ROU', russia: 'RUS', czechia: 'CZE', 'czech republic': 'CZE', croatia: 'CRO', serbia: 'SRB', ukraine: 'UKR',
  kazakhstan: 'KAZ', cyprus: 'CYP', azerbaijan: 'AZE', slovakia: 'SVK', slovenia: 'SVN', hungary: 'HUN', israel: 'ISR', moldova: 'MDA', bulgaria: 'BUL', belarus: 'BLR', kosovo: 'KOS', ireland: 'IRL', wales: 'WAL', finland: 'FIN', iceland: 'ISL'};
const AREA_CODE = {DEU: 'GER', NLD: 'NED', PRT: 'POR', GRC: 'GRE', CHE: 'SUI', DNK: 'DEN', ROU: 'ROU', HRV: 'CRO', SRB: 'SRB', CZE: 'CZE', MCO: 'FRA'};
export function countryOfArea(area) {
  if (!area) return null;
  const n = String(area.name || '').toLowerCase();
  return AREA[n] || AREA_CODE[area.code] || (area.code ? String(area.code).slice(0, 3).toUpperCase() : null);
}
