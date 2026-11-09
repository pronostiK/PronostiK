// Laboratoire Coupe du Roi : quel format de requête ESPN fonctionne pour le calendrier ?
// Résultat : lab/cdr/probe.json. Ne touche pas au site.
import {writeFileSync, mkdirSync} from 'node:fs';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.copa_del_rey';
const H = {'User-Agent': 'Mozilla/5.0 (PronostiK)'};
const out = {at: new Date().toISOString(), tests: {}};
const brief = e => { const c = e.competitions?.[0] || {}, s = h => c.competitors?.find(x => x.homeAway === h) || {};
  const h = s('home'), a = s('away');
  return {date: e.date, status: c.status?.type?.name, detail: c.status?.type?.detail, home: h.team?.displayName, away: a.team?.displayName,
    hs: h.score ?? null, as: a.score ?? null, hl: (h.linescores || []).map(x => x.value), al: (a.linescores || []).map(x => x.value),
    hso: h.shootoutScore ?? null, aso: a.shootoutScore ?? null, winner: h.winner ? 'H' : a.winner ? 'A' : null, note: c.notes?.[0]?.headline || null, neutral: c.neutralSite ?? null}; };
async function test(name, url) {
  try {
    const r = await fetch(url, {signal: AbortSignal.timeout(30000), headers: H});
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    const ev = j?.events || j?.items || [];
    out.tests[name] = {url, http: r.status, n: ev.length, keys: j ? Object.keys(j).slice(0, 12) : null, body: j ? null : t.slice(0, 200),
      calendar: j?.leagues?.[0]?.calendar?.slice?.(0, 40) || null, season: j?.leagues?.[0]?.season || null, events: ev.slice(0, 60).map(brief)};
  } catch (e) { out.tests[name] = {url, error: String(e.message || e)}; }
}
await test('sans_parametre', `${BASE}/scoreboard`);
await test('un_jour_20261029', `${BASE}/scoreboard?dates=20261029`);
await test('un_jour_20251029', `${BASE}/scoreboard?dates=20251029`);
await test('plage_sans_limit', `${BASE}/scoreboard?dates=20251201-20251231`);
await test('plage_courte', `${BASE}/scoreboard?dates=20260115-20260116`);
await test('finale_2025', `${BASE}/scoreboard?dates=20250426`);
await test('saison_2025', `${BASE}/scoreboard?season=2025`);
await test('core_events', `https://sports.core.api.espn.com/v2/sports/soccer/leagues/esp.copa_del_rey/events?dates=20251201-20251231&limit=100`);
// calendrier d'une équipe (Real Madrid id 86 chez ESPN), filtré sur la coupe
await test('equipe_real', `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.copa_del_rey/teams/86/schedule`);
await test('equipe_real_2025', `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.copa_del_rey/teams/86/schedule?season=2025`);
mkdirSync('lab/cdr', {recursive: true});
writeFileSync('lab/cdr/probe.json', JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out.tests)) console.log(k, v.http, v.n, v.error || '');
