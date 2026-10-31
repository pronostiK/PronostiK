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

export function parseCSV(text, lg) {
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
  if (!rows.length) return [];
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
