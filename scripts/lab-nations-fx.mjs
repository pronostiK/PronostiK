// Laboratoire équipes nationales : structure de l'API UEFA (matchs joués et à venir de la Ligue des nations).
import {writeFileSync} from 'node:fs';
const rep = {};
const get = async u => { const r = await fetch(u, {signal: AbortSignal.timeout(30000), headers: {'User-Agent': 'Mozilla/5.0'}}); return {s: r.status, j: r.ok ? await r.json() : null}; };
const a = await get('https://match.uefa.com/v5/matches?competitionId=2014&seasonYear=2027&fromDate=2026-10-01&toDate=2026-10-20&limit=5&offset=0&order=ASC');
rep.finishedStatus = a.s; rep.finishedSample = a.j && a.j[0];
const b = await get('https://match.uefa.com/v5/matches?competitionId=2014&seasonYear=2027&fromDate=2026-11-09&toDate=2026-11-20&limit=100&offset=0&order=ASC');
rep.upcomingStatus = b.s; rep.upcomingN = b.j && b.j.length; rep.upcomingSample = b.j && b.j[0];
rep.upcomingList = (b.j || []).map(m => [m.kickOffTime?.dateTime, m.homeTeam?.internationalName, m.awayTeam?.internationalName, m.round?.metaData?.name || m.round?.phase, m.group?.metaData?.groupName || null]);
writeFileSync(new URL('../lab/nations/uefa-report.json', import.meta.url), JSON.stringify(rep, null, 1));
console.log(rep.finishedStatus, rep.upcomingStatus, rep.upcomingN);
