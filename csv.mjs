// Lecture des CSV de football-data.co.uk (résultats + cotes moyennes).
import {SECOND_DIVISIONS} from './leagues.mjs';

function parseDate(s) {
  if (!s) return null;
  const p = String(s).trim().split(/[\/.-]/);
  if (p.length !== 3) return null;
  let d, m, y;
  if (p[0].length === 4) [y, m, d] = p.map(Number); else [d, m, y] = p.map(Number);
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}
const num = v => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };

function tokenize(text) {
  const rows = []; let row = [], field = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"') { if (quoted && n === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && n === '\n') i++; row.push(field); if (row.some(x => x.trim() !== '')) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function parseCSV(text, lg) {
  const rows = tokenize(text);
  const headers = rows.shift().map(h => h.trim());
  const ix = {}; headers.forEach((h, i) => ix[h] = i);
  const get = (r, k) => ix[k] === undefined ? '' : r[ix[k]] ?? '';
  const out = [];
  for (const r of rows) {
    const date = parseDate(get(r, 'Date')), home = get(r, 'HomeTeam').trim(), away = get(r, 'AwayTeam').trim();
    const hs = get(r, 'FTHG').trim(), as = get(r, 'FTAG').trim(), hg = Number(hs), ag = Number(as);
    if (!date || !home || !away || hs === '' || as === '' || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const div = String(get(r, 'Div') || '').trim().toUpperCase();
    out.push({
      date, home, away, hg, ag, lg, division: SECOND_DIVISIONS.has(div) ? 'L2' : 'L1',
      avgH: num(get(r, 'AvgCH')) || num(get(r, 'AvgH')), avgD: num(get(r, 'AvgCD')) || num(get(r, 'AvgD')), avgA: num(get(r, 'AvgCA')) || num(get(r, 'AvgA')),
    });
  }
  return out;
}

// fixtures.csv : matchs à venir avec les cotes (pas de score). Renvoie {div, date, home, away, mk:[p1,pN,p2] | null}.
// mk = probabilités du marché, marge retirée : cotes moyennes (AvgH/D/A) si présentes, sinon moyenne de quelques bookmakers.
const BOOKS = ['B365', 'BW', 'IW', 'PS', 'WH', 'VC'];
export function parseFixtures(text) {
  const rows = tokenize(text);
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.trim());
  const ix = {}; headers.forEach((h, i) => ix[h] = i);
  const get = (r, k) => ix[k] === undefined ? '' : r[ix[k]] ?? '';
  const norm = o => { if (!o.every(v => v && v > 1)) return null; const raw = o.map(v => 1 / v), s = raw.reduce((a, b) => a + b, 0); return raw.map(v => v / s); };
  const out = [];
  for (const r of rows) {
    const date = parseDate(get(r, 'Date')), home = get(r, 'HomeTeam').trim(), away = get(r, 'AwayTeam').trim(), div = String(get(r, 'Div')).trim().toUpperCase();
    if (!date || !home || !away || !div) continue;
    let mk = norm([num(get(r, 'AvgH')), num(get(r, 'AvgD')), num(get(r, 'AvgA'))]);
    if (!mk) {
      const all = BOOKS.map(b => norm([num(get(r, b + 'H')), num(get(r, b + 'D')), num(get(r, b + 'A'))])).filter(Boolean);
      if (all.length) mk = [0, 1, 2].map(k => all.reduce((s, p) => s + p[k], 0) / all.length);
    }
    out.push({div, date, home, away, mk});
  }
  return out;
}
