// Laboratoire Coupe du Roi : sondage du calendrier public d'ESPN (esp.copa_del_rey).
// Saison en cours (calendrier, tours, équipes) + saisons passées (format des scores : prolongation, tirs au but).
// Résultat : lab/cdr/probe.json. Ne touche pas au site.
import {writeFileSync, mkdirSync} from 'node:fs';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.copa_del_rey';
const H = {'User-Agent': 'Mozilla/5.0 (PronostiK)'};
const get = async u => { const r = await fetch(u, {signal: AbortSignal.timeout(30000), headers: H}); if (!r.ok) throw new Error(`HTTP ${r.status} ${u}`); return r.json(); };

const out = {at: new Date().toISOString(), seasons: {}, sample: null, errors: []};
// Une requête par mois (ESPN refuse les plages trop longues), de septembre à mai.
const months = y => [9, 10, 11, 12, 1, 2, 3, 4, 5].map(m => { const yy = m >= 9 ? y : y + 1, mm = String(m).padStart(2, '0'), last = new Date(Date.UTC(yy, m, 0)).getUTCDate(); return `${yy}${mm}01-${yy}${mm}${last}`; });
try { const t = await get(`${BASE}/teams`); out.teams = (t.sports?.[0]?.leagues?.[0]?.teams || []).length; } catch (e) { out.errors.push('teams: ' + e.message); }
for (const s of ['2026', '2025', '2024', '2023', '2022']) {
  try {
    const ev = [];
    for (const range of months(Number(s))) {
      for (let k = 0; k < 3; k++) {
        try { const j = await get(`${BASE}/scoreboard?dates=${range}&limit=300`); ev.push(...(j.events || [])); break; }
        catch (e) { if (k === 2) out.errors.push(`${s} ${range}: ${e.message}`); else await new Promise(r => setTimeout(r, 3000)); }
      }
    }
    if (s === '2026' && ev[0]) out.sample = ev.find(e => e.competitions?.[0]?.status?.type?.completed) || ev[0];
    out.seasons[s] = {n: ev.length, matches: ev.map(e => {
      const c = e.competitions?.[0] || {}, side = h => c.competitors?.find(x => x.homeAway === h) || {};
      const h = side('home'), a = side('away');
      return {date: e.date, round: c.type?.abbreviation || c.notes?.[0]?.headline || e.season?.slug || null, status: c.status?.type?.name, detail: c.status?.type?.detail,
        period: c.status?.period, neutral: c.neutralSite ?? null,
        home: h.team?.displayName, homeShort: h.team?.shortDisplayName, away: a.team?.displayName, awayShort: a.team?.shortDisplayName,
        hs: h.score ?? null, as: a.score ?? null, hl: (h.linescores || []).map(x => x.value), al: (a.linescores || []).map(x => x.value),
        hso: h.shootoutScore ?? null, aso: a.shootoutScore ?? null, winner: h.winner ? 'H' : a.winner ? 'A' : null,
        logoH: h.team?.logo || null, logoA: a.team?.logo || null};
    })};
  } catch (e) { out.errors.push(`${s}: ${e.message}`); }
}
mkdirSync('lab/cdr', {recursive: true});
writeFileSync('lab/cdr/probe.json', JSON.stringify(out, null, 1));
console.log(Object.entries(out.seasons).map(([s, v]) => `${s}: ${v.n} matchs`).join(' | '), out.errors);
