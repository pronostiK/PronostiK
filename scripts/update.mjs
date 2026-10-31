// Mise à jour automatique de PronostiK (multi-championnats).
// 1. historique gratuit (CSV football-data.co.uk), rafraîchi toutes les semaines
// 2. résultats et calendrier (football-data.org, clé dans FD_TOKEN), une requête par championnat
// 3. pronostics des 7 prochains jours, figés au coup d'envoi puis réglés à la fin du match
// 4. test de fiabilité par championnat (modèle contre cotes du marché)
// Les fichiers écrits sont dans data/ ; le site ne fait que les lire.
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createModel, createRatings} from '../model.mjs';
import {footballDataDate, resolveName} from '../lib.mjs';
import {LEAGUES, ALIASES} from '../leagues.mjs';
import {parseCSV, parseFixtures} from '../csv.mjs';

const API = process.env.FD_API_BASE || 'https://api.football-data.org/v4';
const CSV_BASE = process.env.CSV_BASE || 'https://www.football-data.co.uk';
const TOKEN = process.env.FD_TOKEN;
const NOW = process.env.NOW ? new Date(process.env.NOW) : new Date();
const DATA = process.env.DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url));
const API_DELAY = Number(process.env.API_DELAY_MS ?? 7000); // plan gratuit : 10 requêtes par minute
const HORIZON_DAYS = 7;
const COEFF = 0.72;            // coefficient division inférieure → première division (réglage de la page PronostiK)
const CSV_SEASONS = 4;         // saison en cours + 3 précédentes
const CSV_REFRESH_DAYS = 6;
const BACKTEST_START = '2025-08-01';

mkdirSync(DATA, {recursive: true});
const path = f => join(DATA, f);
const readJSON = (f, fallback) => existsSync(path(f)) ? JSON.parse(readFileSync(path(f), 'utf8')) : fallback;
const r4 = v => Math.round(v * 10000) / 10000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let changed = false;
function writeIfChanged(f, obj) {
  const next = JSON.stringify(obj);
  const prev = existsSync(path(f)) ? readFileSync(path(f), 'utf8') : null;
  if (prev !== next) { writeFileSync(path(f), next); changed = true; console.log('écrit', f); }
}
const parisDate = d => footballDataDate(d.toISOString());
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const outcome = (hg, ag) => hg > ag ? 'H' : hg < ag ? 'A' : 'D';

async function api(p) {
  const res = await fetch(API + p, {headers: {'X-Auth-Token': TOKEN}});
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch {}
    throw new Error(`football-data.org a répondu ${res.status}. ${detail}`.trim());
  }
  return res.json();
}

async function downloadCSVs(league, seasonStart) {
  const rows = [];
  for (let k = 0; k < CSV_SEASONS; k++) {
    const y = seasonStart - k, code = `${String(y).slice(2)}${String(y + 1).slice(2)}`;
    for (const c of league.csv) {
      const url = `${CSV_BASE}/mmz4281/${code}/${c}.csv`;
      try {
        const r = await fetch(url);
        if (!r.ok) { console.log(`  CSV ${c} ${code} : HTTP ${r.status} (ignoré)`); continue; }
        rows.push(...parseCSV(await r.text(), league.code));
      } catch (e) { console.log(`  CSV ${c} ${code} : ${e.message} (ignoré)`); }
    }
  }
  return rows;
}

async function main() {
  if (!TOKEN) throw new Error('Secret FD_TOKEN manquant : ajoute ta clé football-data.org dans les secrets du dépôt.');
  const todayStr = parisDate(NOW);
  const y = Number(todayStr.slice(0, 4)), mo = Number(todayStr.slice(5, 7));
  const season = mo >= 7 ? y : y - 1;

  let history = readJSON('history.json', []);
  for (const m of history) if (!m.lg) m.lg = 'FL1';           // anciennes lignes : Ligue 1 / Ligue 2
  let predictions = readJSON('predictions.json', []);
  for (const p of predictions) if (!p.lg) p.lg = 'FL1';
  const state = readJSON('state.json', {csvAt: {}});
  const errors = {}, unmapped = new Map(), csvRefreshed = new Set();
  const key = m => `${m.lg}|${m.date}|${m.home}|${m.away}`;
  const byKey = new Map(history.map(m => [key(m), m]));

  // --- 1. historique CSV (première fois, puis une fois par semaine)
  for (const lg of LEAGUES) {
    const count = history.filter(m => m.lg === lg.code).length;
    const last = state.csvAt[lg.code] ? new Date(state.csvAt[lg.code]) : null;
    const stale = !last || (NOW - last) > CSV_REFRESH_DAYS * 86400000;
    if (!(stale || count < 200 || process.env.FORCE_CSV)) continue;
    console.log(`Historique ${lg.name}…`);
    const rows = await downloadCSVs(lg, season);
    if (!rows.length) {
      if (count < 200) errors[lg.code] = 'Historique introuvable (CSV)';
      else state.csvAt[lg.code] = NOW.toISOString();   // on retentera dans une semaine
      continue;
    }
    for (const r of rows) {
      const old = byKey.get(key(r));
      if (old) Object.assign(old, r); else { history.push(r); byKey.set(key(r), r); }
    }
    state.csvAt[lg.code] = NOW.toISOString(); csvRefreshed.add(lg.code);
  }

  // --- 2. API : une requête par championnat
  const apiByLeague = {};
  let apiOk = 0;
  for (const [i, lg] of LEAGUES.entries()) {
    if (errors[lg.code]) continue;
    if (i > 0 && API_DELAY) await sleep(API_DELAY);
    try {
      const j = await api(`/competitions/${lg.code}/matches?season=${season}`);
      if (!(j.matches || []).length) throw new Error('Aucun match reçu.');
      apiByLeague[lg.code] = j.matches; apiOk++;
    } catch (e) { errors[lg.code] = e.message; console.error(`API ${lg.code} :`, e.message); }
  }
  if (!apiOk) throw new Error(Object.values(errors)[0] || 'Aucune réponse de l\'API.');

  const apiResult = new Map(), statusById = new Map();
  const end = addDays(todayStr, HORIZON_DAYS), seasonStart = `${season}-07-01`;
  const models = {}, known = {};
  const refreshModels = () => {
    for (const lg of LEAGUES) {
      const rows = history.filter(m => m.lg === lg.code).sort((a, b) => a.date.localeCompare(b.date));
      models[lg.code] = {v1: createModel(rows), v2: createRatings(rows)}; known[lg.code] = [...new Set(rows.flatMap(m => [m.home, m.away]))];
    }
  };
  // Modèle principal : forces attaque/défense (v2). Secours : ancien modèle (v1) si une équipe manque d'historique, par exemple un promu.
  const predictMatch = (lg, home, away, date) => {
    const M = models[lg], r = M.v2.predict(home, away, date);
    if (r) return {p: r.p, lam: [r.lamH, r.lamA], score: r.score, model: 'v2'};
    const x = M.v1.getLambdas(home, away, date, COEFF), q = M.v1.calcProb(x.lamH, x.lamA);
    return {p: [q.h, q.d, q.a], lam: [x.lamH, x.lamA], score: q.score, model: 'v1'};
  };
  history.sort((a, b) => a.date.localeCompare(b.date));
  refreshModels();
  const resolve = (name, lg) => {
    const r = resolveName(name, known[lg], ALIASES[lg] || {}, lg === 'FL1');
    if (!r && name) unmapped.set(lg + '|' + name, {lg, name});
    return r;
  };

  // --- 3. résultats terminés → historique
  for (const lg of LEAGUES) {
    for (const m of apiByLeague[lg.code] || []) {
      statusById.set(m.id, m.status);
      const hg = m.score?.fullTime?.home, ag = m.score?.fullTime?.away;
      if (m.status !== 'FINISHED' || hg == null || ag == null) continue;
      apiResult.set(m.id, {hg: Number(hg), ag: Number(ag)});
      const home = resolve(m.homeTeam?.name || m.homeTeam?.shortName, lg.code), away = resolve(m.awayTeam?.name || m.awayTeam?.shortName, lg.code);
      if (!home || !away) continue;
      const row = {date: footballDataDate(m.utcDate), home, away, hg: Number(hg), ag: Number(ag), lg: lg.code, division: 'L1', avgH: null, avgD: null, avgA: null};
      const old = byKey.get(key(row));
      if (old) { old.hg = row.hg; old.ag = row.ag; } else { history.push(row); byKey.set(key(row), row); }
    }
  }
  history.sort((a, b) => a.date.localeCompare(b.date));
  refreshModels();

  // --- 4. pronostics des matchs à venir
  const lastFive = (lg, team, before) => history.filter(m => m.lg === lg && m.date < before && (m.home === team || m.away === team)).slice(-5).reverse()
    .map(m => m.home === team ? {d: m.date, o: m.away, v: 'D', f: m.hg, a: m.ag} : {d: m.date, o: m.home, v: 'E', f: m.ag, a: m.hg});
  const seasonCount = (lg, team, before) => history.filter(m => m.lg === lg && m.division === 'L1' && m.date >= seasonStart && m.date < before && (m.home === team || m.away === team)).length;
  const byId = new Map(predictions.map(p => [p.id, p]));
  for (const lg of LEAGUES) {
    for (const m of apiByLeague[lg.code] || []) {
      if (!['SCHEDULED', 'TIMED'].includes(m.status)) continue;
      const date = footballDataDate(m.utcDate);
      if (!date || date < todayStr || date > end) continue;
      const rawH = m.homeTeam?.name || m.homeTeam?.shortName || '', rawA = m.awayTeam?.name || m.awayTeam?.shortName || '';
      const home = resolve(rawH, lg.code), away = resolve(rawA, lg.code);
      const id = 'fd' + m.id, old = byId.get(id);
      if (old && NOW >= new Date(old.kickoff) && old.kickoff === m.utcDate) continue; // figé après le coup d'envoi (sauf match reporté)
      const entry = {id, apiId: m.id, lg: lg.code, date, kickoff: m.utcDate, home: home || rawH, away: away || rawA, crest: [m.homeTeam?.crest || null, m.awayTeam?.crest || null], p: null, lam: null, score: null, err: null,
        form: {h: [], a: []}, rel: 'ok', savedAt: old?.savedAt || NOW.toISOString(), updatedAt: old?.updatedAt || NOW.toISOString(), res: null, final: null};
      if (!home || !away) entry.err = 'Équipe non reconnue dans l’historique.';
      else {
        entry.form = {h: lastFive(lg.code, home, date), a: lastFive(lg.code, away, date)};
        try {
          const x = predictMatch(lg.code, home, away, date);
          entry.p = x.p.map(r4); entry.lam = x.lam.map(r4); entry.score = x.score; entry.model = x.model;
          entry.rel = seasonCount(lg.code, home, date) >= 5 && seasonCount(lg.code, away, date) >= 5 ? 'ok' : 'limited';
        } catch (e) { entry.err = e.message; }
      }
      if (old) {
        const same = JSON.stringify([old.p, old.lam, old.kickoff, old.home, old.away]) === JSON.stringify([entry.p, entry.lam, entry.kickoff, entry.home, entry.away]);
        if (old.mk) entry.mk = old.mk; // on garde les dernières cotes connues si le fichier est momentanément indisponible
        if (same) { entry.updatedAt = old.updatedAt; entry.form = old.form; entry.rel = old.rel; entry.err = old.err; }
        else entry.updatedAt = NOW.toISOString();
        predictions = predictions.filter(p => p.id !== id);
      }
      predictions.push(entry); byId.set(id, entry);
    }
  }

  // --- 4b. cotes du marché pour les matchs à venir (comparaison affichée sur le site ; jamais bloquant)
  const oddsInfo = {ok: false, rows: 0, matched: 0, error: null};
  try {
    const r = await fetch(CSV_BASE + '/fixtures.csv', {signal: AbortSignal.timeout(20000)});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const fx = parseFixtures(await r.text());
    oddsInfo.ok = true; oddsInfo.rows = fx.length;
    const lgByDiv = Object.fromEntries(LEAGUES.map(l => [l.csv[0], l.code]));
    const dayDiff = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;
    for (const f of fx) {
      const lg = lgByDiv[f.div]; if (!lg || !f.mk) continue;
      const home = resolveName(f.home, known[lg], ALIASES[lg] || {}, lg === 'FL1'), away = resolveName(f.away, known[lg], ALIASES[lg] || {}, lg === 'FL1');
      if (!home || !away) continue;
      const p = predictions.find(x => x.lg === lg && x.home === home && x.away === away && !x.res && NOW < new Date(x.kickoff) && dayDiff(x.date, f.date) <= 2);
      if (p) { p.mk = f.mk.map(r4); oddsInfo.matched++; }
    }
  } catch (e) { oddsInfo.error = String(e.message || e).slice(0, 120); }

  // --- 5. règlement
  for (const p of predictions) {
    if (p.res) continue;
    const r = apiResult.get(p.apiId);
    if (r) { p.res = outcome(r.hg, r.ag); p.final = `${r.hg}–${r.ag}`; continue; }
    const st = statusById.get(p.apiId);
    if (st === 'CANCELLED' || NOW - new Date(p.kickoff) > 10 * 86400000) { p.res = 'void'; p.final = null; }
  }
  predictions.sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  // --- 6. test de fiabilité par championnat (recalculé s'il manque ou si l'historique vient d'être rafraîchi)
  let sc = readJSON('scorecard.json', null);
  const leaguesSc = {...(sc?.leagues || {})};
  for (const lg of LEAGUES) {
    if (leaguesSc[lg.code] && !csvRefreshed.has(lg.code) && !process.env.FORCE_SCORECARD) continue;
    let n = 0, bM = 0, bK = 0, lM = 0, lK = 0, hM = 0, hK = 0;
    for (const m of history.filter(m => m.lg === lg.code && m.division === 'L1' && m.date >= BACKTEST_START)) {
      const odds = [m.avgH, m.avgD, m.avgA].map(Number);
      if (!odds.every(v => Number.isFinite(v) && v > 1)) continue;
      let md; try { md = predictMatch(lg.code, m.home, m.away, m.date).p; } catch { continue; }
      const raw = odds.map(v => 1 / v), s = raw.reduce((a, b) => a + b, 0), mk = raw.map(v => v / s);
      const i = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
      const br = p => p.reduce((t, v, k) => t + (v - (k === i ? 1 : 0)) ** 2, 0);
      n++; bM += br(md); bK += br(mk);
      lM -= Math.log(Math.max(1e-12, md[i])); lK -= Math.log(Math.max(1e-12, mk[i]));
      if (md.indexOf(Math.max(...md)) === i) hM++;
      if (mk.indexOf(Math.max(...mk)) === i) hK++;
    }
    if (n) leaguesSc[lg.code] = {n, brierModel: r4(bM / n), brierMarket: r4(bK / n), logModel: r4(lM / n), logMarket: r4(lK / n), hitModel: r4(hM / n), hitMarket: r4(hK / n)};
  }
  writeIfChanged('scorecard.json', {start: BACKTEST_START, model: 'ratings-v2', leagues: leaguesSc});

  writeIfChanged('history.json', history);
  writeIfChanged('predictions.json', predictions);
  writeIfChanged('state.json', state);
  const prevMeta = readJSON('meta.json', {});
  const errKeys = Object.keys(errors);
  const meta = {
    updated: changed ? NOW.toISOString() : (prevMeta.updated || NOW.toISOString()), season, source: 'football-data.org',
    leagues: LEAGUES.map(l => ({code: l.code, name: l.name})), errors,
    lastError: errKeys.length ? errKeys.map(k => `${k} : ${errors[k]}`).join(' · ') : null,
    unmapped: [...unmapped.values()],
    odds: oddsInfo,
    counts: {history: history.length, predictions: predictions.length, pending: predictions.filter(p => !p.res).length},
  };
  writeIfChanged('meta.json', meta);
  console.log(`OK · ${predictions.filter(p => !p.res).length} pronostic(s) en attente · ${predictions.filter(p => p.res && p.res !== 'void').length} réglé(s)` +
    (errKeys.length ? ` · avertissements : ${meta.lastError}` : '') + (unmapped.size ? ` · ${unmapped.size} nom(s) d'équipe non reconnu(s)` : ''));
}

main().catch(e => {
  console.error('ERREUR :', e.message);
  try {
    const meta = readJSON('meta.json', {});
    if (meta.lastError !== e.message) writeFileSync(path('meta.json'), JSON.stringify({...meta, lastError: e.message, lastErrorAt: NOW.toISOString()}));
  } catch {}
  process.exitCode = 1;
});
