// Laboratoire Coupe du Roi, étape 2 :
// 1. résultats Liga (SP1) et 2e division (SP2) depuis 2016-17 (football-data.co.uk) → lab/cdr/csv/
// 2. logos de tous les clubs vus en Coupe du Roi (image principale de leur page Wikipédia) → lab/cdr/logos.json
// Ne touche pas au site.
import {writeFileSync, mkdirSync, readFileSync} from 'node:fs';
const H = {'User-Agent': 'PronostiK-lab/1.0 (https://pronostikapp.fr)'};
mkdirSync('lab/cdr/csv', {recursive: true});
const got = {};
for (let y = 2016; y <= 2026; y++) for (const d of ['SP1', 'SP2']) {
  const code = `${String(y).slice(2)}${String(y + 1).slice(2)}`;
  try { const r = await fetch(`https://www.football-data.co.uk/mmz4281/${code}/${d}.csv`, {signal: AbortSignal.timeout(30000)}); if (!r.ok) throw new Error('HTTP ' + r.status);
    const t = await r.text(); writeFileSync(`lab/cdr/csv/${d}-${code}.csv`, t); got[`${d}-${code}`] = t.split('\n').length; } catch (e) { got[`${d}-${code}`] = String(e.message); }
}
console.log(got);
// Logos
const M = JSON.parse(readFileSync('lab/cdr/matches.json', 'utf8'));
const titles = [...new Set(M.flatMap(m => [m.home, m.away]))];
const logos = {};
for (let i = 0; i < titles.length; i += 50) {
  const batch = titles.slice(i, i + 50);
  try {
    const u = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail|name&pithumbsize=200&pilicense=any&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(batch.join('|'))}`;
    const j = await (await fetch(u, {headers: H, signal: AbortSignal.timeout(30000)})).json();
    const back = {}; for (const r of j.query?.redirects || []) back[r.to] = r.from; for (const r of j.query?.normalized || []) back[r.to] = back[r.to] || r.from;
    for (const p of j.query?.pages || []) { const orig = back[p.title] || p.title; logos[orig] = p.thumbnail?.source ? {url: p.thumbnail.source, file: p.pageimage} : null; }
  } catch (e) { console.error('logos', e.message); }
  await new Promise(r => setTimeout(r, 300));
}
writeFileSync('lab/cdr/logos.json', JSON.stringify(logos, null, 1));
console.log('logos', Object.values(logos).filter(Boolean).length, '/', titles.length);
