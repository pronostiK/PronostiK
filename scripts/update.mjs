// Mise à jour automatique de PronostiK (multi-championnats).
// 1. historique gratuit (CSV football-data.co.uk), rafraîchi toutes les semaines
// 2. résultats et calendrier (football-data.org, clé dans FD_TOKEN), une requête par championnat
// 3. pronostics des 7 prochains jours, figés au coup d'envoi puis réglés à la fin du match
// 4. test de fiabilité par championnat (modèle contre cotes du marché)
// Les fichiers écrits sont dans data/ ; le site ne fait que les lire.
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createModel, createRatings, createElo, hybridProbs, marketsFromLambdas} from '../model.mjs';
import {footballDataDate, resolveName} from '../lib.mjs';
import {LEAGUES, ALIASES} from '../leagues.mjs';
import {parseCSV, parseFixtures} from '../csv.mjs';
import {buildNationsSeed, runNationsElo, nationsPredict, nationName, flagUrl} from './nations-lib.mjs';
import {ESPN_LG, espnRecent, mapNames, espnLineup} from './compos-lib.mjs';
import {runEuroElo, uclPredict, makeResolver, parseDomesticCSV, countryOfArea, EXTRA_MAIN, EXTRA_NEW, LG_COUNTRY, EXTRA_VERSION} from './ucl-lib.mjs';

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

async function api(p, tries = 3) {
  const res = await fetch(API + p, {headers: {'X-Auth-Token': TOKEN}});
  if (res.status === 429 && tries > 1) {   // limite de 10 requêtes par minute (partagée avec les autres tâches) : on attend puis on réessaie
    let wait = 20;
    try { const m = ((await res.json()).message || '').match(/Wait (\d+) seconds/); if (m) wait = Number(m[1]) + 2; } catch {}
    await sleep(Math.min(65, wait) * 1000);
    return api(p, tries - 1);
  }
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
        rows.push(...parseCSV(await r.text(), league.code, {top: league.csv[0]}));
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
    const stale = !last || (NOW - last) > (lg.source === 'csv' ? 0.5 : CSV_REFRESH_DAYS) * 86400000 || (state.csvVer?.[lg.code] ?? state.csvVersion) !== CSV_VERSION;   // ligue sans API : résultats lus dans le CSV, rafraîchi deux fois par jour // nouveau format : un rechargement complet
    if (!(stale || count < 200 || process.env.FORCE_CSV)) continue;
    console.log(`Historique ${lg.name}…`);
    const rows = await downloadCSVs(lg, season);
    if (!rows.length) {
      if (count < 200) errors[lg.code] = 'Historique introuvable (CSV)';
      else { state.csvAt[lg.code] = NOW.toISOString(); (state.csvVer ||= {})[lg.code] = CSV_VERSION; }   // on retentera plus tard
      continue;
    }
    for (const r of rows) {
      const old = byKey.get(key(r));
      if (old) Object.assign(old, r); else { history.push(r); byKey.set(key(r), r); }
    }
    state.csvAt[lg.code] = NOW.toISOString(); (state.csvVer ||= {})[lg.code] = CSV_VERSION; csvRefreshed.add(lg.code);
  }

  // Format suivi championnat par championnat (state.csvVer) : un championnat sans fichier ne force plus le rechargement des autres.

  // --- 2. API : une requête par championnat
  const apiByLeague = {}, emblems = {};
  let apiOk = 0;
  for (const [i, lg] of LEAGUES.entries()) {
    if (errors[lg.code] || lg.source === 'csv') continue;
    if (i > 0 && API_DELAY) await sleep(API_DELAY);
    try {
      const j = await api(`/competitions/${lg.code}/matches?season=${season}`);
      if (!(j.matches || []).length) throw new Error('Aucun match reçu.');
      apiByLeague[lg.code] = j.matches; apiOk++;
      const em = (j.competition && j.competition.emblem) || (j.matches || []).find(x => x.competition && x.competition.emblem)?.competition.emblem;
      if (em) emblems[lg.code] = em;
    } catch (e) { errors[lg.code] = e.message; console.error(`API ${lg.code} :`, e.message); }
  }
  emblems.FL2 = emblems.FL2 || 'https://crests.football-data.org/FL2.png';   // blason public (pas d'accès API pour la Ligue 2)
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
  // rows (facultatif) : matchs de la saison d'un autre championnat (clubs de C1 hors championnats suivis).
  const matchStats = (lg, home, away, before, rows = null) => {
    const S = rows ? rows.filter(m => m.date < before) : history.filter(m => m.lg === lg && m.division === 'L1' && m.date >= seasonStart && m.date < before);
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
    const games = t => S.filter(m => m.home === t || m.away === t).slice().reverse()
      .map(m => m.home === t ? {d: m.date, o: m.away, v: 'D', f: m.hg, a: m.ag} : {d: m.date, o: m.home, v: 'E', f: m.ag, a: m.hg});
    const team = (t, venue) => ({rang: order.indexOf(t) + 1 || null, pts: tab[t]?.pts ?? 0, matchs: games(t),
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
          { const mk2 = marketsFromLambdas(x.lam[0], x.lam[1]); entry.markets = {o15: r4(mk2.o15), o25: r4(mk2.o25), btts: r4(mk2.btts), ht: mk2.ht.map(r4), scores: mk2.scores.map(([s, p]) => [s, r4(p)])}; }
          // En coulisse (non publié) : hybride Elo + v2, figé au coup d'envoi comme le pronostic publié, pour le comparer sur des matchs neufs.
          if (x.model === 'v2') { const e = models[lg.code].elo.predict(home, away, date); if (e) entry.shadow = {hyb: hybridProbs(x.p, e.p).map(r4), elo: e.p.map(r4), at: NOW.toISOString()}; }
          entry.rel = seasonCount(lg.code, home, date) >= 5 && seasonCount(lg.code, away, date) >= 5 ? 'ok' : 'limited';
        } catch (e) { entry.err = e.message; }
      }
      if (old) {
        const same = JSON.stringify([old.p, old.lam, old.kickoff, old.home, old.away]) === JSON.stringify([entry.p, entry.lam, entry.kickoff, entry.home, entry.away]);
        if (old.mk) entry.mk = old.mk;
        if (old.od) entry.od = old.od;
        if (old.shadow && old.shadow.at && entry.shadow && JSON.stringify(old.shadow.hyb) === JSON.stringify(entry.shadow.hyb)) entry.shadow.at = old.shadow.at; // horodatage de la version en vigueur // on garde les dernières cotes connues si le fichier est momentanément indisponible
        if (same) { entry.updatedAt = old.updatedAt; entry.form = old.form; entry.rel = old.rel; entry.err = old.err; }
        else entry.updatedAt = NOW.toISOString();
        predictions = predictions.filter(p => p.id !== id);
      }
      predictions.push(entry); byId.set(id, entry);
    }
  }

  // --- 4c. Ligue des champions : Elo européen (championnats nationaux + C1), voir lab/RAPPORT-C1.md.
  // Les notes de départ (data/ucl-seed.json, au 1er juillet 2026) sont mises à jour avec tous les matchs joués depuis.
  let uclStandings = null, uclInfo = {ok: false};
  try {
    const seed = readJSON('ucl-seed.json', null);
    if (!seed) throw new Error('graine Elo absente');
    if (!seed.publish && !process.env.UCL_FORCE) throw new Error('désactivée (essai en cours)');
    const P = seed.params, from = seed.asOf;
    if (API_DELAY) await sleep(API_DELAY);
    const cm = await api(`/competitions/CL/matches?season=${season}`);
    const clMatches = cm.matches || [];
    if (cm.competition?.emblem) emblems.CL = cm.competition.emblem;
    // Pays des clubs (une requête par semaine)
    if (!state.uclTeams || state.uclTeamsSeason !== season || (NOW - new Date(state.uclTeamsAt || 0)) > 6 * 86400000) {
      if (API_DELAY) await sleep(API_DELAY);
      const tj = await api(`/competitions/CL/teams?season=${season}`);
      state.uclTeams = Object.fromEntries((tj.teams || []).map(t => [t.id, {c: countryOfArea(t.area), short: t.shortName || t.name, name: t.name}]));
      state.uclTeamsAt = NOW.toISOString(); state.uclTeamsSeason = season;
    }
    // Championnats hors des 5 suivis (une fois par semaine)
    let extra = readJSON('ucl-domestic.json', null);
    if (!extra || extra.from !== from || extra.v !== EXTRA_VERSION || (NOW - new Date(extra.at || 0)) > CSV_REFRESH_DAYS * 86400000) {
      const rows = [], code = `${String(season).slice(2)}${String(season + 1).slice(2)}`, prevCode = `${String(season - 1).slice(2)}${String(season).slice(2)}`;
      const got = {};
      for (const [c, f] of Object.entries(EXTRA_MAIN)) for (const sc of [prevCode, code]) {
        try { const r = await fetch(`${CSV_BASE}/mmz4281/${sc}/${f}.csv`, {signal: AbortSignal.timeout(20000)}); if (r.ok) { const x = parseDomesticCSV(await r.text(), c, 'main', from); rows.push(...x); got[c] = (got[c] || 0) + x.length; } } catch {}
      }
      for (const [c, f] of Object.entries(EXTRA_NEW)) {
        try { const r = await fetch(`${CSV_BASE}/new/${f}.csv`, {signal: AbortSignal.timeout(20000)}); if (r.ok) { const x = parseDomesticCSV(await r.text(), c, 'new', from); rows.push(...x); got[c] = x.length; } } catch {}
      }
      if (rows.length || !extra) { extra = {from, v: EXTRA_VERSION, at: NOW.toISOString(), got, rows}; writeIfChanged('ucl-domestic.json', extra); }
    }
    // Clubs connus par pays (graine + championnats) pour retrouver les noms de football-data.org
    const knownBy = {};
    const addK = (c, n) => { (knownBy[c] ||= new Set()).add(n); };
    for (const k of Object.keys(seed.ratings)) { const i = k.indexOf('|'); addK(k.slice(0, i), k.slice(i + 1)); }
    const domRows = [];
    for (const m of history) { const c = LG_COUNTRY[m.lg]; if (!c || m.division !== 'L1' || m.date < from) continue; domRows.push([m.date, c, m.home, m.away, m.hg, m.ag]); }
    for (const r of [...domRows, ...(extra?.rows || [])]) { addK(r[1], r[2]); addK(r[1], r[3]); }
    const resolveCL = makeResolver(Object.fromEntries(Object.entries(knownBy).map(([c, s]) => [c, [...s]])));
    const teamInfo = t => { const ti = state.uclTeams[t?.id] || {}; const c = ti.c || 'XXX'; return {c, key: resolveCL(t?.name || t?.shortName || '', c), short: ti.short || t?.shortName || t?.name}; };
    // Ligue Europa : calendrier et résultats de l'API publique de l'UEFA (absente du plan gratuit de football-data.org).
    const UEFA_CUPS = [{code: 'EL', id: 14, name: 'Ligue Europa'}, {code: 'ECL', id: 2019, name: 'Ligue Conférence'}];
    const cupMatches = {};
    for (const cup of UEFA_CUPS) {
      try {
        const all = [];
        for (let off = 0; off < 1000; off += 100) {
          const r = await fetch(`https://match.uefa.com/v5/matches?competitionId=${cup.id}&seasonYear=${season + 1}&fromDate=${seasonStart}&toDate=${end}&limit=100&offset=${off}&order=ASC`, {signal: AbortSignal.timeout(30000), headers: {'User-Agent': 'Mozilla/5.0 (PronostiK)'}});
          if (!r.ok) throw new Error('API UEFA : HTTP ' + r.status);
          const j = await r.json(); if (!Array.isArray(j)) throw new Error('API UEFA : réponse inattendue');
          all.push(...j); if (j.length < 100) break;
        }
        cupMatches[cup.code] = all;
        if (all[0]?.competition?.images?.FULL_LOGO) emblems[cup.code] = all[0].competition.images.FULL_LOGO;
      } catch (e) { errors[cup.code] = String(e.message || e).slice(0, 160); console.error(cup.name, ':', e.message); }
    }
    const UEFA_C = {MON: 'FRA', MCO: 'FRA'};
    const unknownCup = new Set(), roundNames = {};
    const uefaTeam = t => { const c = UEFA_C[t?.countryCode] || t?.countryCode || 'XXX', key = resolveCL(t?.internationalName || '', c);
      if (!knownBy[c]?.has(key.slice(key.indexOf('|') + 1))) unknownCup.add(`${c}|${t?.internationalName}`);
      return {c, key, short: t?.translations?.displayName?.FR || t?.internationalName || '?'}; };
    for (const list of Object.values(cupMatches)) for (const m of list) { const k = `${m.round?.metaData?.name}/${m.round?.metaData?.type}/${m.status}`; roundNames[k] = (roundNames[k] || 0) + 1; }
    // Logos des clubs de Ligue Europa : liste publique d'ESPN (une fois par semaine), associée aux noms UEFA.
    const ESPN_CUP = {EL: 'uefa.europa', ECL: 'uefa.europa.conf'};
    for (const [code, list] of Object.entries(cupMatches)) {
      const cur = state.crests?.[code];
      if (cur && (NOW - new Date(cur.at)) < 6 * 86400000 && Object.keys(cur.map || {}).length >= 20) continue;
      try {
        const names = [...new Set(list.flatMap(m => [m.homeTeam?.internationalName, m.awayTeam?.internationalName]).filter(Boolean))];
        const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_CUP[code]}/teams`, {signal: AbortSignal.timeout(20000), headers: {'User-Agent': 'Mozilla/5.0 (PronostiK)'}});
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const map = {};
        for (const x of (await r.json()).sports?.[0]?.leagues?.[0]?.teams || []) {
          const t = x.team || {}, url = (t.logos || [])[0]?.href; if (!url) continue;
          const n = resolveName(t.displayName, names, {}, false) || resolveName(t.shortDisplayName, names, {}, false) || resolveName(t.location, names, {}, false);
          if (n) map[n] = url;
        }
        if (Object.keys(map).length) (state.crests ||= {})[code] = {at: NOW.toISOString(), map};
      } catch (e) { console.error('Logos', code, ':', e.message); }
    }
    const cupCrest = (code, t) => state.crests?.[code]?.map?.[t?.internationalName] || null;
    const uefaNeutral = m => !!(m.stadium?.countryCode && m.homeTeam?.countryCode && m.stadium.countryCode !== m.homeTeam.countryCode && m.round?.metaData?.type === 'FINAL');
    const events = [];
    for (const [d, c, h, a, hg, ag] of [...domRows, ...(extra?.rows || [])]) events.push({date: d, h: c + '|' + h, a: c + '|' + a, hc: c, ac: c, hg, ag, cl: false});
    for (const [code, list] of Object.entries(cupMatches)) for (const m of list) {
      if (m.status !== 'FINISHED' || !m.score?.regular || !m.homeTeam || !m.awayTeam) continue;
      const H = uefaTeam(m.homeTeam), A = uefaTeam(m.awayTeam);
      events.push({date: m.kickOffTime.date, h: H.key, a: A.key, hc: H.c, ac: A.c, hg: m.score.regular.home, ag: m.score.regular.away, cl: true, cup: code, neutral: uefaNeutral(m)});
      const p = byId.get('uefa' + m.id);
      if (p && !p.res) { p.res = outcome(m.score.regular.home, m.score.regular.away); p.final = `${m.score.regular.home}–${m.score.regular.away}`; }
    }
    for (const m of clMatches) {
      statusById.set(m.id, m.status);
      const hg = m.score?.regularTime?.home ?? m.score?.fullTime?.home, ag = m.score?.regularTime?.away ?? m.score?.fullTime?.away;   // score à 90 minutes
      if (m.status !== 'FINISHED' || hg == null || ag == null) continue;
      apiResult.set(m.id, {hg: Number(hg), ag: Number(ag)});   // réglé sur le score à 90 minutes, comme les paris 1N2
      const H = teamInfo(m.homeTeam), A = teamInfo(m.awayTeam);
      events.push({date: footballDataDate(m.utcDate), h: H.key, a: A.key, hc: H.c, ac: A.c, hg: Number(hg), ag: Number(ag), cl: true, neutral: m.stage === 'FINAL'});
    }
    events.sort((x, y) => x.date.localeCompare(y.date) || (x.cl - y.cl));
    const clDone = events.filter(e => e.cl).map(e => [e.date, e.h, e.a, e.hg, e.ag]);
    // Forme toutes compétitions (5 derniers matchs) relevée pendant le calcul
    const recent = new Map();
    const disp = k => k.slice(k.indexOf('|') + 1);
    const push = (t, x) => { const l = recent.get(t) || []; l.push(x); if (l.length > 5) l.shift(); recent.set(t, l); };
    const {ratings, add} = runEuroElo(events, P, null, seed.ratings, e => { push(e.h, {d: e.date, o: disp(e.a), v: 'D', f: e.hg, a: e.ag, c: e.cl ? (e.cup || 'C1') : ''}); push(e.a, {d: e.date, o: disp(e.h), v: 'E', f: e.ag, a: e.hg, c: e.cl ? (e.cup || 'C1') : ''}); });
    const LG_OF = Object.fromEntries(Object.entries(LG_COUNTRY).map(([lg, c]) => [c, lg]));
    const r4b = v => Math.round(v * 10000) / 10000;
    let n = 0;
    const upcoming = [];
    for (const m of clMatches) {
      if (!['SCHEDULED', 'TIMED'].includes(m.status) || !m.homeTeam?.id || !m.awayTeam?.id) continue;
      upcoming.push({lg: 'CL', id: 'fd' + m.id, apiId: m.id, kickoff: m.utcDate, H: teamInfo(m.homeTeam), A: teamInfo(m.awayTeam), crest: [m.homeTeam?.crest || null, m.awayTeam?.crest || null], neutral: m.stage === 'FINAL', stage: m.stage, md: m.matchday ?? null});
    }
    // crests football-data.org déjà connus (clubs vus en C1) : préférés aux logos UEFA
    const fdCrest = {}; for (const m of clMatches) for (const t of [m.homeTeam, m.awayTeam]) if (t?.id && t.crest) fdCrest[teamInfo(t).key] = t.crest;
    for (const [code, list] of Object.entries(cupMatches)) for (const m of list) {
      if (m.status !== 'UPCOMING' || !m.homeTeam || !m.awayTeam || m.homeTeam.isPlaceHolder || m.awayTeam.isPlaceHolder) continue;
      const H = uefaTeam(m.homeTeam), A = uefaTeam(m.awayTeam);
      upcoming.push({lg: code, id: 'uefa' + m.id, apiId: null, uefaId: m.id, kickoff: m.kickOffTime.dateTime, H, A, crest: [fdCrest[H.key] || cupCrest(code, m.homeTeam) || m.homeTeam.mediumLogoUrl || null, fdCrest[A.key] || cupCrest(code, m.awayTeam) || m.awayTeam.mediumLogoUrl || null], neutral: uefaNeutral(m), stage: m.round?.metaData?.name || null, md: null});
    }
    for (const u of upcoming) {
      const date = footballDataDate(u.kickoff);
      if (!date || date < todayStr || date > end) continue;
      const id = u.id, old = byId.get(id);
      if (old && NOW >= new Date(old.kickoff) && old.kickoff === u.kickoff) continue;     // figé après le coup d'envoi
      const H = u.H, A = u.A;
      add(H.key, H.c); add(A.key, A.c);
      const rh = ratings.get(H.key), ra = ratings.get(A.key), x = uclPredict(rh, ra, u.neutral, P);
      const lgH = LG_OF[H.c], lgA = LG_OF[A.c];
      const nameH = lgH ? disp(H.key) : H.short, nameA = lgA ? disp(A.key) : A.short;
      const mk2 = marketsFromLambdas(x.lam[0], x.lam[1], false);
      const pois = (k, l) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
      let best = [0, 0, -1]; for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) { const q = pois(i, x.lam[0]) * pois(j, x.lam[1]); if (q > best[2]) best = [i, j, q]; }
      let stats = null;
      // Statistiques : saison en cours du championnat national de chaque club (suivi ou fichier hors-suivi) ; face-à-face : C1 depuis 2017.
      const natRows = c => { const y0 = ['NOR', 'SWE'].includes(c) ? `${todayStr.slice(0, 4)}-01-01` : seasonStart;   // saisons sur l'année civile
        return (extra?.rows || []).filter(r => r[1] === c && r[0] >= y0).map(r => ({date: r[0], home: r[2], away: r[3], hg: r[4], ag: r[5]})); };
      // Repli : sans championnat disponible, les matchs de Coupe d'Europe de la saison (tours préliminaires compris).
      const src = {};
      const side = (c, key, venue) => {
        const lg = LG_OF[c], n = disp(key);
        let st = lg ? matchStats(lg, n, n, date) : matchStats(null, n, n, date, natRows(c)), b = venue === 'dom' ? st.dom : st.ext;
        if (!b.tout.p) {
          const rows = events.filter(e => e.cl && e.date >= seasonStart && (e.h === key || e.a === key)).map(e => ({date: e.date, home: e.h === key ? n : disp(e.h), away: e.a === key ? n : disp(e.a), hg: e.hg, ag: e.ag}));
          st = matchStats(null, n, n, date, rows); b = venue === 'dom' ? st.dom : st.ext; b.rang = null; src[venue] = 'coupe';
        }
        return b;
      };
      const sd = side(H.c, H.key, 'dom'), se = side(A.c, A.key, 'ext');
      const nm = k => k === H.key ? nameH : k === A.key ? nameA : disp(k);
      const h2h = [...(seed.cl || []), ...clDone].filter(r => r[0] < date && ((r[1] === H.key && r[2] === A.key) || (r[1] === A.key && r[2] === H.key))).slice(-5).reverse().map(r => ({d: r[0], h: nm(r[1]), a: nm(r[2]), hg: r[3], ag: r[4]}));
      if ((sd.tout.p && se.tout.p) || h2h.length) stats = {equipes: null, dom: sd.tout.p && se.tout.p ? sd : null, ext: sd.tout.p && se.tout.p ? se : null, h2h, national: true, src};
      const entry = {id, apiId: u.apiId, ...(u.uefaId ? {uefaId: u.uefaId} : {}), lg: u.lg, date, kickoff: u.kickoff, home: nameH, away: nameA, crest: u.crest,
        p: x.p.map(r4b), lam: x.lam.map(r4b), score: `${best[0]}–${best[1]}`, model: 'euro-elo', elo: [Math.round(rh), Math.round(ra)],
        markets: {o15: r4b(mk2.o15), o25: r4b(mk2.o25), btts: r4b(mk2.btts), ht: mk2.ht.map(r4b), scores: mk2.scores.map(([sc, v]) => [sc, r4b(v)])},
        form: {h: (recent.get(H.key) || []).slice().reverse(), a: (recent.get(A.key) || []).slice().reverse()}, stats, stage: u.stage, md: u.md,
        rel: 'test', err: null, savedAt: old?.savedAt || NOW.toISOString(), updatedAt: old?.updatedAt || NOW.toISOString(), res: null, final: null};
      if (old) {
        const same = JSON.stringify([old.p, old.lam, old.kickoff, old.home, old.away]) === JSON.stringify([entry.p, entry.lam, entry.kickoff, entry.home, entry.away]);
        if (same) { entry.updatedAt = old.updatedAt; entry.form = old.form; } else entry.updatedAt = NOW.toISOString();
        predictions = predictions.filter(p => p.id !== id);
      }
      predictions.push(entry); byId.set(id, entry); n++;
    }
    // Classement de la phase de ligue
    const T = {};
    const row = (t, crest) => T[t.id] || (T[t.id] = {t: (state.uclTeams[t.id]?.short) || t.shortName || t.name, crest: t.crest || null, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: []});
    for (const m of clMatches.filter(m => m.stage === 'LEAGUE_STAGE').sort((a, b) => a.utcDate.localeCompare(b.utcDate))) {
      if (!m.homeTeam?.id || !m.awayTeam?.id) continue;
      const h = row(m.homeTeam), a = row(m.awayTeam);
      if (m.status !== 'FINISHED') continue;
      const hg = m.score.fullTime.home, ag = m.score.fullTime.away;
      h.p++; a.p++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
      if (hg > ag) { h.w++; h.pts += 3; a.l++; h.form.push('V'); a.form.push('D'); } else if (hg < ag) { a.w++; a.pts += 3; h.l++; h.form.push('D'); a.form.push('V'); } else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('N'); a.form.push('N'); }
    }
    const rowsCL = Object.values(T).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.t.localeCompare(y.t)).map((r, i) => ({rang: i + 1, ...r, form: r.form.slice(-5).join('')}));
    if (rowsCL.some(r => r.p)) uclStandings = {saison: season, maj: todayStr, phase: 'ligue', rows: rowsCL};
    for (const [code, list] of Object.entries(cupMatches)) {
      const T2 = {};
      const row2 = t => T2[t.id] || (T2[t.id] = {t: t.translations?.displayName?.FR || t.internationalName, crest: fdCrest[uefaTeam(t).key] || cupCrest(code, t) || t.mediumLogoUrl || null, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: []});
      for (const m of list.filter(m => m.round?.metaData?.type === 'GROUP_STANDINGS' || /league phase/i.test(m.round?.metaData?.name || ''))) {
        if (!m.homeTeam?.id || !m.awayTeam?.id) continue;
        const h = row2(m.homeTeam), a = row2(m.awayTeam);
        if (m.status !== 'FINISHED' || !m.score?.total) continue;
        const hg = m.score.total.home, ag = m.score.total.away;
        h.p++; a.p++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
        if (hg > ag) { h.w++; h.pts += 3; a.l++; h.form.push('V'); a.form.push('D'); } else if (hg < ag) { a.w++; a.pts += 3; h.l++; h.form.push('D'); a.form.push('V'); } else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('N'); a.form.push('N'); }
      }
      const rows2 = Object.values(T2).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.t.localeCompare(y.t)).map((r, i) => ({rang: i + 1, ...r, form: r.form.slice(-5).join('')}));
      if (rows2.some(r => r.p)) (uclStandings ||= {}).__cups = {...(uclStandings.__cups || {}), [code]: {saison: season, maj: todayStr, phase: 'ligue', rows: rows2}};
    }
    uclInfo = {ok: true, europa: (cupMatches.EL || []).length, conference: (cupMatches.ECL || []).length, inconnus: [...unknownCup], tours: roundNames, matchs: clMatches.length, joues: events.filter(e => e.cl).length, pronostics: n, sansPays: Object.values(state.uclTeams).filter(t => !t.c).length};
  } catch (e) { if (!/^désactivée/.test(e.message)) { errors.CL = String(e.message || e).slice(0, 160); console.error('C1 :', e.message); } }

  // --- 4d. Ligue des nations (sélections) : Elo des sélections (lab/RAPPORT-SELECTIONS.md), calendrier et résultats de l'API publique de l'UEFA.
  let natInfo = {ok: false};
  try {
    let seed = readJSON('nations-seed.json', null);
    if (!seed) throw new Error('graine absente');
    // Base de résultats internationaux rafraîchie une fois par semaine (réglages figés)
    if ((NOW - new Date(state.nationsAt || 0)) > CSV_REFRESH_DAYS * 86400000) {
      try {
        const r = await fetch('https://raw.githubusercontent.com/martj42/international_results/master/results.csv', {signal: AbortSignal.timeout(60000)});
        if (r.ok) { const fresh = buildNationsSeed(await r.text(), seed.params); if (fresh.asOf >= seed.asOf) { seed = fresh; writeIfChanged('nations-seed.json', seed); } }
        state.nationsAt = NOW.toISOString();
      } catch (e) { console.error('Sélections (base) :', e.message); }
    }
    const P = seed.params, yr = Number(todayStr.slice(0, 4)), seasonYear = Number(todayStr.slice(5, 7)) >= 7 ? yr + 1 : yr;
    const from = addDays(todayStr, -12), endNL = addDays(todayStr, 14);   // sélections : matchs affichés deux semaines à l'avance (trêves)
    const ur = await fetch(`https://match.uefa.com/v5/matches?competitionId=2014&seasonYear=${seasonYear}&fromDate=${from}&toDate=${endNL}&limit=200&offset=0&order=ASC`, {signal: AbortSignal.timeout(30000), headers: {'User-Agent': 'Mozilla/5.0 (PronostiK)'}});
    if (!ur.ok) throw new Error('API UEFA : HTTP ' + ur.status);
    const UM = await ur.json();
    if (!Array.isArray(UM)) throw new Error('API UEFA : réponse inattendue');
    if (UM[0]?.competition?.images?.FULL_LOGO) emblems.NL = UM[0].competition.images.FULL_LOGO;
    const fr = t => t?.translations?.displayName?.FR || t?.internationalName || '?';
    const isNeutral = m => !!(m.stadium?.countryCode && m.homeTeam?.countryCode && m.stadium.countryCode !== m.homeTeam.countryCode);
    // Matchs joués après la date de la base : appliqués aux notes
    const done = UM.filter(m => m.status === 'FINISHED' && m.score?.regular).map(m => ({date: m.kickOffTime.date, home: nationName(m.homeTeam.internationalName), away: nationName(m.awayTeam.internationalName), hg: m.score.regular.home, ag: m.score.regular.away, t: 'UEFA Nations League', neutral: isNeutral(m)}));
    const after = done.filter(m => m.date > seed.asOf).sort((a, b) => a.date.localeCompare(b.date));
    const ratings = runNationsElo(after, P, null, seed.ratings);
    const recentAll = [...seed.recent, ...after.map(m => [m.date, m.home, m.away, m.hg, m.ag])];
    const nameFR = {}; for (const m of UM) for (const t of [m.homeTeam, m.awayTeam]) if (t) nameFR[nationName(t.internationalName)] = fr(t);
    const dispN = n => nameFR[n] || n;
    for (const m of UM) {   // résultats (score à 90 minutes)
      if (m.status !== 'FINISHED' || !m.score?.regular) continue;
      const p = byId.get('uefa' + m.id);
      if (p && !p.res) { p.res = outcome(m.score.regular.home, m.score.regular.away); p.final = `${m.score.regular.home}–${m.score.regular.away}`; }
    }
    let n = 0;
    for (const m of UM) {
      if (m.status !== 'UPCOMING' || !m.homeTeam || !m.awayTeam || m.homeTeam.isPlaceHolder || m.awayTeam.isPlaceHolder) continue;
      const kickoff = m.kickOffTime.dateTime, date = parisDate(new Date(kickoff));
      if (date < todayStr || date > endNL) continue;
      const id = 'uefa' + m.id, old = byId.get(id);
      if (old && NOW >= new Date(old.kickoff) && old.kickoff === kickoff) continue;
      const H = nationName(m.homeTeam.internationalName), A = nationName(m.awayTeam.internationalName), neutral = isNeutral(m);
      const rh = ratings.get(H) ?? P.init, ra = ratings.get(A) ?? P.init, x = nationsPredict(rh, ra, neutral, P);
      const mk2 = marketsFromLambdas(x.lam[0], x.lam[1], false);
      const pois = (k, l) => { let q = Math.exp(-l); for (let i = 1; i <= k; i++) q *= l / i; return q; };
      let best = [0, 0, -1]; for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) { const q = pois(i, x.lam[0]) * pois(j, x.lam[1]); if (q > best[2]) best = [i, j, q]; }
      const five = t => recentAll.filter(r => r[0] < date && (r[1] === t || r[2] === t)).slice(-5).reverse().map(r => r[1] === t ? {d: r[0], o: dispN(r[2]), v: 'D', f: r[3], a: r[4]} : {d: r[0], o: dispN(r[1]), v: 'E', f: r[4], a: r[3]});
      const h2h = recentAll.filter(r => r[0] < date && ((r[1] === H && r[2] === A) || (r[1] === A && r[2] === H))).slice(-5).reverse().map(r => ({d: r[0], h: dispN(r[1]), a: dispN(r[2]), hg: r[3], ag: r[4]}));
      const entry = {id, apiId: null, uefaId: m.id, lg: 'NL', date, kickoff, home: fr(m.homeTeam), away: fr(m.awayTeam), crest: [flagUrl(m.homeTeam.countryCode, m.homeTeam.mediumLogoUrl || null), flagUrl(m.awayTeam.countryCode, m.awayTeam.mediumLogoUrl || null)],
        p: x.p.map(r4), lam: x.lam.map(r4), score: `${best[0]}–${best[1]}`, model: 'elo-selections', elo: [Math.round(rh), Math.round(ra)], neutral,
        markets: {o15: r4(mk2.o15), o25: r4(mk2.o25), btts: r4(mk2.btts), ht: mk2.ht.map(r4), scores: mk2.scores.map(([sc, v]) => [sc, r4(v)])},
        form: {h: five(H), a: five(A)}, stats: h2h.length ? {h2h} : null, groupe: m.group?.metaData?.groupName || null,
        rel: 'test', err: null, savedAt: old?.savedAt || NOW.toISOString(), updatedAt: old?.updatedAt || NOW.toISOString(), res: null, final: null};
      if (old) {
        const same = JSON.stringify([old.p, old.lam, old.kickoff]) === JSON.stringify([entry.p, entry.lam, entry.kickoff]);
        if (same) { entry.updatedAt = old.updatedAt; entry.form = old.form; } else entry.updatedAt = NOW.toISOString();
        predictions = predictions.filter(p => p.id !== id);
      }
      predictions.push(entry); byId.set(id, entry); n++;
    }
    natInfo = {ok: true, base: seed.asOf, matchs: UM.length, joues: done.length, pronostics: n};
  } catch (e) { errors.NL = String(e.message || e).slice(0, 160); console.error('Sélections :', e.message); }

  // --- 4a'. Logos des clubs des ligues sans API (Ligue 2) : liste publique des équipes d'ESPN, une fois par semaine.
  const ESPN_SLUG = {FL2: 'fra.2'};
  state.crests ||= {};
  for (const lgx of LEAGUES.filter(l => l.source === 'csv' && ESPN_SLUG[l.code])) {
    const cur = state.crests[lgx.code];
    if (cur && Object.keys(cur.map || {}).length >= 10 && (NOW - new Date(cur.at)) < 6 * 86400000) continue;
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_SLUG[lgx.code]}/teams`, {signal: AbortSignal.timeout(20000), headers: {'User-Agent': 'Mozilla/5.0 (PronostiK)'}});
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(), map = {};
      for (const x of j.sports?.[0]?.leagues?.[0]?.teams || []) {
        const t = x.team || {}, url = (t.logos || [])[0]?.href;
        const n = resolveName(t.displayName, known[lgx.code], ALIASES[lgx.code] || {}, true) || resolveName(t.shortDisplayName, known[lgx.code], ALIASES[lgx.code] || {}, true);
        if (n && url && /^https:\/\//.test(url)) map[n] = url;
      }
      if (Object.keys(map).length) state.crests[lgx.code] = {at: NOW.toISOString(), map};
    } catch (e) { console.error('Logos', lgx.code, ':', e.message); }
  }
  const crestOf = (lg, n) => state.crests?.[lg]?.map?.[n] || null;
  for (const p of predictions) if (state.crests[p.lg] && (!p.crest || !p.crest[0] || !p.crest[1])) p.crest = [p.crest?.[0] || crestOf(p.lg, p.home), p.crest?.[1] || crestOf(p.lg, p.away)];

  // --- 4b. cotes du marché pour les matchs à venir (comparaison affichée sur le site ; jamais bloquant)
  const oddsInfo = {ok: false, rows: 0, matched: 0, error: null};
  try {
    const r = await fetch(CSV_BASE + '/fixtures.csv', {signal: AbortSignal.timeout(20000)});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const fx = parseFixtures(await r.text());
    oddsInfo.ok = true; oddsInfo.rows = fx.length;
    // Ligues sans API (Ligue 2) : les matchs à venir viennent de ce fichier (heure anglaise convertie en UTC).
    const londonToUTC = (d, t) => {
      const [hh, mm] = (t || '12:00').split(':').map(Number), guess = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), hh, mm);
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}).formatToParts(new Date(guess)).map(x => [x.type, x.value]));
      const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
      return new Date(guess - (shown - guess)).toISOString().replace('.000Z', 'Z');
    };
    const slug = x => String(x).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '');
    for (const lgx of LEAGUES.filter(l => l.source === 'csv')) {
      // Calendrier : fichier fixtures.csv (avec cotes, publié le mardi et le vendredi) complété par le calendrier public d'ESPN.
      const rowsCsv = fx.filter(f => f.div === lgx.csv[0]);
      const espnRows = [];
      if (ESPN_SLUG[lgx.code]) {
        state.espnFx ||= {};
        const cur = state.espnFx[lgx.code];
        if (!cur || (NOW - new Date(cur.at)) > 2 * 3600000) {
          const rows = []; let ok = 0;
          for (let k = 0; k <= HORIZON_DAYS; k++) {
            const d = addDays(todayStr, k).replace(/-/g, '');
            try {
              const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_SLUG[lgx.code]}/scoreboard?dates=${d}`, {signal: AbortSignal.timeout(20000), headers: {'User-Agent': 'Mozilla/5.0 (PronostiK)'}});
              if (!r.ok) continue; ok++;
              for (const ev of (await r.json()).events || []) {
                const c = ev.competitions?.[0]; if (!c || c.status?.type?.completed || !ev.date) continue;
                const side = h => c.competitors?.find(x => x.homeAway === h)?.team;
                const nm = t => t && (resolveName(t.displayName, known[lgx.code], ALIASES[lgx.code] || {}, true) || resolveName(t.shortDisplayName, known[lgx.code], ALIASES[lgx.code] || {}, true));
                const H = nm(side('home')), A = nm(side('away')); if (!H || !A) continue;
                const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}).formatToParts(new Date(ev.date)).map(x => [x.type, x.value]));
                rows.push({div: lgx.csv[0], date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, home: H, away: A, mk: null, od: null, src: 'espn'});
              }
            } catch {}
          }
          if (ok) state.espnFx[lgx.code] = {at: NOW.toISOString(), rows};
        }
        espnRows.push(...(state.espnFx[lgx.code]?.rows || []));
      }
      const seen = new Set(rowsCsv.map(f => f.home + '|' + f.away));
      const allRows = [...rowsCsv, ...espnRows.filter(f => !seen.has(f.home + '|' + f.away))];
      for (const f of allRows) {
        const kickoff = londonToUTC(f.date, f.time), date = parisDate(new Date(kickoff));
        if (date < todayStr || date > end) continue;
        const id = `cs${lgx.code}-${f.date}-${slug(f.home)}-${slug(f.away)}`, old = byId.get(id);
        if (old && NOW >= new Date(old.kickoff) && old.kickoff === kickoff) continue;   // figé après le coup d'envoi
        const home = known[lgx.code].includes(f.home) ? f.home : resolve(f.home, lgx.code), away = known[lgx.code].includes(f.away) ? f.away : resolve(f.away, lgx.code);
        const entry = {id, apiId: null, lg: lgx.code, date, kickoff, home: home || f.home, away: away || f.away, crest: [crestOf(lgx.code, home || f.home), crestOf(lgx.code, away || f.away)], p: null, lam: null, score: null, err: null,
          form: {h: [], a: []}, rel: 'ok', savedAt: old?.savedAt || NOW.toISOString(), updatedAt: old?.updatedAt || NOW.toISOString(), res: null, final: null};
        if (!home || !away) entry.err = 'Équipe non reconnue dans l’historique.';
        else {
          entry.form = {h: lastFive(lgx.code, home, date), a: lastFive(lgx.code, away, date)};
          entry.stats = matchStats(lgx.code, home, away, date);
          try {
            const x = predictMatch(lgx.code, home, away, date);
            entry.p = x.p.map(r4); entry.lam = x.lam.map(r4); entry.score = x.score; entry.model = x.model;
            const mk2 = marketsFromLambdas(x.lam[0], x.lam[1]); entry.markets = {o15: r4(mk2.o15), o25: r4(mk2.o25), btts: r4(mk2.btts), ht: mk2.ht.map(r4), scores: mk2.scores.map(([sc, v]) => [sc, r4(v)])};
            entry.rel = seasonCount(lgx.code, home, date) >= 5 && seasonCount(lgx.code, away, date) >= 5 ? 'ok' : 'limited';
          } catch (e) { entry.err = e.message; }
        }
        if (old) {
          if (old.mk) entry.mk = old.mk;
          if (old.od) entry.od = old.od;
          const same = JSON.stringify([old.p, old.lam, old.kickoff]) === JSON.stringify([entry.p, entry.lam, entry.kickoff]);
          if (same) { entry.updatedAt = old.updatedAt; entry.form = old.form; entry.rel = old.rel; entry.err = old.err; } else entry.updatedAt = NOW.toISOString();
          predictions = predictions.filter(p => p.id !== id);
        }
        predictions.push(entry); byId.set(id, entry);
      }
    }
    const lgByDiv = Object.fromEntries(LEAGUES.map(l => [l.csv[0], l.code]));
    const dayDiff = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;
    for (const f of fx) {
      const lg = lgByDiv[f.div]; if (!lg || !f.mk) continue;
      const home = resolveName(f.home, known[lg], ALIASES[lg] || {}, lg === 'FL1'), away = resolveName(f.away, known[lg], ALIASES[lg] || {}, lg === 'FL1');
      if (!home || !away) continue;
      const p = predictions.find(x => x.lg === lg && x.home === home && x.away === away && !x.res && NOW < new Date(x.kickoff) && dayDiff(x.date, f.date) <= 2);
      if (p) { p.mk = f.mk.map(r4); if (f.od) p.od = f.od.map(v => Math.round(v * 100) / 100); oddsInfo.matched++; }
    }
  } catch (e) { oddsInfo.error = String(e.message || e).slice(0, 120); }

  // Marchés manquants (pronostic figé avant l'ajout des marchés) : calculés à partir des buts attendus figés avant le match.
  for (const p of predictions) if (p.p && Array.isArray(p.lam) && !p.markets) { const mk2 = marketsFromLambdas(p.lam[0], p.lam[1]); p.markets = {o15: r4(mk2.o15), o25: r4(mk2.o25), btts: r4(mk2.btts), ht: mk2.ht.map(r4), scores: mk2.scores.map(([s, v]) => [s, r4(v)])}; }
  for (const p of predictions) if (p.markets && p.markets.btts == null && Array.isArray(p.lam)) p.markets.btts = r4(marketsFromLambdas(p.lam[0], p.lam[1]).btts);

  // --- 5. règlement
  const csvLeague = new Set(LEAGUES.filter(l => l.source === 'csv').map(l => l.code));
  // Ligues sans API : score final lu dès la fin du match sur le tableau des scores public d'ESPN (le CSV arrive plus tard).
  for (const lgx of LEAGUES.filter(l => l.source === 'csv' && ESPN_SLUG[l.code])) {
    const pend = predictions.filter(p => p.lg === lgx.code && !p.res && NOW - new Date(p.kickoff) > 100 * 60000);
    for (const d of [...new Set(pend.map(p => p.kickoff.slice(0, 10).replace(/-/g, '')))]) {
      try {
        const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_SLUG[lgx.code]}/scoreboard?dates=${d}`, {signal: AbortSignal.timeout(20000), headers: {'User-Agent': 'Mozilla/5.0 (PronostiK)'}});
        if (!r.ok) throw new Error('HTTP ' + r.status);
        for (const ev of (await r.json()).events || []) {
          const c = ev.competitions?.[0]; if (!c?.status?.type?.completed) continue;
          const side = h => c.competitors.find(x => x.homeAway === h), nm = t => resolveName(t.team?.displayName, known[lgx.code], ALIASES[lgx.code] || {}, true) || resolveName(t.team?.shortDisplayName, known[lgx.code], ALIASES[lgx.code] || {}, true);
          const H = side('home'), A = side('away'); if (!H || !A) continue;
          const p = pend.find(x => x.home === nm(H) && x.away === nm(A));
          const hg = Number(H.score), ag = Number(A.score);
          if (p && Number.isFinite(hg) && Number.isFinite(ag)) {
            p.res = outcome(hg, ag); p.final = `${hg}–${ag}`;
            const row = {date: p.date, home: p.home, away: p.away, hg, ag, lg: lgx.code, division: 'L1', avgH: null, avgD: null, avgA: null};   // remplacé par la ligne du CSV à sa parution
            if (!byKey.has(key(row))) { history.push(row); byKey.set(key(row), row); }
          }
        }
      } catch (e) { console.error('Scores', lgx.code, ':', e.message); }
    }
  }
  for (const p of predictions) {
    if (p.res || !csvLeague.has(p.lg) || NOW < new Date(p.kickoff)) continue;   // ligue sans API : résultat lu dans le CSV
    const m = history.find(h => h.lg === p.lg && h.home === p.home && h.away === p.away && Math.abs(new Date(h.date) - new Date(p.date)) <= 86400000);
    if (m) { p.res = outcome(m.hg, m.ag); p.final = `${m.hg}–${m.ag}`; }
  }
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

  // --- 6c. classements de la saison en cours (1re division), avec les blasons connus par l'API
  const standings = {};
  {
    for (const lg of LEAGUES) {
      const crest = {};
      for (const m of apiByLeague[lg.code] || []) for (const t of [m.homeTeam, m.awayTeam]) {
        if (!t || !t.crest) continue;
        const n = resolveName(t.name || t.shortName, known[lg.code], ALIASES[lg.code] || {}, lg.code === 'FL1');
        if (n) crest[n] = t.crest;
      }
      Object.assign(crest, Object.fromEntries(Object.entries(state.crests?.[lg.code]?.map || {}).filter(([k]) => !crest[k])));
      const S = history.filter(m => m.lg === lg.code && m.division === 'L1' && m.date >= seasonStart).sort((a, b) => a.date.localeCompare(b.date));
      if (!S.length) continue;
      const T = {};
      const row = t => T[t] || (T[t] = {t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: []});
      for (const m of S) {
        const h = row(m.home), a = row(m.away);
        h.p++; a.p++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
        const r = m.hg > m.ag ? ['V', 'D'] : m.hg < m.ag ? ['D', 'V'] : ['N', 'N'];
        h.form.push(r[0]); a.form.push(r[1]);
        if (r[0] === 'V') { h.w++; h.pts += 3; a.l++; } else if (r[1] === 'V') { a.w++; a.pts += 3; h.l++; } else { h.d++; a.d++; h.pts++; a.pts++; }
      }
      const rows = Object.values(T).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.t.localeCompare(y.t))
        .map((r, i) => ({rang: i + 1, ...r, form: r.form.slice(-5).join(''), crest: crest[r.t] || null}));
      standings[lg.code] = {saison: season, maj: S[S.length - 1].date, rows};
    }
    if (uclStandings) { const cups = uclStandings.__cups; delete uclStandings.__cups; if (uclStandings.rows) standings.CL = uclStandings; for (const [k, v] of Object.entries(cups || {})) standings[k] = v; }
    writeIfChanged('standings.json', standings);
  }

  // --- 6d. Résumé de la journée : surprises, favoris tenus, séries, mouvements au classement (données du site uniquement)
  {
    const DAYS = 4, from = addDays(todayStr, -DAYS + 1);
    const done = predictions.filter(p => p.p && ['H', 'D', 'A'].includes(p.res) && p.date >= from && p.date <= todayStr);
    const lab = (p, i) => i === 1 ? 'Match nul' : (i === 0 ? p.home : p.away);
    const items = done.map(p => { const i = 'HDA'.indexOf(p.res), t = p.p.indexOf(Math.max(...p.p)); return {id: p.id, lg: p.lg, date: p.date, home: p.home, away: p.away, score: p.final, issue: lab(p, i), probIssue: r4(p.p[i]), fav: lab(p, t), probFav: r4(p.p[t]), favOk: t === i, mk: p.mk ? r4(p.mk[i]) : null, crest: p.crest || null}; });
    const surprises = items.filter(x => x.probIssue < 0.30).sort((a, b) => a.probIssue - b.probIssue).slice(0, 6);
    const tenus = items.filter(x => x.favOk && x.probFav >= 0.55).sort((a, b) => b.probFav - a.probFav).slice(0, 6);
    // séries en cours (saison, 1re division)
    const series = [];
    for (const lg of LEAGUES) {
      const S = history.filter(m => m.lg === lg.code && m.division === 'L1' && m.date >= seasonStart).sort((a, b) => a.date.localeCompare(b.date));
      const res = {};
      for (const m of S) { (res[m.home] ||= []).push(m.hg > m.ag ? 'V' : m.hg === m.ag ? 'N' : 'D'); (res[m.away] ||= []).push(m.ag > m.hg ? 'V' : m.ag === m.hg ? 'N' : 'D'); }
      for (const [t, r] of Object.entries(res)) {
        const run = f => { let n = 0; for (let i = r.length - 1; i >= 0 && f(r[i]); i--) n++; return n; };
        const w = run(x => x === 'V'), u = run(x => x !== 'D'), l = run(x => x === 'D'), nw = run(x => x !== 'V');
        const c = (standings[lg.code]?.rows || []).find(x => x.t === t)?.crest || null;
        if (w >= 3) series.push({lg: lg.code, team: t, type: 'victoires', n: w, crest: c});
        else if (u >= 6) series.push({lg: lg.code, team: t, type: 'sans défaite', n: u, crest: c});
        if (l >= 3) series.push({lg: lg.code, team: t, type: 'défaites', n: l, crest: c});
        else if (nw >= 6) series.push({lg: lg.code, team: t, type: 'sans victoire', n: nw, crest: c});
      }
    }
    series.sort((a, b) => b.n - a.n);
    // mouvements au classement sur la période
    const rankAt = (lg, before) => {
      const T = {}, row = t => T[t] || (T[t] = {t, pts: 0, gf: 0, ga: 0});
      for (const m of history.filter(m => m.lg === lg && m.division === 'L1' && m.date >= seasonStart && m.date < before)) {
        const h = row(m.home), a = row(m.away); h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
        if (m.hg > m.ag) h.pts += 3; else if (m.hg < m.ag) a.pts += 3; else { h.pts++; a.pts++; }
      }
      const o = Object.values(T).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.t.localeCompare(y.t));
      return Object.fromEntries(o.map((r, i) => [r.t, i + 1]));
    };
    const moves = [];
    for (const lg of LEAGUES) {
      const before = rankAt(lg.code, from), now = rankAt(lg.code, addDays(todayStr, 1));
      for (const [t, r] of Object.entries(now)) if (before[t] && before[t] !== r) moves.push({lg: lg.code, team: t, avant: before[t], apres: r, delta: before[t] - r, crest: (standings[lg.code]?.rows || []).find(x => x.t === t)?.crest || null});
    }
    const montees = moves.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const descentes = moves.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);
    const leaders = LEAGUES.map(l => { const r = standings[l.code]?.rows?.[0]; return r ? {lg: l.code, team: r.t, pts: r.pts, crest: r.crest} : null; }).filter(Boolean);
    writeIfChanged('resume.json', {du: from, au: todayStr, bilan: {n: items.length, favorisJustes: items.filter(x => x.favOk).length}, surprises, tenus, series: series.slice(0, 8), montees, descentes, leaders});
  }

  // --- Compositions : onze de départ du dernier match de championnat de chaque équipe (ESPN, une fois par heure).
  try {
    state.compos ||= {at: null, days: {}, names: {}, lu: {}};
    const C = state.compos;
    if (!process.env.FD_API_BASE && (!C.at || NOW - new Date(C.at) >= 55 * 60000)) {
      const out = {};
      for (const [lg, slug] of Object.entries(ESPN_LG)) {
        C.days[lg] ||= {}; C.names[lg] ||= {};
        const ev = await espnRecent(slug, C.days[lg], NOW);
        const recent = history.filter(m => m.lg === lg && m.date >= addDays(todayStr, -30));
        C.names[lg] = mapNames(ev, recent, C.names[lg]);
        const last = {};
        for (const e of ev.sort((a, b) => a.date.localeCompare(b.date))) { last[e.home] = e; last[e.away] = e; }
        for (const [n, e] of Object.entries(last)) {
          const ours = C.names[lg][n]; if (!ours) continue;
          if (!(e.id in C.lu)) { const lu = await espnLineup(slug, e.id); if (lu) C.lu[e.id] = {d: e.date, ...lu}; else continue; }
          const side = e.home === n ? 'home' : 'away', L = C.lu[e.id][side];
          if (!L) continue;
          const opp = side === 'home' ? e.away : e.home;
          out[lg + '|' + ours] = {d: e.date, o: C.names[lg][opp] || opp, v: side === 'home' ? 'D' : 'E', s: side === 'home' ? `${e.hs}-${e.as}` : `${e.as}-${e.hs}`, f: L.formation, xi: L.xi};
        }
      }
      for (const [id, v] of Object.entries(C.lu)) if (v.d < addDays(todayStr, -35)) delete C.lu[id];
      if (Object.keys(out).length) { writeIfChanged('compos.json', out); C.at = NOW.toISOString(); }
    }
  } catch (e) { console.log('compositions :', e.message); }

  writeIfChanged('history.json', history);
  writeIfChanged('predictions.json', predictions);
  writeIfChanged('state.json', state);
  const prevMeta = readJSON('meta.json', {});
  const errKeys = Object.keys(errors);
  const meta = {
    updated: changed ? NOW.toISOString() : (prevMeta.updated || NOW.toISOString()), season, source: 'football-data.org',
    leagues: [...LEAGUES, ...(uclInfo.ok || (prevMeta.leagues || []).some(x => x.code === 'CL') ? [{code: 'CL', name: 'Ligue des champions'}] : []), ...(uclInfo.europa || (prevMeta.leagues || []).some(x => x.code === 'EL') ? [{code: 'EL', name: 'Ligue Europa'}] : []), ...(uclInfo.conference || (prevMeta.leagues || []).some(x => x.code === 'ECL') ? [{code: 'ECL', name: 'Ligue Conférence'}] : []), ...(natInfo.ok || (prevMeta.leagues || []).some(x => x.code === 'NL') ? [{code: 'NL', name: 'Ligue des nations'}] : [])].map(l => ({code: l.code, name: l.name, emblem: emblems[l.code] || (prevMeta.leagues || []).find(x => x.code === l.code)?.emblem || null})), errors, ucl: uclInfo, nations: natInfo,
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
