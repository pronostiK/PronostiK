// Laboratoire Coupe du Roi : collecte des éditions passées (texte source Wikipédia, anglais et espagnol).
// Les matchs y figurent avec la division de chaque club, ex. « Poblense (5) 1–2 Sabadell (3) ».
// Résultat : lab/cdr/wiki/<langue>-<saison>.txt (+ index.json). Ne touche pas au site.
import {writeFileSync, mkdirSync} from 'node:fs';
const H = {'User-Agent': 'PronostiK-lab/1.0 (https://pronostikapp.fr)'};
mkdirSync('lab/cdr/wiki', {recursive: true});
const idx = {at: new Date().toISOString(), pages: {}};
const SEASONS = ['2021–22', '2022–23', '2023–24', '2024–25', '2025–26', '2026–27'];
const TITLE = {en: s => `${s} Copa del Rey`, es: s => `Copa del Rey ${s.replace('–', '-')}`};
for (const lang of ['en', 'es']) for (const s of SEASONS) {
  const t = TITLE[lang](s), key = `${lang}-${s.replace('–', '-')}`;
  try {
    const r = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(t)}&prop=wikitext&redirects=1&format=json&formatversion=2`, {headers: H, signal: AbortSignal.timeout(30000)});
    const j = await r.json();
    if (!j.parse?.wikitext) throw new Error(j.error?.info || 'vide');
    writeFileSync(`lab/cdr/wiki/${key}.txt`, j.parse.wikitext);
    idx.pages[key] = {title: j.parse.title, len: j.parse.wikitext.length};
  } catch (e) { idx.pages[key] = {title: t, error: String(e.message || e)}; }
  await new Promise(r => setTimeout(r, 500));
}
writeFileSync('lab/cdr/wiki/index.json', JSON.stringify(idx, null, 1));
console.log(idx.pages);
