// Mise à jour automatique de PronostiK (multi-championnats).
// 1. historique gratuit (CSV football-data.co.uk), rafraîchi toutes les semaines
// 2. résultats et calendrier (football-data.org, clé dans FD_TOKEN), une requête par championnat
// 3. pronostics des 7 prochains jours, figés au coup d'envoi puis réglés à la fin du match
// 4. test de fiabilité par championnat (modèle contre cotes du marché)
// Les fichiers écrits sont dans data/ ; le site ne fait que les lire.
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createModel, createRatings, createElo, hybridProbs} from '../model.mjs';
import {footballDataDate, resolveName} from '../lib.mjs';
import {LEAGUES, ALIASES} from '../leagues.mjs';
import {parseCSV, parseFixtures} from '../csv.mjs';

const API = process.env.FD_API_BASE || 'https://api.football-data.org/v4';
const CSV_BASE = process.env.CSV_BASE || 'https://www.football-data.co.uk';
const TOKEN = process.env.FD_TOKEN;
const NOW = process.env.NOW ? new Date(process.env.NOW) : new Date();
const DATA = process.env.DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url));
const CSV_VERSION = 2;   // 2 : corners, cartons et score à la mi-temps ajoutés à l'historique
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
    const stale = !last || (NOW - last) > CSV_REFRESH_DAYS * 86400000 || state.csvVersion !== CSV_VERSION; // nouveau format : un rechargement complet
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

  // Tous les championnats ont été (re)tentés avec le nouveau format : on ne recommence pas avant la prochaine semaine.
  if (!LEAGUES.some(l => errors[l.code] === 'Historique introuvable (CSV)')) state.csvVersion = CSV_VERSION;

  // --- 2. API : une requête par championnat
  const apiByLeague = {}, emblems = {};
  let apiOk = 0;
  for (const [i, lg] of LEAGUES.entries()) {
    if (errors[lg.code]) continue;
    if (i > 0 && API_DELAY) await sleep(API_DELAY);
    try {
      const j = await api(`/competitions/${lg.code}/matches?season=${season}`);
      if (!(j.matches || []).length) throw new Error('Aucun match reçu.');
      apiByLeague[lg.code] = j.matches; apiOk++;
      const em = (j.competition && j.competition.emblem) || (j.matches || []).find(x => x.competition && x.competition.emblem)?.competition.emblem;
      if (em) emblems[lg.code] = em;
    } catch (e) { errors[lg.code] = e.message; console.error(`API ${lg.code} :`, e.message); }
  }
  if (!apiOk) throw new Error(Object.values(errors)[0] || 'Aucune réponse de l\'API.');

  const apiResult = new Map(), statusById = new Map();
  const end = addDays(todayStr, HORIZON_DAYS), seasonStart = `${season}-07-01`;
  const models = {}, known = {};
  const refreshModels = () => {
    for (const lg of LEAGUES) {
      const rows = history.filter(m => m.lg === lg.code).sort((a, b) => a.date.localeCompare(b.date));
      models[lg.code] = {v1: createModel(rows), v2: createRatings(rows), elo: createElo(rows)}; known[lg.code] = [...new Set(rows.flatMap(m => [m.home, m.away]))];
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
  // Statistiques de la saison en cours (1re division, matchs joués AVANT le match) : classement, bilans, face-à-face.
  const matchStats = (lg, home, away, before) => {
    const S = history.filter(m => m.lg === lg && m.division === 'L1' && m.date >= seasonStart && m.date < before);
    const tab = {};
    const row = t => tab[t] || (tab[t] = {p: 0, pts: 0, gf: 0, ga: 0});
    for (const m of S) {
      const h = row(m.home), a = row(m.away);
      h.p++; a.p++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
      if (m.hg > m.ag) h.pts += 3; else if (m.hg < m.ag) a.pts += 3; else { h.pts++; a.pts++; }
    }
    const order = Object.entries(tab).sort((x, y) => y[1].pts - x[1].pts || (y[1].gf - y[1].ga) - (x[1].gf - x[1].ga) || y[1].gf - x[1].gf).map(([t]) => t);
    const sum = (list, team) => {
      const o = {p: list.length, w: 0, d: 0, l: 0, gf: 0, ga: 0, cs: 0, btts: 0, o25: 0, o15: 0, nc: 0, cf: 0, ca: 0, nk: 0, yc: 0, rc: 0, nh: 0, h1f: 0, h1a: 0, h2f: 0, h2a: 0};
      for (const m of list) {
        const f = m.home === team ? m.hg : m.ag, a = m.home === team ? m.ag : m.hg;
        o.gf += f; o.ga += a; if (f > a) o.w++; else if (f < a) o.l++; else o.d++;
        if (a === 0) o.cs++; if (m.hg > 0 && m.ag > 0) o.btts++; if (m.hg + m.ag > 2) o.o25++; if (m.hg + m.ag > 1) o.o15++;
        const isH = m.home === team;
        if (m.hc != null && m.ac != null) { o.nc++; o.cf += isH ? m.hc : m.ac; o.ca += isH ? m.ac : m.hc; }
        if (m.hy != null && m.ay != null) { o.nk++; o.yc += isH ? m.hy : m.ay; o.rc += (isH ? m.hr : m.ar) || 0; }
        if (m.hthg != null && m.htag != null) { o.nh++; const hf = isH ? m.hthg : m.htag, ha = isH ? m.htag : m.hthg; o.h1f += hf; o.h1a += ha; o.h2f += f - hf; o.h2a += a - ha; }
      }
      return o;
    };
    const team = (t, venue) => ({rang: order.indexOf(t) + 1 || null, pts: tab[t]?.pts ?? 0,
      tout: sum(S.filter(m => m.home === t || m.away === t), t), lieu: sum(S.filter(m => venue === 'dom' ? m.home === t : m.away === t), t)});
    const h2h = history.filter(m => m.lg === lg && m.date < before && ((m.home === home && m.away === away) || (m.home === away && m.away === home)))
      .slice(-5).reverse().map(m => ({d: m.date, h: m.home, a: m.away, hg: m.hg, ag: m.ag}));
    return {equipes: order.length, dom: team(home, 'dom'), ext: team(away, 'ext'), h2h};
  };
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
        entry.stats = matchStats(lg.code, home, away, date);
        try {
          const x = predictMatch(lg.code, home, away, date);
          entry.p = x.p.map(r4); entry.lam = x.lam.map(r4); entry.score = x.score; entry.model = x.model;
          // En coulisse (non publié) : hybride Elo + v2, figé au coup d'envoi comme le pronostic publié, pour le comparer sur des matchs neufs.
          if (x.model === 'v2') { const e = models[lg.code].elo.predict(home, away, date); if (e) entry.shadow = {hyb: hybridProbs(x.p, e.p).map(r4), elo: e.p.map(r4), at: NOW.toISOString()}; }
          entry.rel = seasonCount(lg.code, home, date) >= 5 && seasonCount(lg.code, away, date) >= 5 ? 'ok' : 'limited';
        } catch (e) { entry.err = e.message; }
      }
      if (old) {
        const same = JSON.stringify([old.p, old.lam, old.kickoff, old.home, old.away]) === JSON.stringify([entry.p, entry.lam, entry.kickoff, entry.home, entry.away]);
        if (old.mk) entry.mk = old.mk;
        if (old.shadow && old.shadow.at && entry.shadow && JSON.stringify(old.shadow.hyb) === JSON.stringify(entry.shadow.hyb)) entry.shadow.at = old.shadow.at; // horodatage de la version en vigueur // on garde les dernières cotes connues si le fichier est momentanément indisponible
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

  // --- 6. test de fiabilité par championnat
  // Échantillon : matchs de 1re division joués depuis BACKTEST_START, avec cotes de clôture valides et un pronostic
  // (v2, ou repli v1 pour une équipe sans assez d'historique). Modèle et marché sont TOUJOURS comparés sur les mêmes matchs.
  // Recalculé si le format a changé, si l'historique vient d'être rafraîchi, ou sur demande (FORCE_SCORECARD).
  const SC_VERSION = 2;
  let sc = readJSON('scorecard.json', null);
  const scStale = !sc || sc.version !== SC_VERSION;
  // Tous les championnats sont recalculés ensemble, pour que le total et son IC portent sur un échantillon cohérent.
  const scNeeded = scStale || csvRefreshed.size > 0 || !!process.env.FORCE_SCORECARD;
  const leaguesSc = {};
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const ci95 = d => { if (d.length < 2) return null; const m = mean(d), v = d.reduce((x, y) => x + (y - m) ** 2, 0) / (d.length - 1), e = 1.96 * Math.sqrt(v / d.length); return {diff: r4(m), lo: r4(m - e), hi: r4(m + e)}; };
  const allB = [], allL = [];
  for (const lg of scNeeded ? LEAGUES : []) {
    let played = 0, noOdds = 0, noPred = 0;
    const R = [];
    for (const m of history.filter(m => m.lg === lg.code && m.division === 'L1' && m.date >= BACKTEST_START)) {
      played++;
      const odds = [m.avgH, m.avgD, m.avgA].map(Number);
      if (!odds.every(v => Number.isFinite(v) && v > 1)) { noOdds++; continue; }
      let x; try { x = predictMatch(lg.code, m.home, m.away, m.date); } catch { noPred++; continue; }
      const raw = odds.map(v => 1 / v), s = raw.reduce((a, b) => a + b, 0), mk = raw.map(v => v / s);
      const i = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
      const br = p => p.reduce((t, v, k) => t + (v - (k === i ? 1 : 0)) ** 2, 0), ll = p => -Math.log(Math.max(1e-12, p[i]));
      R.push({v2: x.model === 'v2', bM: br(x.p), bK: br(mk), lM: ll(x.p), lK: ll(mk), hM: x.p.indexOf(Math.max(...x.p)) === i, hK: mk.indexOf(Math.max(...mk)) === i});
    }
    if (!R.length) continue;
    const V2 = R.filter(r => r.v2), dB = R.map(r => r.bM - r.bK), dL = R.map(r => r.lM - r.lK);
    dB.forEach(v => allB.push(v)); dL.forEach(v => allL.push(v));
    leaguesSc[lg.code] = {
      n: R.length, nV2: V2.length, nRepli: R.length - V2.length, exclus: {joues: played, sansCotes: noOdds, sansPronostic: noPred},
      brierModel: r4(mean(R.map(r => r.bM))), brierMarket: r4(mean(R.map(r => r.bK))), logModel: r4(mean(R.map(r => r.lM))), logMarket: r4(mean(R.map(r => r.lK))),
      hitModel: r4(R.filter(r => r.hM).length / R.length), hitMarket: r4(R.filter(r => r.hK).length / R.length),
      ecartBrier: ci95(dB), ecartLog: ci95(dL),
      v2: V2.length ? {n: V2.length, brierModel: r4(mean(V2.map(r => r.bM))), brierMarket: r4(mean(V2.map(r => r.bK))), ecartBrier: ci95(V2.map(r => r.bM - r.bK))} : null,
    };
  }
  const tot = Object.values(leaguesSc).reduce((a, x) => a + x.n, 0);
  if (scNeeded) writeIfChanged('scorecard.json', {version: SC_VERSION, start: BACKTEST_START, model: 'ratings-v2 (repli v1)',
    echantillon: 'Matchs de 1re division joués depuis la date de début, avec cotes moyennes de clôture valides et un pronostic. Modèle et marché comparés sur les mêmes matchs. IC à 95 % : différence appariée modèle − marché, approximation normale.',
    total: tot ? {n: tot, ecartBrier: ci95(allB), ecartLog: ci95(allL)} : null,
    leagues: leaguesSc});

  // --- 6b. suivi « en coulisse » : hybride Elo + v2 contre v2, sur les matchs réglés depuis la mise en place (aucune incidence sur le site)
  {
    const SHADOW_START = '2026-11-01';
    const since = predictions.filter(p => p.kickoff >= SHADOW_START && p.res);
    const played = since.filter(p => ['H', 'D', 'A'].includes(p.res));
    // Évaluable : pronostic v2 publié ET hybride calculé, tous deux figés avant le coup d'envoi.
    const S = played.filter(p => p.shadow && p.p && p.model === 'v2' && p.shadow.at && p.shadow.at < p.kickoff);
    const idx = r => 'HDA'.indexOf(r), mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const br = (p, i) => p.reduce((t, v, k) => t + (v - (k === i ? 1 : 0)) ** 2, 0), ll = (p, i) => -Math.log(Math.max(1e-12, p[i]));
    const ci = d => { if (d.length < 2) return null; const m = mean(d), v = d.reduce((x, y) => x + (y - m) ** 2, 0) / (d.length - 1), e = 1.96 * Math.sqrt(v / d.length); return {diff: r4(m), lo: r4(m - e), hi: r4(m + e)}; };
    const shadow = {debut: SHADOW_START, majA: NOW.toISOString(), note: 'Hybride Elo + v2 (non publié) contre v2 (publié), sur les mêmes matchs, prédictions figées avant le coup d’envoi. Écart négatif = hybride meilleur. Réglages figés pendant l’observation.',
      suivi: {matchsRegles: since.length, annules: since.filter(p => p.res === 'void').length, joues: played.length, evaluables: S.length,
        sansPronostic: played.filter(p => !p.p).length, repliV1: played.filter(p => p.p && p.model !== 'v2').length,
        sansHybride: played.filter(p => p.p && p.model === 'v2' && !(p.shadow && p.shadow.at && p.shadow.at < p.kickoff)).length,
        avecCotes: S.filter(p => Array.isArray(p.mk)).length}};
    if (S.length) {
      const block = T => {
        const o = {n: T.length, brierV2: r4(mean(T.map(p => br(p.p, idx(p.res))))), brierHybride: r4(mean(T.map(p => br(p.shadow.hyb, idx(p.res))))),
          logV2: r4(mean(T.map(p => ll(p.p, idx(p.res))))), logHybride: r4(mean(T.map(p => ll(p.shadow.hyb, idx(p.res))))),
          ecartBrier: ci(T.map(p => br(p.shadow.hyb, idx(p.res)) - br(p.p, idx(p.res)))), ecartLog: ci(T.map(p => ll(p.shadow.hyb, idx(p.res)) - ll(p.p, idx(p.res))))};
        const M = T.filter(p => Array.isArray(p.mk));
        if (M.length) o.marche = {n: M.length, brierMarche: r4(mean(M.map(p => br(p.mk, idx(p.res))))), brierV2: r4(mean(M.map(p => br(p.p, idx(p.res))))), brierHybride: r4(mean(M.map(p => br(p.shadow.hyb, idx(p.res))))), note: 'cotes publiées quelques jours avant le match (pas de clôture)'};
        return o;
      };
      shadow.global = block(S);
      shadow.parChampionnat = Object.fromEntries(LEAGUES.map(l => { const T = S.filter(p => p.lg === l.code); return [l.code, T.length ? block(T) : null]; }));
      const bins = [[0, .2], [.2, .3], [.3, .4], [.4, .5], [.5, .6], [.6, .7], [.7, 1.01]];
      shadow.calibration = Object.fromEntries([['v2', p => p.p], ['hybride', p => p.shadow.hyb]].map(([k, f]) => [k, bins.map(([lo, hi]) => { let n = 0, sp = 0, so = 0; for (const p of S) f(p).forEach((v, j) => { if (v >= lo && v < hi) { n++; sp += v; so += +(j === idx(p.res)); } }); return {tranche: `${Math.round(lo * 100)}-${Math.min(100, Math.round(hi * 100))}`, n, annonce: n ? r4(sp / n) : null, observe: n ? r4(so / n) : null}; })]));
    }
    writeIfChanged('shadow.json', shadow);
  }

  writeIfChanged('history.json', history);
  writeIfChanged('predictions.json', predictions);
  writeIfChanged('state.json', state);
  const prevMeta = readJSON('meta.json', {});
  const errKeys = Object.keys(errors);
  const meta = {
    updated: changed ? NOW.toISOString() : (prevMeta.updated || NOW.toISOString()), season, source: 'football-data.org',
    leagues: LEAGUES.map(l => ({code: l.code, name: l.name, emblem: emblems[l.code] || (prevMeta.leagues || []).find(x => x.code === l.code)?.emblem || null})), errors,
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
