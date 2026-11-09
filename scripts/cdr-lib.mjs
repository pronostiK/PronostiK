// Coupe du Roi : outils partagés par le robot (scripts/update.mjs).
// Modèle validé au laboratoire (lab/RAPPORT-CDR.md) : logit ordonné sur la division des clubs + Elo Liga / 2e division.
// NE PAS modifier les paramètres sans nouveau test (règle du projet).
import {resolveName} from '../lib.mjs';

export const CDR_PARAMS = {c: {1: 0, 2: -0.859, 3: -1.044, 4: -1.396, 5: -2.308, 6: -5.044}, beta: 0.404, eta: -0.053, theta: 0.629};
const sig = x => 1 / (1 + Math.exp(-x));
// Probabilités 1/N/2 à 90 minutes. th/ta : divisions (1 = Liga … 6 = régional), zh/za : écart Elo à la moyenne de la division (centaines de points, 0 au-delà de la 2e division).
export function cdrProbs(th, ta, zh = 0, za = 0, neutral = false, P = CDR_PARAMS) {
  const x = P.c[Math.min(th, 6)] - P.c[Math.min(ta, 6)] + P.beta * (zh - za) + (neutral ? 0 : P.eta);
  const h = sig(x - P.theta), a = sig(-x - P.theta);
  return [h, Math.max(1e-6, 1 - h - a), a];
}

// Elo Liga + 2e division (mêmes réglages qu'au laboratoire). rows : {date, home, away, hg, ag, div (1|2)} triés par date.
export function cdrElo(rows) {
  const K = 20, HA = 60, elo = new Map(), divOf = new Map();
  const E = t => elo.get(t) ?? (divOf.get(t) === 2 ? 1400 : 1500);
  for (const m of rows) {
    divOf.set(m.home, m.div); divOf.set(m.away, m.div);
    const eh = E(m.home), ea = E(m.away), exp = 1 / (1 + 10 ** ((ea - eh - HA) / 400)), s = m.hg > m.ag ? 1 : m.hg === m.ag ? 0.5 : 0;
    const g = Math.log(Math.abs(m.hg - m.ag) + 1) + 1;
    elo.set(m.home, eh + K * g * (s - exp)); elo.set(m.away, ea - K * g * (s - exp));
  }
  return E;
}

// Noms Wikipédia / ESPN → noms des fichiers football-data.co.uk (clubs de Liga et de 2e division), clés en minuscules sans accents.
export const CDR_ALIASES = {'athletic bilbao': 'Ath Bilbao', 'cultural y deportiva leonesa': 'Leonesa', 'cultural leonesa': 'Leonesa', 'sporting de gijon': 'Sp Gijon', 'sporting gijon': 'Sp Gijon',
  'racing santander': 'Santander', 'racing de santander': 'Santander', 'racing ferrol': 'Ferrol', 'racing de ferrol': 'Ferrol', 'deportivo de a coruna': 'La Coruna', 'deportivo la coruna': 'La Coruna', 'deportivo': 'La Coruna',
  'real valladolid': 'Valladolid', 'real zaragoza': 'Zaragoza', 'sd eibar': 'Eibar', 'sd huesca': 'Huesca', 'cd leganes': 'Leganes', 'cd mirandes': 'Mirandes', 'cd tenerife': 'Tenerife', 'ud almeria': 'Almeria',
  'cd castellon': 'Castellon', 'cordoba cf': 'Cordoba', 'malaga cf': 'Malaga', 'granada cf': 'Granada', 'cadiz cf': 'Cadiz', 'albacete balompie': 'Albacete', 'burgos cf': 'Burgos', 'sd ponferradina': 'Ponferradina',
  'fc cartagena': 'Cartagena', 'real oviedo': 'Oviedo', 'ud las palmas': 'Las Palmas', 'ce sabadell fc': 'Sabadell', 'cd eldense': 'Eldense', 'ad ceuta fc': 'Ceuta', 'fc andorra': 'Andorra', 'ud logrones': 'Logrones'};

// Page Wikipédia (anglais) de l'édition : division de chaque club.
// 1. tableau « Qualified teams » (division de la saison précédente) ; 2. feuilles de match « Club (4) » (division actuelle, prioritaire).
const TIER_COL = [[/la liga/i, 1], [/segunda divisi/i, 2], [/primera federaci/i, 3], [/segunda federaci/i, 4], [/tercera federaci/i, 5], [/regional/i, 6], [/copa federaci/i, null]];
const linkOf = s => { const m = String(s).match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/); return m ? {title: m[1].trim(), disp: (m[2] || m[1]).trim()} : null; };
export function parseCdrWiki(txt) {
  const clubs = {};   // titre → {disp, tier, src}
  const set = (l, tier, src) => { if (!l) return; const c = clubs[l.title] ||= {disp: l.disp, tier: null, src: null}; if (tier && (src === 'match' || !c.tier)) { c.tier = tier; c.src = src; } };
  const q = txt.indexOf('==Qualified teams=='), qEnd = q >= 0 ? txt.indexOf('\n|}', q) : -1;
  if (q >= 0 && qEnd > q) {
    const block = txt.slice(q, qEnd), lines = block.split('\n');
    const heads = lines.filter(l => /^\|\s*style=.*'''/.test(l)).map(l => (TIER_COL.find(([re]) => re.test(l)) || [null, null])[1]);
    let col = -1, started = false;
    for (const l of lines) {
      if (/^\|-\s*style="vertical-align:top"/.test(l)) { started = true; continue; }
      if (!started) continue;
      if (/^\|\s*$/.test(l)) { col++; continue; }
      if (l.startsWith('*') && col >= 0) set(linkOf(l), heads[col] ?? null, 'table');
    }
  }
  for (const m of txt.matchAll(/\{\{\s*football ?box(?: collapsible)?\s*\n([\s\S]*?)\n\}\}/gi)) {
    for (const k of ['team1', 'team2']) {
      const f = m[1].match(new RegExp(`^\\|[ \\t]*${k}[ \\t]*=[ \\t]*(.*)$`, 'm'));
      if (!f) continue;
      const t = f[1].replace(/<[^>]+>/g, '').match(/\((\d)\)/);
      set(linkOf(f[1]), t ? Number(t[1]) : null, 'match');
    }
  }
  return clubs;
}

// Nom ESPN → club Wikipédia (titre). Comparaison sans accents ni sigles (CD, CF, UD…).
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(cd|cf|ud|sd|ad|ce|cp|fc|club|de|del|la|el|sad|uds|ue|ca|cda|emf|rc|rcd|real|atletico|deportivo|sporting|union|sociedad)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
export function matchCdrClub(name, clubs) {
  const titles = Object.keys(clubs);
  const n = norm(name);
  if (!n) return null;
  const exact = titles.filter(t => norm(t) === n || norm(clubs[t].disp) === n);
  if (exact.length === 1) return exact[0];
  const r = resolveName(name, titles) || resolveName(name, titles.map(t => clubs[t].disp));
  if (r) return clubs[r] ? r : titles.find(t => clubs[t].disp === r) || null;
  const tok = n.split(' ').filter(w => w.length >= 4);
  const cand = titles.filter(t => { const s = norm(t) + ' ' + norm(clubs[t].disp); return tok.length && tok.every(w => s.split(' ').includes(w)); });
  return cand.length === 1 ? cand[0] : null;
}
