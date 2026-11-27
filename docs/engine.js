/* Investment Desk — calculation engine.
   Pure functions: no page, no network. The web page and the GitHub job (scripts/signals.mjs) both run this exact file,
   so a locked signal is issued on the same numbers the page shows.
   makeEngine({R: research data, live: data/desk.json or null, signals: data/signals.json or null, now: Date}) */
globalThis.makeEngine=function makeEngine({R,live=null,signals=null,now=new Date()}){
const NOW=new Date(now.getTime());
R=JSON.parse(JSON.stringify(R));
const DAY=864e5,MIN=6e4;
const ok=v=>typeof v==='number'&&isFinite(v),pos=v=>ok(v)&&v>0,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const calDays=(a,b)=>(b-a)/DAY;
const noon=d=>new Date(d+'T12:00:00Z');
const fmtD=d=>noon(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
const fmtDY=d=>noon(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const hhmm=t=>t?new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kuala_Lumpur'})+' MYT':'';
const whenMYT=t=>t?new Date(t).toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kuala_Lumpur'})+' MYT':'';
const addDays=(d,n)=>new Date(noon(d).getTime()+n*DAY).toISOString().slice(0,10);

/* ================= MARKET CALENDARS ================= */
// US daylight saving: 2nd Sunday of March 07:00Z (2am EST) to 1st Sunday of November 06:00Z (2am EDT)
function nthSunday(y,mo,n){const d=new Date(Date.UTC(y,mo,1));const first=(7-d.getUTCDay())%7+1;return first+7*(n-1)}
function usDST(t){const y=t.getUTCFullYear();const a=Date.UTC(y,2,nthSunday(y,2,2),7),b=Date.UTC(y,10,nthSunday(y,10,1),6);return t.getTime()>=a&&t.getTime()<b}
const offH=(m,t)=>m==='MY'?8:(usDST(t)?-4:-5);
const localDay=(m,t=NOW)=>new Date(t.getTime()+offH(m,t)*36e5).toISOString().slice(0,10);
const at=(day,m,h,mi=0)=>{const guess=new Date(Date.UTC(+day.slice(0,4),+day.slice(5,7)-1,+day.slice(8,10),h,mi));return new Date(guess.getTime()-offH(m,new Date(guess.getTime()+5*36e5))*36e5)};
const HOL=R.HOL||{US:{closed:[],early:[]},MY:{closed:[]}};
const isTradingDay=(day,m)=>{const w=noon(day).getUTCDay();return w!==0&&w!==6&&!(HOL[m].closed||[]).includes(day)};
function sessions(day,m){if(!isTradingDay(day,m))return [];
 if(m==='MY')return [[at(day,m,9),at(day,m,12,30)],[at(day,m,14,30),at(day,m,17)]];
 return [[at(day,m,9,30),at(day,m,(HOL.US.early||[]).includes(day)?13:16)]]}
const closeTs=(day,m)=>{const s=sessions(day,m);return s.length?s.at(-1)[1]:at(day,m,m==='MY'?17:16)};
const marketOpen=(m,t=NOW)=>sessions(localDay(m,t),m).some(([a,b])=>t>=a&&t<b);
function lastClosedDay(m,t=NOW){let d=localDay(m,t);for(let i=0;i<15;i++){if(isTradingDay(d,m)&&closeTs(d,m)<=t)return d;d=addDays(d,-1)}return null}
// expected time of the newest price: now while the market is open, else the end of the most recent session that has started
function expectedLatest(m,t=NOW){let d=localDay(m,t);for(let i=0;i<15;i++){const s=sessions(d,m);for(let k=s.length-1;k>=0;k--){if(t>=s[k][0])return t<s[k][1]?t:s[k][1]}d=addDays(d,-1)}return null}
// closing sessions that ended after `since` and on or after `fromDay`, up to now
function closesSince(since,fromDay,m){let n=0,d=fromDay;const end=localDay(m);for(let i=0;i<90&&d<=end;i++){if(isTradingDay(d,m)){const c=closeTs(d,m);if(c>since&&c<=NOW)n++}d=addDays(d,1)}return n}
function tradingDaysBetween(a,b,m){let n=0,d=a;for(let i=0;i<400&&d<b;i++){d=addDays(d,1);if(isTradingDay(d,m)&&d<=b)n++}return n}

/* ================= MERGE LIVE DATA ================= */
const IDX=R.IDX,RIN=R.RIN,CH=R.CH,N=R.N,FLAGS=R.FLAGS||{},STRAT=R.STRAT,COMP=R.COMP;
const H={};for(const k in R.H)H[k]=R.H[k].split(' ').map(v=>v===''?null:+v); // newest first
const S=R.S.map(x=>Object.assign({},x,{tv:x.m==='US'?(x.ex==='NYSE'?'NYSE':'NASDAQ')+':'+x.t:null,researched:(x.cat||[]).length>0||(x.rk||[]).length>0,asOf:closeTs(x.d,x.m),intraday:false,valSrc:'research'}));
let FX=(IDX.find(i=>i.k==='USD/MYR')||{}).v||4.1;
const yURL=y=>'https://finance.yahoo.com/quote/'+encodeURIComponent(y);
const fmtMc=(v,c)=>!ok(v)?'n/a':(c==='MYR'?'RM':'$')+(v>=1e12?(v/1e12).toFixed(2)+'T':v>=1e9?(v/1e9).toFixed(1)+'B':(v/1e6).toFixed(0)+'M');
const num=v=>ok(v)?v:null,posn=v=>pos(v)?v:null;
if(live&&Array.isArray(live.stocks)){
 for(const r of live.stocks){if(!r||!pos(r.p)||!r.t||!r.d)continue;let x=S.find(s=>s.t===r.t);
  if(!x){x={t:r.t,n:r.n||r.t,ex:r.m==='MY'?'Bursa':(r.ex==='NMS'?'NASDAQ':r.ex||''),m:r.m,sec:r.sec||'',cur:r.cur||(r.m==='MY'?'MYR':'USD'),cat:[],rk:[],researched:false,fd:null,pe:null,fpe:null,tgt:null,na:null,an:null,dps:null,s2:false};S.push(x)}
  x.live=true;x.tv=r.tv||x.tv;x.y=r.y;x.p=r.p;x.ch=num(r.ch);x.d=r.d;x.s2=false;x.ps='Yahoo Finance (auto-update)';x.pu=yURL(r.y||r.t);
  const mk=live.mkUpdated&&live.mkUpdated[r.m];
  x.asOf=r.asOf?new Date(r.asOf):new Date(mk||live.updated||closeTs(r.d,r.m));
  x.intraday=typeof r.intraday==='boolean'?r.intraday:x.asOf<closeTs(r.d,r.m);
  x.stale=!!r.stale;
  const yh={pe:posn(r.pe),fpe:posn(r.fpe),tgt:posn(r.tgt),na:pos(r.na)?r.na:null,an:r.an&&!/^none$/i.test(r.an)?r.an:null,dps:num(r.dps)};
  x.yahoo=yh;
  const resFresh=x.researched&&x.fd&&calDays(noon(x.fd),NOW)<=30;
  if(!resFresh){
   if(x.researched&&pos(x.fpe)&&pos(x.pRef)&&yh.fpe){const resNow=x.fpe*x.p/x.pRef;
    if(Math.abs(yh.fpe/resNow-1)>.25)x.disagree={what:'forward P/E',res:resNow,resD:x.fd,yahoo:yh.fpe,used:Math.max(resNow,yh.fpe)}}
   if(yh.fpe||yh.pe||!x.researched){x.pRef=x.p;x.pe=yh.pe;x.fpe=x.disagree?x.disagree.used:yh.fpe;x.fd=null;x.valSrc='Yahoo';x.fu=yURL(r.y||r.t)}
   if(yh.tgt||!x.researched){x.tgt=yh.tgt;x.na=yh.na;x.an=yh.an;x.tgtSrc='Yahoo'}
   if(yh.dps!==null||!x.researched)x.dps=yh.dps}
  if(pos(r.lo)&&pos(r.hi)&&r.hi>=r.lo){x.lo=Math.min(r.lo,r.p);x.hi=Math.max(r.hi,r.p);x.rangeSrc='Yahoo'}
  if(ok(r.mc))x.mc=fmtMc(r.mc,x.cur);
  if(Array.isArray(r.hist)&&r.hist.length>=2)H[r.t]=r.hist.map(v=>ok(v)?v:null);
  if(!x.mc)x.mc='n/a'}
 const I=live.idx||{};
 IDX.forEach(i=>{const v=I[i.k];if(!v||!ok(v.v))return;i.live=true;i.stale=!!v.stale;i.dRaw=v.d;
  if(i.t!==undefined){i.t=i.k==='Brent crude'?'$'+v.v.toFixed(2):v.v.toFixed(2)+'%';i.s=`${fmtD(v.d)} · ${v.c>=0?'+':''}${(v.c||0).toFixed(2)}%`}
  else{i.v=v.v;i.c=v.c;i.d=fmtD(v.d);delete i.x}
  i.u='https://finance.yahoo.com/'});
 if(I['USD/MYR'])FX=I['USD/MYR'].v;
 if(I.VIX)RIN.vix=I.VIX.v;
 if(I['Nasdaq Comp.']){RIN.ndq=I['Nasdaq Comp.'].v;if(RIN.ndq>RIN.ndqPeak){RIN.ndqPeak=RIN.ndq;RIN.ndqPeakD=fmtD(I['Nasdaq Comp.'].d)}}
 if(I['FBM KLCI'])RIN.klci=I['FBM KLCI'].v;
 const SR=live.series||{},us=['Nasdaq Comp.','S&P 500','Dow Jones','Russell 2000'];
 if(us.every(k=>Array.isArray(SR[k])&&SR[k].length>=5)){
  const common=SR['S&P 500'].map(a=>a[0]).filter(d=>us.every(k=>SR[k].some(a=>a[0]===d)));const x5=common.slice(-5);
  if(x5.length>=3)CH.us={...CH.us,t:`US indices, last ${x5.length} trading sessions (first day = 100)`,x:x5,s:us.map(k=>({n:k.replace(' Comp.','').replace('Dow Jones','Dow'),v:x5.map(d=>SR[k].find(a=>a[0]===d)[1])})),note:'Only days with a close for all four indices are plotted. Daily closes from Yahoo Finance (auto-update).'}}
 if(Array.isArray(SR['FBM KLCI'])&&SR['FBM KLCI'].length>=5){const a=SR['FBM KLCI'].slice(-20);CH.klci={...CH.klci,x:a.map(b=>b[0]),s:[{n:'KLCI',v:a.map(b=>b[1])}],t:`FBM KLCI, last ${a.length} trading days`,note:'Daily closes from Yahoo Finance (auto-update), spaced by calendar date.'};
  const ref=SR['FBM KLCI'].at(-16);if(ref){RIN.klciRef=ref[1];RIN.klciRefD=fmtD(ref[0])}}
 if(Array.isArray(SR.VIX)&&SR.VIX.length>=5){const a=SR.VIX.slice(-20);CH.vix={...CH.vix,x:a.map(b=>b[0]),s:[{n:'VIX',v:a.map(b=>b[1])}],note:'Daily closes from Yahoo Finance (auto-update), spaced by calendar date. Above 20 is elevated.'};
  const mx=a.reduce((m,b)=>b[1]>m[1]?b:m,a[0]);RIN.vixPeak={v:mx[1],d:fmtD(mx[0])}}
}
const SERIES=(live&&live.series)||{};

/* ================= PRICE AGE ================= */
// kind: intraday (market still open on that day), partial (fetched before a close that has now passed), close, stale
function ageInfo(x){
 const c=closeTs(x.d,x.m),partial=!!x.intraday&&NOW>=c;
 const missed=closesSince(partial?c:x.asOf,addDays(x.d,partial?1:0),x.m)+0;
 let kind=x.intraday&&!partial?'intraday':partial?'partial':'close';if(missed>0&&kind!=='partial')kind='stale';
 return {kind,missed,partial,asOf:x.asOf}}

/* ================= MARKET BREADTH (from the tracked stocks) ================= */
function breadth(m){const day=lastClosedDay(m)&&marketOpen(m)?localDay(m):lastClosedDay(m);
 const xs=S.filter(x=>x.m===m&&x.live&&x.d===day&&ok(x.ch)&&!x.stale);const up=xs.filter(x=>x.ch>0).length,dn=xs.filter(x=>x.ch<0).length;
 return {day,n:xs.length,up,dn,flat:xs.length-up-dn,ok:xs.length>=15}}

/* ================= MOODS ================= */
const BR=breadth('MY');
const resBrFresh=calDays(new Date(R.BUILT),NOW)<=3;
function usMood(){const dd=1-RIN.ndq/RIN.ndqPeak,v=RIN.vix;let val,term,dot='var(--dn)';
 if(dd>=.20){val='Falling hard';term='a bear market (20%+ off the high)'}
 else if(dd>=.10&&v>=25){val='Choppy and falling';term='a high-volatility correction'}
 else if(dd>=.10){val='Falling';term='a correction (10–20% off the high)'}
 else if(v>=25){val='Choppy';term='a high-volatility market';dot='var(--warn)'}
 else if(dd<.05&&v<20){val='Calm and rising';term='a low-volatility uptrend';dot='var(--up)'}
 else{val='Mixed';term='a mixed market';dot='var(--brown)'}
 return {dd,v,val,term,dot,hv:v>=25,rule:`Rule: VIX ${v.toFixed(2)} (25+ = high volatility) and Nasdaq ${(dd*100).toFixed(1)}% below its ${RIN.ndqPeakD} record of ${RIN.ndqPeak.toLocaleString('en-US')} (10–20% = correction, 20%+ = bear market).`}}
function myMood(){const chg=RIN.klci/RIN.klciRef-1;
 let br=null,brTxt;
 if(BR.ok&&BR.up>0){br=BR.dn/BR.up;brTxt=`${BR.dn} of the ${BR.n} tracked Bursa stocks fell and ${BR.up} rose on ${fmtD(BR.day)}`}
 else if(BR.ok){br=BR.dn>0?9:1;brTxt=`${BR.dn} of the ${BR.n} tracked Bursa stocks fell and none rose on ${fmtD(BR.day)}`}
 else if(resBrFresh){br=RIN.losers/RIN.gainers;brTxt=`${RIN.losers} Bursa stocks fell and ${RIN.gainers} rose (whole market, research note ${fmtD(R.BUILT.slice(0,10))})`}
 let val,term,dot='var(--brown)';
 if(chg<=-.10){val='Falling';term='a falling market';dot='var(--dn)'}
 else if(chg>=.05){val='Rising';term='a rising market';dot='var(--up)'}
 else if(br!==null&&br>=1.3){val='Flat, but most stocks slipping';term='sideways with weak breadth'}
 else if(br!==null&&br<=.77){val='Flat, but most stocks rising';term='sideways with strong breadth';dot='var(--up)'}
 else{val='Flat and steady';term='a sideways market'}
 return {chg,br,brTxt,val,term,dot,rule:`Rule: KLCI ${(chg*100).toFixed(1)}% since ${RIN.klciRefD} (within ±5% = flat)${br!==null?` and ${br.toFixed(2)} falling stocks per rising stock (1.3+ = weak breadth, 0.77 or less = strong)`:'; breadth not available'}.`}}
const US=usMood(),MY=myMood();
// biggest daily index moves over the last 10 sessions, from the live series
function swings(k){const a=SERIES[k];if(!Array.isArray(a)||a.length<3)return null;const b=a.slice(-11);let up=null,dn=null;
 for(let i=1;i<b.length;i++){const c=b[i][1]/b[i-1][1]-1;if(!up||c>up.c)up={c,d:b[i][0]};if(!dn||c<dn.c)dn={c,d:b[i][0]}}return {up,dn}}
const USX={
 'Falling hard':{mean:'The big US indexes are more than 20% below their record high. That is called a “bear market”.',ana:'Like a long, steep downhill: wait for signs that the road is levelling out before speeding up.',head:'US stocks are in a bear market'},
 'Choppy and falling':{mean:'Prices are swinging hard from day to day, and the big US indexes are 10–20% below their recent highs. A drop of 10–20% is called a “correction”.',ana:'Think of driving downhill on a bumpy road: you can still get where you’re going, but it’s riskier, so you slow down.',head:'US stocks swing lower in a high-volatility correction'},
 'Falling':{mean:'The big US indexes are 10–20% below their highs (a “correction”), but daily swings are moderate.',ana:'A smooth downhill road: comfortable, but still going down.',head:'US stocks are in a correction'},
 'Choppy':{mean:'The indexes are close to their highs, but prices swing hard from day to day.',ana:'A bumpy road on flat ground: you aren’t losing height, but the ride is rough.',head:'US stocks hold near their highs but swing hard'},
 'Calm and rising':{mean:'The indexes are close to their highs and daily swings are small.',ana:'A smooth highway: easy driving, but calm can change quickly, so keep your seatbelt on.',head:'US stocks are calm and near their highs'},
 'Mixed':{mean:'The US market is neither clearly rising nor clearly falling: a little below its highs, with normal day-to-day swings.',ana:'Stop-start traffic: you move, but not in a straight line.',head:'US stocks are mixed'}};
const MYX={
 'Falling':{mean:'The KLCI (Malaysia’s top 30 companies) is more than 10% below its level of three weeks ago.',ana:'Like a class average dropping sharply: most of the top students did badly.',head:'the KLCI is falling'},
 'Rising':{mean:'The KLCI (Malaysia’s top 30 companies) is more than 5% above its level of three weeks ago.',ana:'Like a class average jumping: the top students did well.',head:'the KLCI is rising'},
 'Flat, but most stocks slipping':{mean:'The KLCI (Malaysia’s top 30 companies) has barely moved, but more stocks are falling than rising.',ana:'It’s like a class average staying the same because the top students did well, while most of the class slipped.',head:'the KLCI is flat while most Bursa stocks slip'},
 'Flat, but most stocks rising':{mean:'The KLCI has barely moved, but more stocks are rising than falling.',ana:'The class average is flat, yet most students improved: a few big names held it back.',head:'the KLCI is flat while most Bursa stocks rise'},
 'Flat and steady':{mean:'The KLCI has barely moved, and rising and falling stocks are roughly balanced.',ana:'A calm, flat road.',head:'the KLCI is flat and steady'}};
function usEv(){const e=[`The VIX “fear gauge” is ${RIN.vix.toFixed(2)}. Below 20 is normal calm${RIN.vixPeak?`; its highest close in the last 20 sessions was ${RIN.vixPeak.v.toFixed(2)} on ${RIN.vixPeak.d}`:''}.`,`The Nasdaq is ${(US.dd*100).toFixed(1)}% below its ${RIN.ndqPeakD} record.`];
 const s=swings('Nasdaq Comp.');if(s){const big=Math.max(Math.abs(s.up.c),Math.abs(s.dn.c));
  e.push(big>=.015?`Biggest Nasdaq moves in the last 10 sessions: ${(s.dn.c*100).toFixed(2)}% on ${fmtD(s.dn.d)} and +${(s.up.c*100).toFixed(2)}% on ${fmtD(s.up.d)}.`:`Over the last 10 sessions the Nasdaq never moved more than ${(big*100).toFixed(1)}% in a day.`)}
 return e}
function myEv(){const e=[`KLCI ${RIN.klci.toLocaleString('en-US',{maximumFractionDigits:2})}, ${(MY.chg*100).toFixed(1)}% since ${RIN.klciRefD} (${RIN.klciRef.toLocaleString('en-US',{maximumFractionDigits:2})}).`];
 if(MY.brTxt)e.push(MY.brTxt+'.');if(resBrFresh&&ok(RIN.smallcap))e.push(`FBM Small Cap index ${RIN.smallcap>=0?'+':''}${RIN.smallcap}% (research note ${fmtD(R.BUILT.slice(0,10))}).`);return e}
const REGX={
 us:{lab:'US market mood',m:US,...USX[US.val],ev:usEv(),page:US.hv?'Growth & momentum scores get lower confidence for US stocks. The Defensive and Dividend strategies are built for this kind of market.':'No mood adjustment is applied to US scores right now.'},
 my:{lab:'Bursa market mood',m:MY,...MYX[MY.val],ev:myEv(),page:MY.val.includes('slipping')?'Big index names look steadier than the broader market right now.':'No mood adjustment is applied to Bursa scores.'}};
const cap1=s=>s.charAt(0).toUpperCase()+s.slice(1);
const headline=cap1(`${REGX.us.head}; ${REGX.my.head}`);

/* ================= INDICATORS ================= */
function indicators(t){const a=H[t];if(!a)return null;const c=a.slice().reverse().filter(v=>v!==null);if(c.length<21)return null;
 const last=c.at(-1),ret20=last/c[c.length-21]-1;const r=[];for(let i=c.length-20;i<c.length;i++)r.push(Math.log(c[i]/c[i-1]));
 const mu=r.reduce((s,x)=>s+x,0)/r.length,sd=Math.sqrt(r.reduce((s,x)=>s+(x-mu)**2,0)/(r.length-1));
 let g=0,l=0;const k=c.length-15;for(let i=k+1;i<=k+14;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d}let ag=g/14,al=l/14;
 for(let i=k+15;i<c.length;i++){const d=c[i]-c[i-1];ag=(ag*13+Math.max(d,0))/14;al=(al*13+Math.max(-d,0))/14}
 const rsi=al===0?100:100-100/(1+ag/al);return {ret20,sdD:sd,vol:sd*Math.sqrt(252),rsi,n:c.length,gaps:a.length-c.length}}

/* ================= NEWS ================= */
const evAge=e=>calDays(noon(e.d),NOW);
function newsFor(t){let sum=0,severe=null;const parts=[];
 for(const e of N){const rel=(e.tk||{})[t];if(!rel)continue;const age=Math.max(0,evAge(e)),dec=Math.pow(.5,age/14),w=rel*dec*(e.weak?.5:1),c=e.s*w;sum+=c;parts.push({e,rel,dec,c});
  if(e.s*rel<=-60&&age<=14&&(!severe||e.s*rel<severe.s*severe.rel))severe={...e,rel}}
 return {net:Math.max(-100,Math.min(100,sum)),parts,severe}}
const openFlag=t=>{const f=FLAGS[t];return f&&!f.resolved?f:null}; // flags stay open until a person marks them resolved

/* ================= METRICS ================= */
function metrics(x){
 if(!pos(x.p))return {bad:['no valid price']};
 const M={};
 M.age=ageInfo(x);
 const eps=pos(x.pe)&&pos(x.pRef)?x.pRef/x.pe:null,feps=pos(x.fpe)&&pos(x.pRef)?x.pRef/x.fpe:null;
 M.pe=eps?x.p/eps:null;M.fpe=feps?x.p/feps:null;M.g=eps&&feps?feps/eps-1:null;M.gBad=M.g!==null&&(M.g<-.25||M.g>.6);
 M.upWhy=!pos(x.tgt)?'no analyst target':(x.na!==null&&x.na!==undefined&&x.na<5)?`only ${x.na} analyst${x.na===1?'':'s'} (needs 5+)`:!x.an?'no consensus rating':null;
 M.up=M.upWhy?null:x.tgt/x.p-1;
 M.yld=ok(x.dps)&&x.dps>=0?x.dps/x.p:null;
 let lo=x.lo,hi=x.hi;M.outRange=false;if(pos(lo)&&pos(hi)&&hi>lo){if(x.p<lo){lo=x.p;M.outRange=true}if(x.p>hi){hi=x.p;M.outRange=true}}else{lo=hi=null}
 M.lo=lo;M.hi=hi;M.pos=lo!==null?clamp((x.p-lo)/(hi-lo)):null;M.range=lo!==null?(hi-lo)/x.p:null;
 M.ind=indicators(x.t);
 M.mom=M.ind?clamp((M.ind.ret20+.2)/.4)*100:(M.pos!==null?M.pos*100:null);M.momProxy=!M.ind;
 M.sc={
  val:M.fpe?clamp((1/M.fpe-.02)/.10)*100:null,
  up:M.up!==null?clamp(M.up/.4)*100:null,
  gr:M.g!==null&&!M.gBad?clamp((M.g+.05)/.40)*100:null,
  mom:M.mom,dip:M.mom===null?null:100-M.mom,
  inc:M.yld!==null?clamp(M.yld/(x.m==='US'?.04:.06))*100:null,
  stab:M.ind?clamp(1-(M.ind.vol-.15)/.65)*100:(M.range!==null?clamp(1-(M.range-.2)/.8)*100:null),
  news:null};
 M.news=newsFor(x.t);M.sc.news=(M.news.net+100)/2;
 M.flag=openFlag(x.t);
 M.fage=x.fd?calDays(noon(x.fd),NOW):null;
 M.earnIn=x.earn?Math.ceil(calDays(NOW,noon(x.earn))):null;
 // live "near the 52-week low" note, so dated research text is never the only word on it
 M.nearLow=M.lo!==null&&x.p<=M.lo*1.03;
 return M}
const ALL={};S.forEach(x=>{try{ALL[x.t]=metrics(x)}catch(e){ALL[x.t]={bad:['data error']}}});

/* ================= SIGNALS (locked plans) ================= */
const SIG=signals&&typeof signals==='object'?JSON.parse(JSON.stringify(signals)):{open:[],closed:[]};
SIG.open=SIG.open||[];SIG.closed=SIG.closed||[];
const COOL=10; // trading days with no new signal after a stop-out
function coolOff(t){const c=SIG.closed.filter(s=>s.t===t&&s.outcome==='stopped').sort((a,b)=>b.closedOn.localeCompare(a.closedOn))[0];if(!c)return null;
 const x=S.find(s=>s.t===t);const m=x?x.m:c.m;const n=tradingDaysBetween(c.closedOn,localDay(m),m);return n<COOL?{since:c.closedOn,left:COOL-n,sig:c}:null}

/* ================= EVALUATE ================= */
const RANKL=['Avoid','Reduce','Watchlist','Hold','Accumulate','Buy Candidate','Strong Buy Candidate'];
const rank=c=>c==='Incomplete data'?-1:RANKL.indexOf(c); // incomplete sorts below everything and never counts as an upgrade
const CC={'Avoid':'sell','Reduce':'sell','Watchlist':'watch','Incomplete data':'watch','Hold':'hold','Accumulate':'buy','Buy Candidate':'buy','Strong Buy Candidate':'buy'};
function tick(v,cur){if(cur!=='MYR')return .01;return v<1?.005:v<10?.01:v<100?.02:.1}
const snapDn=(v,cur)=>{const t=tick(v,cur);return +(Math.floor(v/t+1e-9)*t).toFixed(3)};
const snapNr=(v,cur)=>{const t=tick(v,cur);return +(Math.round(v/t)*t).toFixed(3)};
const money=(v,c,dp)=>{if(!ok(v))return 'n/a';const d=dp??(c==='MYR'?(v<1?3:2):2);return (c==='MYR'?'RM':'$')+v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})};
function planFor(x,M){if(M.up===null)return null;
 const sp=M.ind?clamp(1.5*M.ind.sdD*Math.sqrt(10),.05,.15):(M.range!==null?clamp(M.range*.2,.06,.15):.08);
 const eHi=snapNr(x.p,x.cur);let eLo=snapNr(x.p*(1-sp/3),x.cur);if(M.lo!==null&&eLo<M.lo)eLo=snapNr(M.lo,x.cur);if(eLo>eHi)eLo=eHi;
 const mid=(eLo+eHi)/2,stop=snapDn(mid*(1-sp),x.cur),tgt=snapDn(x.tgt,x.cur),rr=(tgt-mid)/(mid-stop);
 return {sp,eLo,eHi,mid,stop,tgt,rr,good:tgt>eHi&&rr>=1.5,basis:M.ind?'volatility':'range'}}
function evaluate(x,sk,opt={}){
 const M=ALL[x.t];if(!M||M.bad)return {bad:true,why:M?M.bad:['missing']};
 const st=STRAT[sk];let sum=0,missW=0;const used={},skipped=[];
 for(const k in st.w){const v=M.sc[k];if(v===null||v===undefined||!isFinite(v)){skipped.push(COMP[k]);missW+=st.w[k];continue}used[k]=st.w[k];sum+=st.w[k]*v}
 // a missing input counts as 0 — so removing data can never raise a score
 const raw=sum,score=Math.round(raw);
 let conf=100;const why=[];const dock=(n,t)=>{conf-=n;why.push(`${t} (−${n})`)};
 const A=M.age;
 if(A.partial)dock(15,`price is from ${whenMYT(x.asOf)}, before the ${fmtD(x.d)} close`);
 if(A.missed>0)dock(Math.min(50,8*A.missed),`${A.missed} newer closing price${A.missed>1?'s':''} missing`);
 if(x.stale&&!A.missed)dock(5,'the latest update failed for this stock');
 if(!x.s2)dock(10,x.live?'one price source (Yahoo)':'price has only one source');
 if(x.fd&&M.fage>30)dock(10,'valuation inputs over 30 days old');
 if(!x.fd&&(pos(x.pe)||pos(x.fpe)))dock(10,'valuation date unknown (Yahoo)');
 if(x.disagree)dock(10,`sources disagree on ${x.disagree.what}; the less flattering figure is used`);
 if(M.fpe===null)dock(15,'no forward P/E');
 if(M.up===null)dock(15,`analyst upside left out: ${M.upWhy}`);
 else if(x.na<10)dock(5,'fewer than 10 analysts');
 if(!ok(x.dps))dock(5,'dividend unknown (counted as none)');
 if(!x.researched)dock(15,'not researched: no catalysts or risks reviewed');
 if(M.momProxy)dock(5,'momentum/volatility from 52-week range (no price history)');
 if(M.gBad)dock(5,'implied growth looks distorted');
 if(M.outRange)dock(5,'price outside the 52-week range on file');
 if(sk==='gro'&&x.m==='US'&&US.hv)dock(10,'momentum strategy in a high-volatility US market');
 conf=Math.max(0,conf);
 let cls=missW>=.30?'Incomplete data':score>=70?'Strong Buy Candidate':score>=62?'Buy Candidate':score>=55?'Accumulate':score>=47?'Hold':score>=40?'Watchlist':score>=33?'Reduce':'Avoid';
 const caps=[];
 if(missW>=.30)caps.push(`Not labelled: ${Math.round(missW*100)}% of this strategy’s inputs are missing (${skipped.join(', ')}), and missing inputs count as zero.`);
 if(cls==='Strong Buy Candidate'&&conf<75){cls='Buy Candidate';caps.push('Strong Buy needs confidence of 75+.')}
 const capTo=(lvl,why)=>{if(rank(cls)>lvl)cls=RANKL[lvl];caps.push(rank(cls)<lvl?why.replace(/^Capped at \w+/,'Also flagged'):why)};
 if(!x.researched)capTo(3,'Capped at Hold: not yet researched (no catalysts or risks reviewed).');
 if(A.missed>3)capTo(2,`Capped at Watchlist: the price misses ${A.missed} newer closes. Refresh first.`);
 if(conf<60)capTo(2,'Capped at Watchlist: data confidence is below 60.');
 if(M.news.severe)capTo(2,`Capped at Watchlist: severe recent news (“${M.news.severe.h.slice(0,70)}…”).`);
 if(M.flag)capTo(2,`Capped at Watchlist: open event risk — ${M.flag.t} (open since ${fmtD(M.flag.d)}).`);
 // locked signal
 let sig=null,sigState=null;
 if(!opt.ignoreSig){sig=SIG.open.find(s=>s.t===x.t)||null;
  if(sig){if(x.p<=sig.stop){sigState='stop';capTo(2,`Capped at Watchlist: the price ${money(x.p,x.cur)} is at or below the stop ${money(sig.stop,x.cur)} locked on ${fmtD(sig.issued)}.`)}
   else if(x.p>=sig.target)sigState='target'}
  const co=coolOff(x.t);if(co)capTo(2,`Capped at Watchlist: stopped out on ${fmtD(co.since)}; no new signal for ${co.left} more trading day${co.left>1?'s':''}.`)}
 const plan=planFor(x,M);
 return {M,score,raw,conf,why,cls,cc:CC[cls],caps,plan,used,skipped,missW,h:st.h,sig,sigState}}

/* ================= SIGNAL STEP (run by the GitHub job after each price update) ================= */
function stepSignals(){
 const out={v:1,updated:NOW.toISOString(),open:[],closed:SIG.closed.slice()};
 const fresh=x=>x&&x.live&&!x.stale&&!ALL[x.t].bad&&ALL[x.t].age.missed===0&&!ALL[x.t].age.partial;
 for(const s of SIG.open){const x=S.find(y=>y.t===s.t);
  if(!fresh(x)||!(x.asOf>new Date(s.issuedAt))){out.open.push(s);continue}
  const close=(outcome,note)=>out.closed.push({...s,outcome,note,closedOn:localDay(x.m),closedAt:x.asOf.toISOString(),closePrice:x.p,ret:+(x.p/s.mid-1).toFixed(4)});
  if(x.p<=s.stop){close('stopped',`price ${x.p} at or below the stop ${s.stop}`);continue}
  if(x.p>=s.target){close('target',`price ${x.p} reached the target ${s.target}`);continue}
  const e=evaluate(x,s.strategy,{ignoreSig:true});
  if(rank(e.cls)<=2){close('withdrawn',`label fell to ${e.cls}${e.caps[0]?': '+e.caps[0]:''}`);continue}
  if(calDays(new Date(s.issuedAt),NOW)>s.horizonDays){close('expired',`no stop or target after ${s.horizonDays} days`);continue}
  out.open.push({...s,last:x.p,lastAt:x.asOf.toISOString(),lastLabel:e.cls})}
 const SIG2=SIG;SIG2.open=out.open;SIG2.closed=out.closed; // so cool-off sees stops closed in this run
 for(const x of S){if(out.open.some(s=>s.t===x.t)||!fresh(x)||coolOff(x.t))continue;
  const e=evaluate(x,'bal');
  if(rank(e.cls)>=4&&e.plan&&e.plan.good){const P=e.plan;
   out.open.push({id:`${x.t}-${localDay(x.m)}`,t:x.t,m:x.m,cur:x.cur,strategy:'bal',issued:localDay(x.m),issuedAt:x.asOf.toISOString(),priceAtIssue:x.p,label:e.cls,score:e.score,conf:e.conf,
    entryLo:P.eLo,entryHi:P.eHi,mid:+P.mid.toFixed(4),stop:P.stop,target:P.tgt,rr:+P.rr.toFixed(2),horizonDays:365})}}
 out.closed=out.closed.slice(-500);
 return out}
function track(){const c=SIG.closed,by=o=>c.filter(s=>s.outcome===o);const rets=c.map(s=>s.ret).filter(ok);
 const openMtm=SIG.open.map(s=>{const x=S.find(y=>y.t===s.t);return {...s,now:x?x.p:null,ret:x?x.p/s.mid-1:null}});
 return {closed:c,open:openMtm,n:c.length,target:by('target').length,stopped:by('stopped').length,withdrawn:by('withdrawn').length,expired:by('expired').length,
  avg:rets.length?rets.reduce((a,b)=>a+b,0)/rets.length:null,hit:c.length?by('target').length/c.length:null}}

/* ================= DATA STATUS (per market) ================= */
function status(){const out=[];
 if(!live){out.push({m:'ALL',text:`Live prices didn’t load, so this shows the research snapshot from ${whenMYT(new Date(R.BUILT))}. Reload to try again.`});return out}
 for(const m of ['MY','US']){const name=m==='MY'?'Bursa':'US';const last=live.mkUpdated&&live.mkUpdated[m]?new Date(live.mkUpdated[m]):null;const exp=expectedLatest(m);
  if(!last){out.push({m,text:`${name} prices have never been updated automatically.`});continue}
  const lc=lastClosedDay(m),lcT=lc?closeTs(lc,m):null;
  if(marketOpen(m)&&NOW-last>45*MIN)out.push({m,text:`${name} market is open, but its prices were last updated ${Math.round((NOW-last)/MIN)} minutes ago (${hhmm(last)}). The automatic update may have stopped.`});
  else if(lcT&&last<lcT&&NOW-lcT>45*MIN)out.push({m,text:`${name} prices miss the ${fmtD(lc)} close: last update ${whenMYT(last)}. Until it is fetched, the prices shown are older than that close.`});
  else if(exp&&exp-last>45*MIN&&!marketOpen(m)&&!(lcT&&last>=lcT))out.push({m,text:`${name} prices were last updated ${whenMYT(last)}.`})}
 if(live.lastAttempt&&live.attempted&&live.fresh){for(const m of live.lastAttemptMarkets||[]){const a=live.attempted[m],f=live.fresh[m];
  if(a&&f<a/2)out.push({m,text:`The last update attempt (${hhmm(live.lastAttempt)}) failed for ${a-f} of ${a} ${m==='MY'?'Bursa':'US'} stocks. Older prices are kept and marked.`})}}
 return out}

/* ================= COMPACT PAYLOAD FOR ASK AI ================= */
function aiPayload(sk){const r=v=>ok(v)?+v.toFixed(2):null;
 const rows=S.map(x=>{const e=evaluate(x,sk);if(e.bad)return {t:x.t,excluded:e.why};const M=e.M,P=e.sig||e.plan;
  return {t:x.t,n:x.n,m:x.m,sec:x.sec,p:x.p,d:x.d,age:M.age.kind+(M.age.missed?` (${M.age.missed} closes missing)`:''),ch:x.ch,score:e.score,label:e.cls,conf:e.conf,
   why:e.why.map(w=>w.replace(/ \(−\d+\)$/,'')),caps:e.caps,sub:Object.fromEntries(Object.entries(M.sc).filter(([k])=>k in STRAT[sk].w).map(([k,v])=>[k,v===null?null:Math.round(v)])),
   fpe:r(M.fpe),yld:M.yld===null?null:r(M.yld*100),up:M.up===null?null:Math.round(M.up*100),an:x.an?`${x.an} (${x.na??'?'})`:null,
   plan:P?{locked:!!e.sig,entry:[P.eLo??P.entryLo,P.eHi??P.entryHi],stop:P.stop,target:P.tgt??P.target}:null,news:Math.round(M.news.net),risk:M.flag?M.flag.t:null,
   researched:x.researched,...(x.researched?{cat:x.cat,rk:x.rk,notesDated:x.rd}:{})}});
 return {now:NOW.toISOString(),usdmyr:FX,counts:{US:S.filter(x=>x.m==='US').length,MY:S.filter(x=>x.m==='MY').length},
  pricesUpdated:live&&live.mkUpdated?{MY:live.mkUpdated.MY,US:live.mkUpdated.US}:{research:R.BUILT},
  usMood:{label:US.val,rule:US.rule},bursaMood:{label:MY.val,rule:MY.rule},strategy:{name:STRAT[sk].n,weights:STRAT[sk].w},
  bands:'70+ Strong Buy (conf 75+), 62+ Buy, 55+ Accumulate, 47+ Hold, 40+ Watchlist, 33+ Reduce, <33 Avoid. Missing inputs count as 0; 30%+ missing = Incomplete data. Unresearched capped at Hold. Capped at Watchlist for stale price, confidence <60, severe news, open event risk, stop hit. Not backtested.',
  macro:IDX.map(i=>[i.k,i.t||i.v,i.d||i.s]),stocks:rows,
  news:N.filter(n=>evAge(n)<=30).map(n=>({d:n.d,h:n.h,s:n.s,tk:Object.keys(n.tk||{})})),openRisks:Object.entries(FLAGS).filter(([,f])=>!f.resolved).map(([t,f])=>({t,risk:f.t,since:f.d}))}}

return {NOW,R,S,H,ALL,IDX,RIN,CH,N,FLAGS,STRAT,COMP,US,MY,REGX,headline,FX,BR,
 NOTE:R.NOTE?{...R.NOTE,fresh:calDays(noon(R.NOTE.d),NOW)<=3}:null,CAL:R.CAL||[],
 evaluate,metrics,newsFor,indicators,ageInfo,status,stepSignals,track,coolOff,aiPayload,openFlag,
 closeTs,marketOpen,isTradingDay,localDay,lastClosedDay,sessions,expectedLatest,tradingDaysBetween,
 tick,snapDn,snapNr,money,fmtD,fmtDY,hhmm,whenMYT,fmtMc,RANKL,rank,CC,SIG,live,evAge};
};
