// Modèle de PronostiK : Poisson (historique par terrain 80 % + forme récente 20 %).
// Copie fidèle du moteur de la page PronostiK v2. Ne pas modifier sans relancer tests/check-model.mjs.
export function createModel(matches){
function beforeDate(date){return matches.filter(m=>m.date<date)}
function mean(arr,k){return arr.length?arr.reduce((s,m)=>s+m[k],0)/arr.length:0}
function poisson(k,lam){let p=Math.exp(-lam);for(let i=1;i<=k;i++)p*=lam/i;return p}
function getLambdas(home,away,asOf,crossCoeff=0.72){
 const data=beforeDate(asOf);
 const latestDivision=team=>{
   const prior=data.filter(m=>(m.home===team||m.away===team)).sort((a,b)=>b.date.localeCompare(a.date));
   return prior[0]?.division||'L1';
 };
 const divH=latestDivision(home), divA=latestDivision(away);
 const targetDivision='L1';
 const leagueData=div=>data.filter(m=>(m.division||'L1')===div);
 const avg=(arr,k)=>arr.length?mean(arr,k):0;
 const baseline=div=>{
   const rows=leagueData(div);
   return {h:avg(rows,'hg')||1.45,a:avg(rows,'ag')||1.15,overall:((avg(rows,'hg')||1.45)+(avg(rows,'ag')||1.15))/2};
 };
 const b1=baseline('L1'), bh=baseline(divH), ba=baseline(divA);
 const teamVenue=(team,venue,div)=>data.filter(m=>venue==='home'?m.home===team:m.away===team).slice(-10);
 const homeMatches=teamVenue(home,'home',divH), awayMatches=teamVenue(away,'away',divA);
 const homeAll=data.filter(m=>(m.home===home||m.away===home)).slice(-5);
 const awayAll=data.filter(m=>(m.home===away||m.away===away)).slice(-5);
 if(homeMatches.length<5||awayMatches.length<5||homeAll.length<3||awayAll.length<3)
   throw new Error(`Historique insuffisant. ${home} : ${homeMatches.length}/10 matchs à domicile ; ${away} : ${awayMatches.length}/10 à l'extérieur.`);
 const shrink=(ratio,div)=>div===targetDivision?ratio:1+crossCoeff*(ratio-1);
 // Normalize venue matches from a previous division to the team's latest division.
 // The original rows remain unchanged for the visible history; only calculation copies are scaled.
 const normalizeVenue=(rows,targetDiv)=>rows.map(m=>{
   const src=m.division||'L1'; const bs=baseline(src), bt=baseline(targetDiv);
   const cross=src!==targetDiv;
   return {...m,calcHg:cross?m.hg*bt.h/Math.max(bs.h,.1):m.hg,calcAg:cross?m.ag*bt.a/Math.max(bs.a,.1):m.ag,calcWeight:cross?crossCoeff:1};
 });
 const weightedMean=(rows,k)=>rows.length?rows.reduce((sum,m)=>sum+m[k]*m.calcWeight,0)/rows.reduce((sum,m)=>sum+m.calcWeight,0):0;
 const homeCalc=normalizeVenue(homeMatches,divH), awayCalc=normalizeVenue(awayMatches,divA);
 const hGF=weightedMean(homeCalc,'calcHg'),hGA=weightedMean(homeCalc,'calcAg'),aGF=weightedMean(awayCalc,'calcAg'),aGA=weightedMean(awayCalc,'calcHg');
 const homeAttack=shrink(hGF/Math.max(bh.h,.1),divH);
 const homeDefence=shrink(hGA/Math.max(bh.a,.1),divH);
 const awayAttack=shrink(aGF/Math.max(ba.a,.1),divA);
 const awayDefence=shrink(aGA/Math.max(ba.h,.1),divA);
 const histH=b1.h*homeAttack*awayDefence;
 const histA=b1.a*awayAttack*homeDefence;
 const normalizeRecent=(rows,targetDiv,team)=>rows.map(m=>{
   const src=m.division||'L1'; const bs=baseline(src), bt=baseline(targetDiv); const cross=src!==targetDiv;
   const hg=cross?m.hg*bt.h/Math.max(bs.h,.1):m.hg, ag=cross?m.ag*bt.a/Math.max(bs.a,.1):m.ag;
   const gf=m.home===team?hg:ag, ga=m.home===team?ag:hg;
   return {gf,ga,w:cross?crossCoeff:1};
 });
 const weightedRecent=(rows,k)=>rows.length?rows.reduce((sum,m)=>sum+m[k]*m.w,0)/rows.reduce((sum,m)=>sum+m.w,0):0;
 const hRecent=normalizeRecent(homeAll,divH,home), aRecent=normalizeRecent(awayAll,divA,away);
 const hRecentGF=weightedRecent(hRecent,'gf'),hRecentGA=weightedRecent(hRecent,'ga');
 const aRecentGF=weightedRecent(aRecent,'gf'),aRecentGA=weightedRecent(aRecent,'ga');
 const formH=b1.h*shrink(hRecentGF/Math.max(bh.overall,.1),divH)*shrink(aRecentGA/Math.max(ba.overall,.1),divA);
 const formA=b1.a*shrink(aRecentGF/Math.max(ba.overall,.1),divA)*shrink(hRecentGA/Math.max(bh.overall,.1),divH);
 const lamH=Math.max(.08,.8*histH+.2*formH),lamA=Math.max(.08,.8*histA+.2*formA);
 return {lamH,lamA,histH,histA,formH,formA,muH:b1.h,muA:b1.a,homeMatches,awayMatches,homeAll,awayAll,dataCount:data.length,homeDivision:divH,awayDivision:divA,
   homeFormW:homeAll.filter(m=>(m.home===home?m.hg:m.ag)>(m.home===home?m.ag:m.hg)).length,
   awayFormW:awayAll.filter(m=>(m.away===away?m.ag:m.hg)>(m.away===away?m.hg:m.ag)).length};
}
function calcProb(lh,la){
 let ph=[],pa=[];for(let i=0;i<=12;i++){ph[i]=poisson(i,lh);pa[i]=poisson(i,la)}
 let h=0,d=0,a=0;for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){let p=ph[i]*pa[j];if(i>j)h+=p;else if(i===j)d+=p;else a+=p}
 const sum=h+d+a;return {h:h/sum,d:d/sum,a:a/sum,score:bestScore(lh,la),grid:{ph,pa}}
}
function bestScore(lh,la){let best={s:'0–0',p:-1};for(let h=0;h<=6;h++)for(let a=0;a<=6;a++){let p=poisson(h,lh)*poisson(a,la);if(p>best.p)best={s:`${h}–${a}`,p}}return best.s}
return {getLambdas,calcProb,poisson,mean};
}

// ---------------------------------------------------------------------------------------------
// Modèle v2 : force d'attaque et de défense de chaque équipe, estimée sur ~18 mois de matchs de
// première division, avec poids décroissant dans le temps, avantage du terrain et prudence pour
// les équipes qui ont peu joué. Réglage choisi sur la saison 2024-25 de Ligue 1, puis vérifié sur
// la période suivante (voir README). Renvoie null quand une équipe n'a pas assez de matchs.
// ---------------------------------------------------------------------------------------------
export const RATINGS_DEFAULTS = {span: 550, half: 365, k: 8, minW: 3};

export function createRatings(allMatches, opts = {}) {
  const P = {...RATINGS_DEFAULTS, ...opts};
  const DAY = 86400000, t = d => Date.parse(d + 'T00:00:00Z');
  const top = allMatches.filter(m => (m.division || 'L1') === 'L1').sort((a, b) => a.date.localeCompare(b.date));
  const cache = new Map();

  function fit(date) {
    const D = t(date), rows = top.filter(m => m.date < date && D - t(m.date) <= P.span * DAY);
    if (!rows.length) return null;
    const w = rows.map(m => Math.pow(0.5, (D - t(m.date)) / DAY / P.half));
    const teams = [...new Set(rows.flatMap(m => [m.home, m.away]))];
    const a = Object.fromEntries(teams.map(x => [x, 1])), b = {...a};
    const tw = Object.fromEntries(teams.map(x => [x, 0]));
    rows.forEach((m, i) => { tw[m.home] += w[i]; tw[m.away] += w[i]; });
    let c = 1.3, h = 1.25;
    for (let it = 0; it < 40; it++) {
      const num = {}, den = {}, nb = {}, db = {};
      teams.forEach(x => { num[x] = P.k * c; den[x] = P.k * c; nb[x] = P.k * c; db[x] = P.k * c; });
      rows.forEach((m, i) => {
        const x = m.home, y = m.away, W = w[i];
        num[x] += W * m.hg; den[x] += W * c * h * b[y];
        num[y] += W * m.ag; den[y] += W * c * a[x];
        nb[y] += W * m.hg; db[y] += W * c * h * a[x];
        nb[x] += W * m.ag; db[x] += W * c * a[y];
      });
      teams.forEach(x => { a[x] = num[x] / den[x]; b[x] = nb[x] / db[x]; });
      const ma = teams.reduce((s, x) => s + a[x], 0) / teams.length, mb = teams.reduce((s, x) => s + b[x], 0) / teams.length;
      teams.forEach(x => { a[x] /= ma; b[x] /= mb; });
      let eh = 0, ea = 0, gh = 0, ga = 0;
      rows.forEach((m, i) => { eh += w[i] * a[m.home] * b[m.away]; ea += w[i] * a[m.away] * b[m.home]; gh += w[i] * m.hg; ga += w[i] * m.ag; });
      c = ga / ea; h = (gh / eh) / c;
    }
    return {a, b, c, h, n: tw};
  }
  const pois = (k, l) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };

  function predict(home, away, date) {
    if (!cache.has(date)) cache.set(date, fit(date));
    const f = cache.get(date); if (!f) return null;
    if ((f.n[home] || 0) < P.minW || (f.n[away] || 0) < P.minW) return null;
    const lamH = f.c * f.h * f.a[home] * f.b[away], lamA = f.c * f.a[away] * f.b[home];
    let H = 0, Dr = 0, A = 0, best = {s: '0–0', p: -1};
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
      const p = pois(i, lamH) * pois(j, lamA);
      if (i > j) H += p; else if (i === j) Dr += p; else A += p;
      if (i <= 6 && j <= 6 && p > best.p) best = {s: `${i}–${j}`, p};
    }
    const s = H + Dr + A;
    return {lamH, lamA, p: [H / s, Dr / s, A / s], score: best.s};
  }
  return {predict};
}

// ---------------------------------------------------------------------------------------------------------------
// Hybride Elo + v2 (« en coulisse ») : calculé et suivi, PAS publié. Réglages figés issus de l'étude Elo
// (branche experience-elo, lab/RAPPORT-ELO.md : réglage sur 2024-25, test 2025-08 → 2026-10).
export const ELO_PARAMS = {K: 20, H: 80, reg: 1, ord: {b: 0.5300431619279119, t1: -0.37603656229315574, t2: 0.8128742251704589},
  pool: {wV2: 0.7511677930724845, wElo: 0.3991237434408407, bDom: -0.06568771090046427, bNul: 0.09069661636795369}};

// Notes Elo d'un championnat (matchs de 1re division). predict(home, away, date) n'utilise que les matchs des jours précédents.
export function createElo(allMatches, P = ELO_PARAMS) {
  const top = allMatches.filter(m => (m.division || 'L1') === 'L1').sort((a, b) => a.date.localeCompare(b.date) || a.home.localeCompare(b.home));
  const G = gd => gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const sig = z => 1 / (1 + Math.exp(-z));
  const cache = new Map();
  const seasonOf = d => +d.slice(5, 7) >= 8 ? d.slice(0, 4) : String(+d.slice(0, 4) - 1);
  const addTeam = (r, t) => { if (!r.has(t)) { const v = [...r.values()].sort((a, b) => a - b); r.set(t, v.length >= 3 ? avg(v.slice(0, 3)) : 1500); } };
  function ratingsBefore(date) {
    if (cache.has(date)) return cache.get(date);
    const r = new Map(); let season = null, i = 0;
    while (i < top.length && top[i].date < date) {
      const d = top[i].date, ms = [];
      while (i < top.length && top[i].date === d) ms.push(top[i++]);
      const se = seasonOf(d);
      if (season !== null && se !== season && r.size) { const mu = avg([...r.values()]); for (const [t, v] of r) r.set(t, mu + P.reg * (v - mu)); }
      season = se;
      for (const m of ms) { addTeam(r, m.home); addTeam(r, m.away); }
      for (const m of ms) {
        const x = r.get(m.home) + P.H - r.get(m.away), E = 1 / (1 + 10 ** (-x / 400)), S = m.hg > m.ag ? 1 : m.hg === m.ag ? 0.5 : 0, k = P.K * G(Math.abs(m.hg - m.ag));
        r.set(m.home, r.get(m.home) + k * (S - E)); r.set(m.away, r.get(m.away) - k * (S - E));
      }
    }
    const out = {r, season}; cache.set(date, out); return out;
  }
  function predict(home, away, date) {
    const base = ratingsBefore(date), r = new Map(base.r);
    if (!r.size) return null;
    const se = seasonOf(date);
    if (base.season !== null && se !== base.season) { const mu = avg([...r.values()]); for (const [t, v] of r) r.set(t, mu + P.reg * (v - mu)); }
    addTeam(r, home); addTeam(r, away);
    const x = (r.get(home) + P.H - r.get(away)) / 100, q = P.ord;
    const pA = sig(q.t1 - q.b * x), pAD = sig(q.t2 - q.b * x);
    return {p: [1 - pAD, Math.max(1e-9, pAD - pA), pA], diff: x * 100};
  }
  return {predict};
}

// Mélange log-linéaire v2 + Elo (réglé sur 2024-25).
export function hybridProbs(pV2, pElo, P = ELO_PARAMS) {
  const w = P.pool, z = [0, 1, 2].map(k => w.wV2 * Math.log(Math.max(1e-9, pV2[k])) + w.wElo * Math.log(Math.max(1e-9, pElo[k])) + (k === 0 ? w.bDom : 0) + (k === 1 ? w.bNul : 0));
  const mx = Math.max(...z), e = z.map(v => Math.exp(v - mx)), s = e[0] + e[1] + e[2];
  return e.map(v => v / s);
}

// ---------------------------------------------------------------------------------------------------------------
// Autres marchés, déduits des buts attendus du modèle v2 (lab/markets-result.json, scripts/lab-markets.mjs).
// +/-1,5 et +/-2,5 buts : recalibrés (réglage figé sur la saison 2024-25). Mi-temps : 45 % des buts en 1re période
// (mesuré : 44,9 %). Les deux équipes marquent : non publié (pas plus précis que la moyenne).
export const MARKET_CAL = {o15: {a: 0.5093776584766343, b: 0.6323983533121632}, o25: {a: 0.03789198446053596, b: 0.7503451433469969}};
export function marketsFromLambdas(lamH, lamA) {
  const pois = (k, l) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
  const lg = p => Math.log(Math.min(1 - 1e-6, Math.max(1e-6, p)) / (1 - Math.min(1 - 1e-6, Math.max(1e-6, p))));
  const cal = (p, c) => 1 / (1 + Math.exp(-(c.a + c.b * lg(p))));
  let o15 = 0, o25 = 0; const sc = [];
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const p = pois(i, lamH) * pois(j, lamA); if (i + j > 1) o15 += p; if (i + j > 2) o25 += p; if (i <= 6 && j <= 6) sc.push([`${i}-${j}`, p]); }
  const ht = [0, 0, 0];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { const p = pois(i, lamH * 0.45) * pois(j, lamA * 0.45); ht[i > j ? 0 : i === j ? 1 : 2] += p; }
  const hs = ht[0] + ht[1] + ht[2];
  return {o15: cal(o15, MARKET_CAL.o15), o25: cal(o25, MARKET_CAL.o25), ht: ht.map(v => v / hs), scores: sc.sort((a, b) => b[1] - a[1]).slice(0, 3)};
}
