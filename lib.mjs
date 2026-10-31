// Outils partagés : dates Paris, noms d'équipes.
export function footballDataDate(utcDate){
 if(!utcDate)return null;
 const d=new Date(utcDate);
 if(Number.isNaN(d.getTime()))return null;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const o={};parts.forEach(x=>o[x.type]=x.value);
 return `${o.year}-${o.month}-${o.day}`;
}
export function canonicalTeam(name){
 const raw=String(name||'').trim();
 const n=raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 const aliases={
  'paris saint germain':'Paris SG','paris saint germain fc':'Paris SG','paris sg':'Paris SG','psg':'Paris SG',
  'olympique de marseille':'Marseille','olympique marseille':'Marseille','marseille':'Marseille',
  'olympique lyonnais':'Lyon','lyon':'Lyon',
  'as monaco':'Monaco','as monaco fc':'Monaco','monaco':'Monaco',
  'lille osc':'Lille','losc lille':'Lille','lille':'Lille',
  'ogc nice':'Nice','nice':'Nice',
  'stade rennais fc':'Rennes','stade rennais':'Rennes','rennes':'Rennes',
  'rc strasbourg alsace':'Strasbourg','rc strasbourg':'Strasbourg','strasbourg':'Strasbourg',
  'toulouse fc':'Toulouse','toulouse':'Toulouse',
  'fc nantes':'Nantes','nantes':'Nantes',
  'aj auxerre':'Auxerre','auxerre':'Auxerre',
  'le havre ac':'Le Havre','le havre':'Le Havre',
  'stade brestois 29':'Brest','stade brestois':'Brest','brest':'Brest',
  'fc lorient':'Lorient','lorient':'Lorient',
  'angers sco':'Angers','angers':'Angers',
  'fc metz':'Metz','metz':'Metz',
  'rc lens':'Lens','lens':'Lens',
  'paris fc':'Paris FC'
 };
 return aliases[n]||raw;
}
function normName(n){return String(n||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function nameTokens(n){
 const stop=new Set(['fc','ac','as','sc','rc','ogc','sco','losc','osc','us','ca','sm','stade','olympique','racing','club','de','du','la','le','les','des','et','saint','st',
  'cf','cfc','sv','vfl','vfb','tsg','fsv','bsc','rcd','ud','cd','sd','ssc','ss','acf','afc','bc','calcio','fk','sk','ssd']);
 return normName(n).split(' ').filter(w=>w.length>=2&&!stop.has(w)&&!/^\d+$/.test(w));
}
const sameTok=(a,b)=>a===b||(a.length>=4&&b.length>=4&&a.slice(0,4)===b.slice(0,4));
// Retrouve le nom utilisé dans l'historique pour un nom donné par l'API. Renvoie null si aucun choix sûr.
export function resolveName(name,known,aliases={},france=false){
 let c=String(name||'').trim();
 if(!c)return null;
 if(france){const f=canonicalTeam(c);if(known.includes(f))return f}
 const n=normName(c);
 for(const key of [n,n.replace(/ (fc|afc|cf|sc|ac|sv)$/,''),n.replace(/^(fc|afc|ac|sc|sv) /,'')]){
  if(aliases[key]&&known.includes(aliases[key]))return aliases[key];
 }
 for(const k of known)if(normName(k)===n)return k;
 const nt=nameTokens(c);
 if(!nt.length)return null;
 const pick=(cands)=>{
  if(!cands.length)return undefined;
  const max=Math.max(...cands.map(x=>x.len));
  const best=cands.filter(x=>x.len===max);
  return best.length===1?best[0].k:null;
 };
 // 1. tous les mots du nom connu apparaissent dans le nom de l'API
 let r=pick(known.map(k=>({k,kt:nameTokens(k)})).filter(x=>x.kt.length&&x.kt.every(b=>nt.some(a=>sameTok(a,b)))).map(x=>({k:x.k,len:x.kt.length})));
 if(r!==undefined)return r;
 // 2. l'inverse : tous les mots du nom de l'API apparaissent dans le nom connu
 r=pick(known.map(k=>({k,kt:nameTokens(k)})).filter(x=>x.kt.length&&nt.every(a=>x.kt.some(b=>sameTok(a,b)))).map(x=>({k:x.k,len:nt.length})));
 return r===undefined?null:r;
}
