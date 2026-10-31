// Vérifie que le modèle Node donne les mêmes chiffres que la page PronostiK (référence figée).
import {readFileSync} from 'node:fs';
import {createModel, createRatings} from '../model.mjs';
const history=JSON.parse(readFileSync(new URL('../data/history.json',import.meta.url)));
const refs=JSON.parse(readFileSync(new URL('./reference.json',import.meta.url)));
const M=createModel(history);
let bad=0;
for(const r of refs){
  const x=M.getLambdas(r.h,r.a,r.d),p=M.calcProb(x.lamH,x.lamA);
  const d=Math.max(Math.abs(x.lamH-r.lamH),Math.abs(x.lamA-r.lamA),Math.abs(p.h-r.p[0]),Math.abs(p.d-r.p[1]),Math.abs(p.a-r.p[2]));
  if(d>1e-12||p.score!==r.score){bad++;console.log('ÉCART',r.h,r.a,r.d,d)}
}
console.log(bad?`${bad} écart(s)`:`OK : ${refs.length} matchs identiques à la page`);
if(bad)process.exit(1);

// Modèle v2 (force attaque/défense) : mêmes chiffres que le banc d'essai qui a servi à le choisir.
const refs2 = JSON.parse(readFileSync(new URL('./reference-ratings.json', import.meta.url)));
const R = createRatings(history);
let bad2 = 0;
for (const r of refs2) {
  const x = R.predict(r.h, r.a, r.d);
  const d = x ? Math.max(...r.p.map((v, i) => Math.abs(v - x.p[i]))) : 1;
  if (d > 1e-9) { bad2++; console.log('ÉCART v2', r.h, r.a, r.d, d); }
}
console.log(bad2 ? `${bad2} écart(s) v2` : `OK : ${refs2.length} matchs identiques au banc d'essai (modèle v2)`);
if (bad2) process.exit(1);
