// Test de bout en bout : fausse API football-data.org + faux serveur CSV, 5 championnats.
import http from 'node:http';
import {mkdtempSync, copyFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'pk-'));
copyFileSync(join(root, 'tests/fixtures/history-FL1-seed.json'), join(dir, 'history.json'));   // jeu figé : la France est déjà dans l'historique de départ (le test ne dépend pas des données vivantes)

// ---- données synthétiques (noms au format des CSV)
const TOP = {
  PL: ['Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton', 'Burnley', 'Chelsea', 'Crystal Palace', 'Everton', 'Fulham', 'Leeds', 'Liverpool', 'Man City', 'Man United', 'Newcastle', "Nott'm Forest", 'Sunderland', 'Tottenham', 'West Ham', 'Wolves'],
  BL1: ['Bayern Munich', 'Dortmund', 'Leverkusen', 'RB Leipzig', 'Ein Frankfurt', "M'gladbach", 'Wolfsburg', 'Union Berlin', 'Werder Bremen', 'Stuttgart', 'Freiburg', 'Hoffenheim', 'Mainz', 'Augsburg', 'Heidenheim', 'St Pauli', 'FC Koln', 'Hamburg'],
  SA: ['Inter', 'Milan', 'Juventus', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina', 'Bologna', 'Torino', 'Genoa', 'Cagliari', 'Verona', 'Lecce', 'Udinese', 'Sassuolo', 'Parma', 'Como', 'Cremonese', 'Pisa'],
  PD: ['Real Madrid', 'Barcelona', 'Ath Madrid', 'Ath Bilbao', 'Sociedad', 'Betis', 'Sevilla', 'Valencia', 'Villarreal', 'Celta', 'Espanol', 'Getafe', 'Osasuna', 'Mallorca', 'Vallecano', 'Alaves', 'Girona', 'Levante', 'Oviedo', 'Elche'],
};
const SECOND = {PL: ['Leicester', 'Ipswich', 'Southampton', 'Norwich', 'Hull', 'Derby'], BL1: ['Hertha', 'Hannover', 'Schalke', 'Nurnberg', 'Karlsruhe', 'Paderborn'], SA: ['Palermo', 'Venezia', 'Spezia', 'Bari', 'Sampdoria', 'Modena'], PD: ['Zaragoza', 'Sporting Gijon', 'Racing Santander', 'Granada', 'Almeria', 'Cadiz']};
const CSVCODE = {PL: ['E0', 'E1'], BL1: ['D1', 'D2'], SA: ['I1', 'I2'], PD: ['SP1', 'SP2']};
const API_NAME = {'Man City': 'Manchester City FC', 'Man United': 'Manchester United FC', "Nott'm Forest": 'Nottingham Forest FC', 'Wolves': 'Wolverhampton Wanderers FC', 'Tottenham': 'Tottenham Hotspur FC', 'Brighton': 'Brighton & Hove Albion FC',
  'Bayern Munich': 'FC Bayern München', "M'gladbach": 'Borussia Mönchengladbach', 'Dortmund': 'Borussia Dortmund', 'Leverkusen': 'Bayer 04 Leverkusen', 'Ein Frankfurt': 'Eintracht Frankfurt',
  'Inter': 'FC Internazionale Milano', 'Milan': 'AC Milan', 'Ath Madrid': 'Club Atlético de Madrid', 'Ath Bilbao': 'Athletic Club', 'Real Madrid': 'Real Madrid CF', 'Barcelona': 'FC Barcelona',
  'Sociedad': 'Real Sociedad de Fútbol', 'Espanol': 'RCD Espanyol de Barcelona', 'Vallecano': 'Rayo Vallecano de Madrid', 'Celta': 'RC Celta de Vigo', 'Betis': 'Real Betis Balompié'};
const apiName = n => API_NAME[n] || n + ' FC';
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pois = l => { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
function season(teams, y, rounds, code) {
  const n = teams.length - (teams.length % 2), t = teams.slice(0, n), strength = Object.fromEntries(t.map(x => [x, 0.7 + rnd() * 0.9]));
  const rows = []; let arr = t.slice();
  for (let r = 0; r < Math.min(rounds, 2 * (n - 1)); r++) {
    const date = new Date(Date.UTC(y, 7, 15 + 7 * r));
    for (let i = 0; i < n / 2; i++) {
      let h = arr[i], a = arr[n - 1 - i]; if (r >= n - 1) [h, a] = [a, h];
      const lh = 1.4 * strength[h] / strength[a] ** 0.5, la = 1.1 * strength[a] / strength[h] ** 0.5;
      const hg = pois(lh), ag = pois(la), ph = 1 / (1 + Math.exp(-(strength[h] - strength[a]) * 1.6)) * 0.75 + 0.1, odds = [1 / ph, 3.4, 1 / (0.9 - ph * 0.6 + 0.05)].map(v => (Math.max(1.2, v)).toFixed(2));
      rows.push(`${code},${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()},20:00,${h},${a},${hg},${ag},${hg > ag ? 'H' : hg < ag ? 'A' : 'D'},${odds[0]},${odds[1]},${odds[2]},${odds[0]},${odds[1]},${odds[2]}`);
    }
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return rows;
}
const HEAD = 'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,AvgH,AvgD,AvgA,AvgCH,AvgCD,AvgCA';
const CSV = {};
for (const lg of Object.keys(TOP)) for (const [yy, y] of [['2324', 2023], ['2425', 2024], ['2526', 2025], ['2627', 2026]]) {
  CSV[`/mmz4281/${yy}/${CSVCODE[lg][0]}.csv`] = [HEAD, ...season(TOP[lg], y, y === 2026 ? 9 : 38, CSVCODE[lg][0])].join('\n');
  CSV[`/mmz4281/${yy}/${CSVCODE[lg][1]}.csv`] = [HEAD, ...season(SECOND[lg], y, y === 2026 ? 9 : 10, CSVCODE[lg][1])].join('\n');
}

// ---- faux serveur (API + CSV)
let state = {}, failLeague = {}, goodToken = 'good', FIX = null;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/mmz4281/')) { const b = CSV[u.pathname]; res.writeHead(b ? 200 : 404); res.end(b || 'nope'); return; }
  if (u.pathname === '/fixtures.csv') { res.writeHead(FIX ? 200 : 404); res.end(FIX || 'nope'); return; }
  const m = u.pathname.match(/\/competitions\/(\w+)\/matches/);
  if (!m || req.headers['x-auth-token'] !== goodToken) { res.writeHead(403, {'content-type': 'application/json'}); res.end(JSON.stringify({message: 'Your API token is invalid.'})); return; }
  if (failLeague[m[1]]) { res.writeHead(403, {'content-type': 'application/json'}); res.end(JSON.stringify({message: 'Competition not in your plan.'})); return; }
  res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify({matches: state[m[1]] || []}));
});
await new Promise(r => srv.listen(0, r));
const port = srv.address().port;
const T = (h, a, utc, id, status = 'TIMED', ft) => ({id, status, utcDate: utc, homeTeam: {name: h}, awayTeam: {name: a}, score: {fullTime: ft || {home: null, away: null}}});
function run(now, extra = {}) {
  return new Promise(resolve => {
    const c = spawn('node', [join(root, 'scripts/update.mjs')], {env: {...process.env, FD_API_BASE: `http://127.0.0.1:${port}/v4`, CSV_BASE: `http://127.0.0.1:${port}`, FD_TOKEN: goodToken, NOW: now, DATA_DIR: dir, API_DELAY_MS: '0', ...extra}});
    let stdout = '', stderr = ''; c.stdout.on('data', d => stdout += d); c.stderr.on('data', d => stderr += d);
    c.on('close', status => resolve({status, stdout, stderr}));
  });
}
const J = f => JSON.parse(readFileSync(join(dir, f), 'utf8'));
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : ' FAIL ') + m); if (!c) fail++; };

// Phase 1 : samedi 31/10/2026
state = {
  FL1: [T('Olympique de Marseille', 'Olympique Lyonnais', '2026-11-01T19:45:00Z', 101), T('Paris Saint-Germain FC', 'AS Monaco FC', '2026-11-02T20:00:00Z', 102), T('Racing Club de Lens', 'Stade Rennais FC 1901', '2026-11-01T16:00:00Z', 103), T('LOSC Lille', 'OGC Nice', '2026-10-25T15:00:00Z', 90, 'FINISHED', {home: 2, away: 1})],
  PL: [T(apiName('Man City'), apiName('Arsenal'), '2026-11-01T16:30:00Z', 201), T(apiName('Liverpool'), apiName('Man United'), '2026-11-01T14:00:00Z', 202), T(apiName("Nott'm Forest"), apiName('Brighton'), '2026-11-02T15:00:00Z', 203)],
  BL1: [T(apiName('Bayern Munich'), apiName('Dortmund'), '2026-11-01T17:30:00Z', 301), T(apiName("M'gladbach"), apiName('Ein Frankfurt'), '2026-11-01T14:30:00Z', 302), T(apiName('Leverkusen'), apiName('St Pauli'), '2026-11-02T14:30:00Z', 303)],
  SA: [T(apiName('Inter'), apiName('Milan'), '2026-11-01T19:45:00Z', 401), T(apiName('Napoli'), apiName('Roma'), '2026-11-01T17:00:00Z', 402), T('Equipe Inconnue FC', apiName('Lazio'), '2026-11-02T19:45:00Z', 403)],
  PD: [T(apiName('Real Madrid'), apiName('Barcelona'), '2026-11-01T20:00:00Z', 501), T(apiName('Ath Madrid'), apiName('Ath Bilbao'), '2026-11-01T17:30:00Z', 502), T(apiName('Espanol'), apiName('Vallecano'), '2026-11-02T18:30:00Z', 503)],
};
FIX = ['Div,Date,Time,HomeTeam,AwayTeam,AvgH,AvgD,AvgA', 'F1,01/11/2026,20:45,Marseille,Lyon,2.00,3.50,3.80', 'E0,01/11/2026,16:30,Man City,Arsenal,2.40,3.40,2.90', 'F1,01/11/2026,20:45,Equipe Fantome,Lyon,2,3,4'].join('\n');
let r = await run('2026-10-31T20:00:00Z'); console.log(r.stdout.trim());
ok(r.status === 0, 'phase 1 : sortie 0');
let pred = J('predictions.json');
ok(pred.length === 15, 'phase 1 : 15 pronostics (3 par championnat) → ' + pred.length);
ok(pred.filter(p => p.p).length === 14, 'phase 1 : 14 avec probabilités, 1 sans (équipe inconnue)');
ok(pred.every(p => !p.p || Math.abs(p.p.reduce((a, b) => a + b) - 1) < 1e-3), 'phase 1 : probabilités somment à 1');
ok(pred.find(p => p.apiId === 201 && p.home === 'Man City' && p.away === 'Arsenal'), 'phase 1 : Manchester City FC → Man City');
ok(pred.find(p => p.apiId === 301 && p.home === 'Bayern Munich'), 'phase 1 : FC Bayern München → Bayern Munich');
ok(pred.find(p => p.apiId === 401 && p.home === 'Inter' && p.away === 'Milan'), 'phase 1 : Internazionale / AC Milan reconnus');
ok(pred.find(p => p.apiId === 502 && p.home === 'Ath Madrid'), 'phase 1 : Club Atlético de Madrid → Ath Madrid');
ok(pred.find(p => p.apiId === 403).err, 'phase 1 : équipe inconnue signalée sans chiffre inventé');
ok(J('meta.json').unmapped.some(u => u.name === 'Equipe Inconnue FC'), 'phase 1 : nom inconnu listé dans meta.unmapped');
const scAll = J('scorecard.json'), sc = scAll.leagues;
ok(scAll.version === 2 && Object.values(sc).every(x => x.n === x.nV2 + x.nRepli && x.exclus.joues === x.n + x.exclus.sansCotes + x.exclus.sansPronostic),
  'bilan : chaque match joué est compté une fois (pronostiqué = v2 + repli ; joués = pronostiqués + sans cotes + sans pronostic)');
ok(Object.values(sc).every(x => x.ecartBrier && x.ecartBrier.lo <= x.ecartBrier.diff && x.ecartBrier.diff <= x.ecartBrier.hi && x.ecartLog && x.ecartLog.lo <= x.ecartLog.hi)
  && scAll.total && scAll.total.n === Object.values(sc).reduce((a, x) => a + x.n, 0) && scAll.total.ecartBrier,
  'bilan : intervalles de confiance présents et cohérents, total = somme des championnats');
ok(Object.values(sc).every(x => Math.abs((x.brierModel - x.brierMarket) - x.ecartBrier.diff) < 2e-4), 'bilan : écart apparié = différence des moyennes (mêmes matchs des deux côtés)');
ok(['FL1', 'PL', 'BL1', 'SA', 'PD'].every(k => sc[k] && sc[k].n > 100), 'phase 1 : bilan calculé pour les 5 championnats (' + Object.entries(sc).map(([k, v]) => k + ':' + v.n).join(' ') + ')');
ok(J('history.json').some(m => m.lg === 'FL1' && m.home === 'Lille' && m.away === 'Nice' && m.date === '2026-10-25'), 'phase 1 : résultat récent ajouté à l\'historique de la France');
{ const a = pred.find(p => p.apiId === 101), b = pred.find(p => p.apiId === 201), m = J('meta.json').odds;
  ok(a.mk && Math.abs(a.mk.reduce((x, y) => x + y) - 1) < 1e-3 && a.mk[0] > a.mk[2], 'cotes : Marseille–Lyon reçoit les probabilités du marché sans marge');
  ok(b.mk && b.mk[0] < 0.45 && b.mk[0] > 0.38, 'cotes : Man City–Arsenal reçoit ses probabilités');
  ok(!pred.find(p => p.apiId === 102).mk, 'cotes : un match absent du fichier reste sans cotes');
  ok(m.ok && m.rows === 3 && m.matched === 2, 'cotes : meta.odds = lu 3 lignes, 2 appariées'); }
ok(pred.filter(p => p.p && p.model === 'v2').every(p => p.shadow && Math.abs(p.shadow.hyb.reduce((a, b) => a + b) - 1) < 1e-3), 'coulisse : chaque pronostic v2 a un hybride Elo + v2 (non publié), de somme 1');
ok(pred.filter(p => p.p).every(p => p.markets && p.markets.o25 > 0 && p.markets.o25 < 1 && p.markets.o15 >= p.markets.o25 && Math.abs(p.markets.ht.reduce((a, b) => a + b) - 1) < 1e-3 && p.markets.scores.length === 3), 'marchés : +/-1,5, +/-2,5, mi-temps et scores exacts calculés et cohérents');
ok(J('shadow.json').debut === '2026-11-01' && J('shadow.json').suivi, 'coulisse : fichier de suivi créé, avec le décompte des matchs');
ok(pred.filter(p => p.shadow).every(p => p.shadow.at && p.shadow.at < p.kickoff), 'coulisse : chaque prédiction de l’hybride est horodatée avant le coup d’envoi');
const frozen = JSON.stringify(pred.find(p => p.apiId === 201).p);

// Relance sans changement
const before = readFileSync(join(dir, 'predictions.json'), 'utf8');
FIX = null;
r = await run('2026-10-31T23:00:00Z');
ok(r.status === 0 && J('meta.json').odds.ok === false && J('predictions.json').find(p => p.apiId === 101).mk, 'cotes indisponibles : le site continue et garde les dernières cotes');
ok(readFileSync(join(dir, 'predictions.json'), 'utf8') === before, 'relance sans changement : pronostics identiques');
ok(!/Historique/.test(r.stdout), 'relance : les CSV ne sont pas retéléchargés avant 6 jours');

// Phase 2 : le match est terminé ; le pronostic ne bouge pas
state.PL = state.PL.map(m => m.id === 201 ? T(apiName('Man City'), apiName('Arsenal'), '2026-11-01T16:30:00Z', 201, 'FINISHED', {home: 2, away: 2}) : m);
state.BL1 = state.BL1.map(m => m.id === 301 ? T(apiName('Bayern Munich'), apiName('Dortmund'), '2026-11-01T17:30:00Z', 301, 'FINISHED', {home: 4, away: 0}) : m);
r = await run('2026-11-01T22:30:00Z'); console.log(r.stdout.trim());
pred = J('predictions.json');
ok(pred.find(p => p.apiId === 201).res === 'D' && pred.find(p => p.apiId === 201).final === '2–2', 'phase 2 : Man City–Arsenal réglé 2–2');
ok(pred.find(p => p.apiId === 301).res === 'H', 'phase 2 : Bayern–Dortmund réglé');
ok(JSON.stringify(pred.find(p => p.apiId === 201).p) === frozen, 'phase 2 : pronostic identique à celui d\'avant le match');
ok(J('history.json').some(m => m.lg === 'PL' && m.home === 'Man City' && m.hg === 2 && m.date === '2026-11-01'), 'phase 2 : résultat ajouté à l\'historique anglais');

if (process.env.KEEP_DIR) { const {cpSync, mkdirSync} = await import('node:fs'); mkdirSync(process.env.KEEP_DIR, {recursive: true}); for (const f of ['predictions.json', 'meta.json', 'scorecard.json', 'standings.json', 'resume.json']) cpSync(join(dir, f), join(process.env.KEEP_DIR, f)); }

// Phase 3 : un championnat hors forfait, les autres continuent
failLeague.BL1 = true;
r = await run('2026-11-03T10:00:00Z');
ok(r.status === 0, 'phase 3 : un championnat en erreur n\'arrête pas les autres');
ok(J('meta.json').errors.BL1 && /BL1/.test(J('meta.json').lastError), 'phase 3 : erreur BL1 enregistrée');
ok(J('predictions.json').filter(p => p.lg === 'BL1').length === 3, 'phase 3 : pronostics Bundesliga conservés');
failLeague = {};

// Phase 4 : mauvaise clé
goodToken = 'autre';
r = await run('2026-11-04T10:00:00Z', {FD_TOKEN: 'mauvais'});
ok(r.status === 1 && /403/.test(r.stderr), 'mauvaise clé : échec clair');
ok(J('predictions.json').length === 15, 'mauvaise clé : données conservées');
srv.close();
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent');
process.exit(fail ? 1 : 0);
