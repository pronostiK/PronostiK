// Laboratoire équipes nationales : sondage de la source (résultats et matchs à venir). N'a aucune incidence sur le site.
import {writeFileSync, mkdirSync} from 'node:fs';
const OUT = new URL('../lab/nations/', import.meta.url); mkdirSync(OUT, {recursive: true});
const rep = {at: new Date().toISOString()};
for (const [k, u] of [['results', 'https://raw.githubusercontent.com/martj42/international_results/master/results.csv'], ['shootouts', 'https://raw.githubusercontent.com/martj42/international_results/master/shootouts.csv']]) {
  try { const r = await fetch(u, {signal: AbortSignal.timeout(60000)}); const t = r.ok ? await r.text() : ''; rep[k] = {status: r.status, bytes: t.length};
    if (k === 'results' && t) {
      writeFileSync(new URL('results.csv', OUT), t);
      const L = t.trim().split('\n'); rep.header = L[0]; rep.rows = L.length - 1;
      const today = new Date().toISOString().slice(0, 10);
      const fut = L.slice(1).filter(l => l.slice(0, 10) >= today); rep.futurs = fut.length; rep.exemplesFuturs = fut.slice(0, 40);
      rep.derniers = L.slice(1).filter(l => l.slice(0, 10) < today).slice(-15);
    } } catch (e) { rep[k] = {error: String(e.message)}; }
}
writeFileSync(new URL('report.json', OUT), JSON.stringify(rep, null, 1));
console.log(JSON.stringify(rep, null, 1));
