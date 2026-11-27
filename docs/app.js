/* Investment Desk — the screen. All numbers come from engine.js; this file only draws them. */
(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const ok=v=>typeof v==='number'&&isFinite(v);
const store={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const nowDate=()=>window.__NOW?new Date(window.__NOW):new Date();

async function getJSON(u,ms=6000){try{const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);const r=await fetch(u,{cache:'no-store',signal:c.signal});clearTimeout(t);return r.ok?await r.json():null}catch(e){return null}}

let E,LIVE,SIGS;
function start(){
E=makeEngine({R:DESK_RESEARCH,live:LIVE,signals:SIGS,now:nowDate()});
const {S,H,ALL,IDX,CH,N,STRAT,COMP,US,MY,REGX,money,fmtD,fmtDY,hhmm,whenMYT,RANKL,rank}=E;let FX=E.FX;
const pct=(v,d=1)=>ok(v)?(v>=0?'+':'')+(v*100).toFixed(d)+'%':'n/a';
const sgn=v=>v>0?'up':v<0?'dn':'';
const n1=(v,d=1)=>ok(v)?v.toFixed(d):'n/a';
const chg=v=>ok(v)?`${v>=0?'+':''}${v.toFixed(2)}%`:'n/a';
const nUS=S.filter(x=>x.m==='US').length,nMY=S.filter(x=>x.m==='MY').length;
let STRATK=store.get('desk-strat','bal');if(!STRAT[STRATK])STRATK='bal';
let WATCH=new Set(store.get('desk-watch',[]));
const star=t=>`<button type="button" class="star" data-star="${esc(t)}" aria-pressed="${WATCH.has(t)}" aria-label="${WATCH.has(t)?'Remove '+esc(t)+' from':'Add '+esc(t)+' to'} watchlist">${WATCH.has(t)?'★':'☆'}</button>`;

function ageTag(x){const A=ALL[x.t]&&!ALL[x.t].bad?ALL[x.t].age:E.ageInfo(x);
 if(A.kind==='intraday')return `<span class="up">Intraday · ${esc(hhmm(x.asOf))}</span> · delayed ~15 min`;
 if(A.kind==='partial')return `<span class="stale">Partial day · ${esc(whenMYT(x.asOf))}</span> · not a close`;
 if(A.kind==='stale')return `<span class="stale">Old · close ${esc(fmtD(x.d))} · ${A.missed} newer close${A.missed>1?'s':''} missing</span>`;
 return `Close · ${esc(fmtD(x.d))}${x.live?'':' · research snapshot'}`}
const scoreCell=s=>s===null?'<span class="mute">n/a</span>':`<div class="sc"><b>${s}</b><div class="bar"><i style="width:${s}%;background:${s>=55?'var(--up)':s>=40?'var(--brown)':'var(--dn)'}"></i></div></div>`;
const labelCell=e=>`<span class="cls c-${e.cc}">${esc(e.cls)}</span>${e.sig?'<br><span class="sm lock">signal locked</span>':e.caps.length&&e.cls!=='Incomplete data'?'<br><span class="sm wn">capped</span>':''}`;

/* ================= HEADER ================= */
function header(){
 $('headline').textContent=E.headline;
 const up=S.filter(x=>x.live&&ok(x.ch)&&!ALL[x.t].bad&&ALL[x.t].age.missed===0).sort((a,b)=>Math.abs(b.ch)-Math.abs(a.ch)).slice(0,3);
 $('subhead').innerHTML=up.length?`Biggest moves among tracked stocks: ${up.map(x=>`<a href="#stock-${esc(x.t.toLowerCase())}">${esc(x.t)}</a> <span class="${sgn(x.ch)}">${chg(x.ch)}</span>`).join(' · ')}`:'';
 const mk=m=>{const t=LIVE&&LIVE.mkUpdated&&LIVE.mkUpdated[m];return t?`${m==='MY'?'Bursa':'US'} ${esc(whenMYT(t))}${E.marketOpen(m)?' · <b class="up">market open</b>':''}`:`${m==='MY'?'Bursa':'US'}: research snapshot`};
 $('asof').innerHTML=`<span><b>Prices updated</b> ${mk('MY')} · ${mk('US')}</span><span>${nUS} US + ${nMY} Bursa stocks scored</span>${LIVE&&LIVE.lastAttempt?`<span>Last update attempt ${esc(hhmm(LIVE.lastAttempt))}</span>`:''}`;
 const st=E.status(),ban=$('ageBanner');
 if(st.length){ban.hidden=false;ban.innerHTML=st.map(s=>esc(s.text)).join('<br>')}else{ban.hidden=true}
}
function kpis(){
 $('kpis').innerHTML=IDX.map(i=>{let ch='';if(!i.t){const cls=i.inv?'mute':sgn(i.c);ch=`<span class="${cls}" style="display:inline">${chg(i.c)}${i.inv?` (${esc(i.c>=0?i.inv[0]:i.inv[1])})`:''}</span> · ${esc(i.d)}`}
  return `<div class="kpi"><span>${esc(i.k)}</span><b>${i.t?esc(i.t):i.v.toLocaleString('en-US',{minimumFractionDigits:i.dp??2,maximumFractionDigits:i.dp??2})}</b><span>${i.t?esc(i.s):ch}${i.x?` · ${esc(i.x)}`:''}${i.stale?' · <span class="stale">update failed</span>':''} · <a href="${esc(i.u)}">source</a></span></div>`}).join('');
 $('regchips').innerHTML=Object.entries(REGX).map(([k,r])=>`<button type="button" class="regbtn" data-reg="${k}" aria-expanded="false" aria-controls="regExplain"><span class="dot" style="background:${r.m.dot}"></span><span><span class="lab">${esc(r.lab)}</span><span class="val">${esc(r.m.val)}</span></span><span class="why">What does this mean?</span></button>`).join('');
 $('regime').innerHTML=Object.values(REGX).map(r=>`<p style="margin-top:8px"><b>${esc(r.lab)}: ${esc(r.m.val)}</b> <span class="mute sm">(${esc(r.m.term)})</span></p><ul class="ev sm">${r.ev.map(e=>`<li>${esc(e)}</li>`).join('')}</ul><p class="sm mute">${esc(r.m.rule)}</p>`).join('');
 const NT=E.NOTE;
 $('crossWrap').hidden=!(NT&&NT.fresh);
 if(NT&&NT.fresh)$('cross').innerHTML=NT.items.map(t=>`<li>${esc(t)}</li>`).join('')+`<li class="mute">Editor’s note written ${esc(fmtD(NT.d))}.</li>`;
 const today=E.localDay('MY');const up=E.CAL.filter(c=>c[0]>=today);
 $('cal').innerHTML=up.length?`<thead><tr><th>Date</th><th>Event</th><th>Market</th></tr></thead><tbody>${up.map(c=>`<tr><td style="white-space:nowrap">${esc(fmtDY(c[0]))}</td><td>${esc(c[1])}</td><td>${esc(c[2])}</td></tr>`).join('')}</tbody>`:'<tbody><tr><td>No upcoming events on file.</td></tr></tbody>';
 const al=N.filter(n=>Math.abs(n.s)>=50&&E.evAge(n)<=21).sort((a,b)=>b.d.localeCompare(a.d)).slice(0,4);
 $('alerts').innerHTML=al.length?al.map(newsItem).join(''):'<p class="mute">No critical alerts in the last three weeks.</p>';
 $('topNote').innerHTML=`Ordered by label, then score. Stocks not yet researched can’t rank above Hold. <a href="#screener">Open the full screener</a> for all ${S.length} stocks.`;
}
function topTable(){
 const ranked=S.map(x=>({x,e:E.evaluate(x,STRATK)})).filter(r=>!r.e.bad).sort((a,b)=>rank(b.e.cls)-rank(a.e.cls)||b.e.score-a.e.score).slice(0,6);
 $('topTable').innerHTML=`<thead><tr><th>Stock</th><th class="n">Price</th><th>Score</th><th>Label</th></tr></thead><tbody>${ranked.map(({x,e})=>`<tr class="row" tabindex="0" data-t="${esc(x.t)}"><td><b>${esc(x.t)}</b> <span class="mute sm">${esc(x.n)}</span></td><td class="n">${money(x.p,x.cur)}</td><td>${scoreCell(e.score)}</td><td>${labelCell(e)}</td></tr>`).join('')}</tbody>`}
function newsItem(n){const c=n.s>=10?'s-pos':n.s<=-10?'s-neg':'s-neu',tks=Object.keys(n.tk||{});
 return `<article class="item"><div class="score ${c}" aria-label="AI-judged impact score ${n.s}">${n.s>0?'+':''}${n.s}</div><div><b>${esc(n.h)}</b><div class="sm mute">${esc(fmtD(n.d))} · ${esc(n.cat)} · ${esc(n.dur)}${n.weak?' · secondary source':''} · ${n.src.map(s=>`<a href="${esc(s[1])}">${esc(s[0])}</a>`).join(', ')}</div><p class="sm" style="margin:4px 0 0">${esc(n.imp)}</p>${tks.length?`<div class="tags">${tks.map(t=>S.some(x=>x.t===t)?`<a class="chip" href="#stock-${esc(t.toLowerCase())}">${esc(t)}${n.tk[t]<1?` <span class="mute">×${n.tk[t]}</span>`:''}</a>`:`<span class="chip">${esc(t)}</span>`).join('')}</div>`:'<div class="tags"><span class="chip">Market-wide</span></div>'}</div></article>`}

/* ================= CHART ================= */
let chKey='us';const svg=$('chart');
function draw(){
 const c=CH[chKey],W=svg.clientWidth,H2=svg.clientHeight;if(!W||!H2)return;
 const narrow=W<520,pl=narrow?40:54,pr=narrow?84:128,pt=14,pb=30;
 const ser=c.s.map(s=>({n:s.n,v:c.idx?s.v.map(v=>v/s.v[0]*100):s.v}));
 const all=ser.flatMap(s=>s.v);if(c.ref)all.push(c.ref);
 let mn=Math.min(...all),mx=Math.max(...all);const pad=(mx-mn)*.08||1;mn-=pad;mx+=pad;
 const ts=c.x.map(d=>new Date(d+'T00:00:00Z').getTime()),t0=ts[0],t1=ts.at(-1);
 const X=i=>pl+(W-pl-pr)*(c.time?(ts[i]-t0)/((t1-t0)||1):i/((c.x.length-1)||1)),Y=v=>pt+(H2-pt-pb)*(1-(v-mn)/(mx-mn));
 const cols=['var(--mag)','var(--ink)','var(--brown)','var(--up)'];
 let g='';for(let i=0;i<=5;i++){const v=mn+(mx-mn)*i/5;g+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pl-6}" y="${Y(v)+4}" text-anchor="end" font-size="12" fill="var(--mute)">${v.toFixed(c.idx?1:v>100?0:1)}</text>`}
 let lastX=-99;c.x.forEach((d,i)=>{const x=X(i);if(x-lastX<(narrow?42:52))return;lastX=x;g+=`<text x="${x}" y="${H2-8}" text-anchor="middle" font-size="12" fill="var(--mute)">${esc(fmtD(d))}</text>`});
 if(c.ref)g+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(c.ref)}" y2="${Y(c.ref)}" stroke="var(--dn)" stroke-dasharray="4 4"/><text x="${W-pr+6}" y="${Y(c.ref)+4}" font-size="12" fill="var(--dn)">20 = calm line</text>`;
 const ends=[];
 ser.forEach((s,k)=>{const col=cols[k%4];g+=`<polyline fill="none" stroke="${col}" stroke-width="${k?2:3}" points="${s.v.map((v,i)=>X(i)+','+Y(v)).join(' ')}"/>`+s.v.map((v,i)=>`<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="${col}"><title>${esc(s.n)} ${esc(fmtD(c.x[i]))}: ${v.toFixed(2)}</title></circle>`).join('');ends.push({y:Y(s.v.at(-1)),t:`${s.n} ${s.v.at(-1).toFixed(c.idx?1:2)}`,col})});
 if(chKey==='vix'){const i=c.s[0].v.indexOf(Math.max(...c.s[0].v));g+=`<text x="${X(i)}" y="${Y(c.s[0].v[i])-10}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--mag)">Peak ${c.s[0].v[i].toFixed(2)}</text>`}
 ends.sort((a,b)=>a.y-b.y);for(let i=1;i<ends.length;i++)if(ends[i].y-ends[i-1].y<15)ends[i].y=ends[i-1].y+15;
 ends.forEach(e=>g+=`<text x="${W-pr+6}" y="${e.y+4}" font-size="12" font-weight="600" fill="${e.col}">${esc(narrow?e.t.replace('Russell 2000','R2K').replace('S&P 500','S&P'):e.t)}</text>`);
 svg.innerHTML=g;
 $('chartTitle').textContent=c.t;$('chartNote').textContent=c.note;
 $('chartTable').innerHTML=`<thead><tr><th>Date</th>${c.s.map(s=>`<th class="n">${esc(s.n)}</th>`).join('')}</tr></thead><tbody>${c.x.map((d,i)=>`<tr><td>${esc(fmtDY(d))}</td>${c.s.map(s=>`<td class="n">${s.v[i].toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>`).join('')}</tr>`).join('')}</tbody>`}
new ResizeObserver(draw).observe(svg);
document.querySelectorAll('[data-ch]').forEach(b=>b.addEventListener('click',()=>{chKey=b.dataset.ch;document.querySelectorAll('[data-ch]').forEach(o=>o.setAttribute('aria-pressed',o===b));draw()}));

/* ================= STRATEGY + SCREENER ================= */
document.querySelectorAll('.stratSel').forEach(s=>{s.innerHTML=Object.entries(STRAT).map(([k,v])=>`<option value="${k}">${esc(v.n)}</option>`).join('');s.value=STRATK;
 s.addEventListener('change',()=>{STRATK=s.value;store.set('desk-strat',STRATK);document.querySelectorAll('.stratSel').forEach(o=>o.value=STRATK);topTable();screener(true)})});
const fSec=$('fSec');[...new Set(S.map(x=>x.sec))].sort().forEach(s=>fSec.insertAdjacentHTML('beforeend',`<option>${esc(s)}</option>`));
{const sv=store.get('desk-f',{});for(const k in sv){const el=$(k);if(el&&el.options&&[...el.options].some(o=>o.value===sv[k]))el.value=sv[k]}}
const PAGE=25;let shown=PAGE;
function screener(reset){
 if(reset)shown=PAGE;
 const sk=STRATK,mk=$('fMkt').value,sec=fSec.value,min=+$('fMin').value,so=$('fSort').value,q=$('fQ').value.trim().toLowerCase(),only=$('fRes').value;
 store.set('desk-f',{fMkt:mk,fSec:sec,fMin:String(min),fSort:so,fRes:only});
 $('stratNote').textContent=`${STRAT[sk].n}: ${STRAT[sk].note} Weights: ${Object.entries(STRAT[sk].w).map(([k,v])=>COMP[k]+' '+Math.round(v*100)+'%').join(', ')}.`;
 const rows=S.filter(x=>(mk==='ALL'||x.m===mk)&&(sec==='ALL'||x.sec===sec)&&(!q||x.t.toLowerCase().includes(q)||String(x.n).toLowerCase().includes(q))&&(only==='ALL'||(only==='R'?x.researched:only==='W'?WATCH.has(x.t):!x.researched)))
  .map(x=>({x,e:E.evaluate(x,sk)})).filter(r=>r.e.bad||r.e.score>=min);
 const key={label:r=>-(r.e.bad?-1:rank(r.e.cls)*1000+r.e.score),score:r=>-(r.e.score??-1),up:r=>-(r.e.M?.up??-9),yld:r=>-(r.e.M?.yld??-9),fpe:r=>r.e.M?.fpe??999,conf:r=>-(r.e.conf??0),ch:r=>-(r.x.ch??-99)}[so];rows.sort((a,b)=>key(a)-key(b));
 const vis=rows.slice(0,shown);
 $('scrCount').textContent=`${rows.length} stock${rows.length===1?'':'s'}${rows.length>vis.length?`, showing ${vis.length}`:''}`;
 $('scrTable').innerHTML=`<thead><tr><th class="st"><span class="vh">Watch</span></th><th>Stock</th><th class="hm">Mkt</th><th class="n">Price</th><th class="n hm">Day</th><th>Score</th><th>Label</th><th class="n hm">Upside</th><th class="n hm">Fwd P/E</th><th class="n hm">Yield</th><th class="n hm">Confidence</th></tr></thead><tbody>${vis.length?vis.map(({x,e})=>e.bad?`<tr><td>${star(x.t)}</td><td><b>${esc(x.t)}</b></td><td colspan="9" class="dn">Excluded: ${esc(e.why.join(', '))}</td></tr>`:`<tr class="row" tabindex="0" data-t="${esc(x.t)}"><td class="st">${star(x.t)}</td><td><b>${esc(x.t)}</b>${x.researched?'':' <span class="sm mute" title="not researched">°</span>'}<br><span class="sm mute">${esc(x.n)}<span class="hm"> · ${esc(x.sec)}</span></span></td><td class="hm">${esc(x.m)}</td><td class="n">${money(x.p,x.cur)}<br><span class="sm ${sgn(x.ch)} sh">${chg(x.ch)}</span><span class="sm hm">${ageTag(x)}</span></td><td class="n hm ${sgn(x.ch)}">${chg(x.ch)}</td><td class="scw">${scoreCell(e.score)}</td><td>${labelCell(e)}</td><td class="n hm ${sgn(e.M.up)}">${pct(e.M.up,0)}</td><td class="n hm">${n1(e.M.fpe)}</td><td class="n hm">${e.M.yld===null?'n/a':(e.M.yld*100).toFixed(1)+'%'}</td><td class="n hm">${e.conf}</td></tr>`).join(''):`<tr><td colspan="11">No stocks match these filters.</td></tr>`}</tbody>`;
 $('scrMore').hidden=rows.length<=shown;$('scrMore').textContent=`Show ${Math.min(PAGE,rows.length-shown)} more`}
['fMkt','fSec','fMin','fSort','fRes'].forEach(id=>$(id).addEventListener('change',()=>screener(true)));
$('fQ').addEventListener('input',()=>screener(true));
$('scrMore').addEventListener('click',()=>{shown+=PAGE;screener()});
document.addEventListener('click',ev=>{const s=ev.target.closest('[data-star]');if(s){ev.stopPropagation();const t=s.dataset.star;WATCH.has(t)?WATCH.delete(t):WATCH.add(t);store.set('desk-watch',[...WATCH]);document.querySelectorAll(`[data-star="${CSS.escape(t)}"]`).forEach(b=>{b.setAttribute('aria-pressed',WATCH.has(t));b.textContent=WATCH.has(t)?'★':'☆'});if(location.hash==='#mine')mine();return}
 const r=ev.target.closest('tr.row');if(r&&!ev.target.closest('a,button,input,select'))location.hash='stock-'+r.dataset.t.toLowerCase()},true);
document.addEventListener('keydown',ev=>{const r=ev.target.closest&&ev.target.closest('tr.row');if(r&&ev.target===r&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();location.hash='stock-'+r.dataset.t.toLowerCase()}});

/* ================= STOCK FILE ================= */
let sizer=Object.assign({acct:10000,risk:1},store.get('desk-size',{}));
function sizeOut(x,P){if(!P)return '';const acctLocal=x.cur==='USD'?sizer.acct/FX:sizer.acct,risk=acctLocal*sizer.risk/100,per=P.mid-P.stop;
 if(!(per>0)||!(acctLocal>0))return '<p class="sm mute">Enter an account size and risk % above.</p>';
 let sh=Math.floor(risk/per);const lot=x.m==='MY'?100:1;sh=Math.floor(sh/lot)*lot;let capped=false;const maxSh=Math.floor(acctLocal/P.mid/lot)*lot;if(sh>maxSh){sh=maxSh;capped=true}
 if(sh<=0)return `<p class="sm">Risking ${sizer.risk}% (${money(risk,x.cur)}) is less than ${x.m==='MY'?'one 100-share lot':'one share'} at this stop distance (${money(per*lot,x.cur)} per ${x.m==='MY'?'lot':'share'}). Increase the account size or risk %.</p>`;
 const cost=sh*P.mid;return `<p class="sm"><b>${sh.toLocaleString('en-US')} share${sh===1?'':'s'}${x.m==='MY'?` (${sh/100} lot${sh/100>1?'s':''})`:''}</b> at about ${money(P.mid,x.cur)} costs ${money(cost,x.cur)}${x.cur==='USD'?` (≈ RM${(cost*FX).toLocaleString('en-US',{maximumFractionDigits:0})})`:''}, ${(cost/acctLocal*100).toFixed(0)}% of the account. A stop-out would lose about ${money(sh*per,x.cur)}${capped?'. Capped by the account size':''}. Brokerage fees not included.</p>`}
function stockFile(t){
 const x=S.find(s=>s.t.toLowerCase()===t);const box=$('stockFile');
 if(!x){box.innerHTML=`<h2>Stock not found</h2><p><a href="#screener">Back to the screener</a></p>`;return}
 const sk=STRATK,e=E.evaluate(x,sk);
 if(e.bad){box.innerHTML=`<h2>${esc(x.n)}</h2><p class="dn">Excluded from scoring: ${esc(e.why.join(', '))}.</p><p><a href="#screener">Back to the screener</a></p>`;return}
 const M=e.M,alt=x.cur==='USD'?`≈ RM${(x.p*FX).toFixed(2)}`:`≈ $${(x.p/FX).toFixed(2)}`;
 const G=e.sig?{eLo:e.sig.entryLo,eHi:e.sig.entryHi,mid:e.sig.mid,stop:e.sig.stop,tgt:e.sig.target,rr:(e.sig.target-e.sig.mid)/(e.sig.mid-e.sig.stop),good:true,locked:true}:e.plan;
 const news=M.news.parts.sort((a,b)=>b.e.d.localeCompare(a.e.d));
 const lockBox=e.sig?`<div class="lockbox"><b>Signal locked on ${esc(fmtD(e.sig.issued))}</b> at ${esc(e.sig.label)} (Balanced strategy, price ${money(e.sig.priceAtIssue,x.cur)}). Entry, stop and target below were fixed then and do not move with the price.${e.sigState==='stop'?` <b class="dn">The price is now at or below the stop: the signal closes at the next update.</b>`:e.sigState==='target'?` <b class="up">The price has reached the target.</b>`:''}</div>`:'';
 const planHtml=G?`${lockBox}${!G.locked?`<p class="sm mute">${rank(E.evaluate(x,'bal').cls)>=4?'Indicative plan. A signal locks at the next update if the Balanced label stays at Accumulate or better.':'Indicative plan only: no signal is open, because the Balanced label is below Accumulate. It is recalculated every update and is not a recommendation.'}</p>`:''}
 ${G.good?'':`<div class="warnbox"><b>${G.tgt<=G.eHi?'No upside to the consensus target':'Poor reward/risk ('+G.rr.toFixed(1)+' : 1)'}</b>: below the 1.5 : 1 minimum, so this setup is not worth taking on these numbers.</div>`}
 <dl class="kv"><dt>Entry zone</dt><dd>${money(G.eLo,x.cur)} – ${money(G.eHi,x.cur)}</dd><dt>Target${G.locked?' (locked)':' (consensus)'}</dt><dd>${money(G.tgt,x.cur)} <span class="${sgn(G.tgt-G.mid)}">(${pct(G.tgt/G.mid-1)} from entry mid)</span></dd><dt>Stop${G.locked?' (locked)':''}</dt><dd>${money(G.stop,x.cur)} <span class="dn">(${pct(G.stop/G.mid-1)})</span></dd><dt>Reward / risk</dt><dd class="${G.good?'':'wn'}">${G.rr>0?G.rr.toFixed(1)+' : 1':'none'}</dd><dt>Horizon</dt><dd>${esc(e.h)}</dd></dl>
 ${!G.locked?`<p class="sm mute" style="margin-top:8px">Stop distance ${(G.sp*100).toFixed(1)}% = ${G.basis==='volatility'?`1.5 × daily volatility (${(M.ind.sdD*100).toFixed(2)}%) × √10`:`20% of the 52-week range ÷ price (${(M.range*100).toFixed(0)}%)`}, bounded ${G.basis==='volatility'?'5':'6'}–15%. Prices snapped to ${x.m==='MY'?'Bursa tick sizes':'cents'}.</p>`:''}
 <h3 style="margin-top:14px">Position size</h3>
 <div class="sizer"><label>Account size (RM)<input id="szA" type="number" inputmode="decimal" min="0" step="100" value="${esc(sizer.acct)}"></label><label>Risk per trade (%)<input id="szR" type="number" inputmode="decimal" min="0.1" max="10" step="0.1" value="${esc(sizer.risk)}"></label></div>
 <div id="szOut">${sizeOut(x,G)}</div>`:`<p><b>No trade plan:</b> ${esc(M.upWhy||'no usable analyst target')}.</p>`;
 const liveFacts=[];
 if(M.nearLow)liveFacts.push(`Live: within 3% of its 52-week low (${money(M.lo,x.cur)}).`);
 if(x.disagree)liveFacts.push(`Sources disagree on forward P/E: research note ${n1(x.disagree.res)} (from ${fmtD(x.disagree.resD)}, at today’s price) vs Yahoo ${n1(x.disagree.yahoo)}. The higher (less flattering) figure is used.`);
 if(M.flag)liveFacts.push(`Open event risk since ${fmtD(M.flag.d)}: ${M.flag.t}. It stays open until someone marks it resolved.`);
 box.innerHTML=`<p class="sm"><a href="#screener">← Screener</a></p>
 <div class="file"><div>
 <h2 style="margin-bottom:4px">${star(x.t)} ${esc(x.n)} <span class="mute">${esc(x.t)} · ${esc(x.ex)}</span></h2>
 <p class="mute sm">${esc(x.sec)} · market cap ${esc(x.mc||'n/a')} · ${x.an?`${esc(x.an)} consensus from ${x.na??'?'} analysts`:'no analyst consensus on file'}</p>
 <div style="display:flex;flex-wrap:wrap;gap:12px 24px;align-items:end;margin:10px 0"><div class="big">${money(x.p,x.cur)}</div><div><span class="${sgn(x.ch)}"><b>${chg(x.ch)}</b></span> <span class="mute">${alt} at ${FX.toFixed(4)}</span><br><span class="sm">${ageTag(x)}</span></div></div>
 <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><span class="cls c-${e.cc}" style="font-size:15px">${esc(e.cls)}</span><span class="chip">Score ${e.score} · ${esc(STRAT[sk].n)}</span><span class="chip">Data confidence ${e.conf}</span><label class="sm mute" style="display:flex;gap:6px;align-items:center">Strategy <select id="sfStrat"></select></label></div>
 ${e.caps.map(c=>`<div class="warnbox">${esc(c)}</div>`).join('')}
 ${M.age.partial?`<div class="warnbox">This price was fetched at ${esc(whenMYT(x.asOf))}, before that day’s close. It is not a closing price.</div>`:''}
 ${M.earnIn!==null&&M.earnIn>=0&&M.earnIn<=7?`<div class="warnbox">Earnings due ${M.earnIn===0?'today':`in ${M.earnIn} day${M.earnIn>1?'s':''}`}: the price can gap either way.</div>`:''}
 <h3 style="margin-top:18px">52-week range and the plan</h3>
 <div class="fig rng"><svg id="rng" role="img" aria-label="Price range with stop, entry, price and target"></svg></div>
 ${planHtml}
 <p class="sm" style="margin-top:12px"><b>Not financial advice.</b> The label and plan are formula outputs.</p>
 </div><div>
 <h3>Score breakdown (${esc(STRAT[sk].n)})</h3>
 <div class="brk">${Object.keys(STRAT[sk].w).map(k=>{const v=M.sc[k],u=k in e.used;const tag=(k==='mom'||k==='dip'||k==='stab')&&M.momProxy?' · proxy':'';return `<div><span>${COMP[k]} <span class="mute">${Math.round(STRAT[sk].w[k]*100)}%${tag}</span></span><div class="bar"><i style="width:${u?v.toFixed(0):0}%"></i></div><b style="text-align:right">${u?v.toFixed(0):'0*'}</b></div>`}).join('')}</div>
 ${e.skipped.length?`<p class="sm mute" style="margin-top:6px">* Missing, counted as 0: ${esc(e.skipped.join(', '))}. Missing data can only lower a score.</p>`:''}
 <h3 style="margin-top:16px">Same stock, every strategy</h3>
 <div class="scroll"><table class="sm"><thead><tr><th>Strategy</th><th class="n">Score</th><th>Label</th><th class="n">Conf.</th></tr></thead><tbody>${Object.keys(STRAT).map(k=>{const q=E.evaluate(x,k);return `<tr><td>${esc(STRAT[k].n)}</td><td class="n">${q.score}</td><td><span class="cls c-${q.cc}">${esc(q.cls)}</span></td><td class="n">${q.conf}</td></tr>`}).join('')}</tbody></table></div>
 <h3 style="margin-top:16px">Valuation, growth and trend</h3>
 <dl class="kv"><dt>P/E (trailing, at today’s price)</dt><dd>${n1(M.pe)}</dd><dt>Forward P/E</dt><dd>${n1(M.fpe)}</dd><dt>Implied next-year EPS growth</dt><dd class="${M.gBad?'wn':sgn(M.g)}">${pct(M.g)}${M.gBad?' (unreliable)':''}</dd><dt>Dividend yield</dt><dd>${M.yld===null?'unknown':(M.yld*100).toFixed(2)+'%'}</dd><dt>52-week range</dt><dd>${money(M.lo,x.cur)} – ${money(M.hi,x.cur)}</dd><dt>Position in range</dt><dd>${M.pos===null?'n/a':(M.pos*100).toFixed(0)+'%'}</dd>
 ${M.ind?`<dt>20-day return</dt><dd class="${sgn(M.ind.ret20)}">${pct(M.ind.ret20)}</dd><dt>Volatility (annualised, 20d)</dt><dd>${(M.ind.vol*100).toFixed(0)}%</dd><dt>RSI (14)</dt><dd>${M.ind.rsi.toFixed(0)} <span class="mute">${M.ind.rsi>70?'overbought':M.ind.rsi<30?'oversold':'neutral'}</span></dd>`:`<dt>20-day return, volatility, RSI</dt><dd class="mute">no price history</dd>`}</dl>
 <p class="sm mute">Confidence: ${e.why.length?esc(e.why.join('; ')):'all inputs current and confirmed'}.</p>
 </div></div>
 ${x.m==='US'&&x.tv?`<h3 style="margin-top:24px">Live chart <span class="mute sm">(TradingView · ${esc(x.tv)})</span></h3><div id="tvStock" class="tvbox" style="height:420px"></div>`:`<h3 style="margin-top:24px">Price, last ${(H[x.t]||[]).filter(v=>v!==null).length} trading days <span class="mute sm">(Yahoo Finance)</span></h3>${H[x.t]?'<div class="fig" style="min-height:260px"><svg id="ownChart" role="img" aria-label="Daily closing prices"></svg></div>':'<p class="mute">No price history yet for this stock.</p>'}`}
 <div class="grid2" style="margin-top:24px"><div>
 <h3>News affecting ${esc(x.t)} <span class="mute sm">net score ${M.news.net>0?'+':''}${M.news.net.toFixed(0)}</span></h3>
 <p class="sm mute">Contribution = event score × relevance × recency${news.some(p=>p.e.weak)?' (× 0.5 for secondary sources)':''}. Event scores are AI judgements; the sum is calculated.</p>
 ${news.length?`<div class="scroll"><table class="sm"><thead><tr><th>Event</th><th class="n">Score</th><th class="n">Relevance</th><th class="n">Recency</th><th class="n">Adds</th></tr></thead><tbody>${news.map(p=>`<tr><td>${esc(fmtD(p.e.d))} · ${esc(p.e.h)}</td><td class="n">${p.e.s>0?'+':''}${p.e.s}</td><td class="n">${p.rel}</td><td class="n">${p.dec.toFixed(2)}</td><td class="n ${sgn(p.c)}">${p.c>0?'+':''}${p.c.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="mute">No news events are tagged to this stock, so its news score is neutral (0).</p>'}
 </div><div>
 ${liveFacts.length?`<h3>Live checks</h3><ul class="ev">${liveFacts.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>`:''}
 ${x.researched?`<h3 style="margin-top:12px">Catalysts <span class="mute sm">(AI research note, written ${esc(fmtD(x.rd))})</span></h3><ul class="ev">${x.cat.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>
 <h3 style="margin-top:12px">Risks <span class="mute sm">(same note; figures in it are as of ${esc(fmtD(x.rd))})</span></h3><ul class="ev">${x.rk.map(c=>`<li>${esc(c)}</li>`).join('')}${G?`<li>A close below ${money(G.stop,x.cur)}.</li>`:''}</ul>`:`<h3 style="margin-top:12px">Not researched yet</h3><p class="sm">Nobody has reviewed this company’s catalysts and risks, so the label is capped at Hold and confidence is 15 points lower. The numbers come straight from Yahoo Finance.</p>`}
 <h3 style="margin-top:12px">Sources and timestamps</h3><ul class="ev sm"><li>Price ${money(x.p,x.cur)} — ${ageTag(x)} — <a href="${esc(x.pu)}">${esc(x.ps)}</a></li><li>Forward P/E and earnings: ${x.valSrc==='research'?`research note dated ${esc(fmtDY(x.fd))} — <a href="${esc(x.fu||x.pu)}">source</a>`:`Yahoo Finance, date of the estimate unknown — <a href="${esc(x.fu||x.pu)}">source</a>`}</li><li>Analyst target: ${x.tgtSrc==='Yahoo'?'Yahoo Finance':x.fd?`research note dated ${esc(fmtDY(x.fd))}`:'n/a'}</li><li>52-week range: ${x.rangeSrc==='Yahoo'?'Yahoo Finance, same update as the price':'research note'}</li>${M.ind?`<li>Price history: ${M.ind.n} closes${M.ind.gaps?`, ${M.ind.gaps} missing day`:''}</li>`:''}<li>Scores, confidence, news sum and plan: calculated by this site’s engine (see <a href="#method">Method</a>).</li></ul></div></div>`;
 const s2=$('sfStrat');s2.innerHTML=Object.entries(STRAT).map(([k,v])=>`<option value="${k}">${esc(v.n)}</option>`).join('');s2.value=STRATK;
 s2.addEventListener('change',()=>{STRATK=s2.value;store.set('desk-strat',STRATK);document.querySelectorAll('.stratSel').forEach(o=>o.value=STRATK);topTable();screener(true);stockFile(t)});
 if(G){const upd=()=>{const a=parseFloat($('szA').value),r=parseFloat($('szR').value);sizer={acct:a>0?a:0,risk:r>0?Math.min(r,10):0};store.set('desk-size',sizer);$('szOut').innerHTML=sizeOut(x,G)};$('szA').addEventListener('input',upd);$('szR').addEventListener('input',upd)}
 const r=$('rng');
 const lo=Math.min(M.lo??x.p,G?G.stop:x.p,x.p),hi=Math.max(M.hi??x.p,G?G.tgt:x.p,x.p);
 const dr=()=>{const W=r.clientWidth;if(!W)return;const pl=12,pr=12,X=v=>pl+(W-pl-pr)*(v-lo)/((hi-lo)||1),y=62;
  let g='';if(M.lo!==null)g+=`<rect x="${X(M.lo)}" y="${y-5}" width="${X(M.hi)-X(M.lo)}" height="10" rx="5" fill="var(--sea)"/>`;
  if(G)g+=`<rect x="${X(G.eLo)}" y="${y-12}" width="${Math.max(3,X(G.eHi)-X(G.eLo))}" height="24" fill="var(--mag)" opacity=".28"/>`;
  const anc=v=>X(v)<70?'start':X(v)>W-70?'end':'middle';
  const mk=(v,lab,col,row)=>`<line x1="${X(v)}" x2="${X(v)}" y1="${y-16}" y2="${y+16}" stroke="${col}" stroke-width="2.5"/><text x="${X(v)}" y="${row===2?y-40:row===1?y-22:y+34}" text-anchor="${row===0?(v===M.lo?'start':'end'):anc(v)}" font-size="12" font-weight="600" fill="${col}">${esc(lab)}</text>`;
  if(M.lo!==null)g+=mk(M.lo,'52w low','var(--mute)',0)+mk(M.hi,'52w high','var(--mute)',0);
  if(G){g+=mk(G.stop,'Stop '+money(G.stop,x.cur),'var(--dn)',2);g+=mk(G.tgt,'Target '+money(G.tgt,x.cur),'var(--up)',1)}
  g+=`<circle cx="${X(x.p)}" cy="${y}" r="8" fill="var(--ink)" stroke="var(--bg)" stroke-width="2"/><text x="${X(x.p)}" y="${y+54}" text-anchor="${anc(x.p)}" font-size="13" font-weight="800" fill="var(--ink)">Now ${money(x.p,x.cur)}</text>`;
  r.innerHTML=g};
 if(!(x.m==='US'&&x.tv)&&H[x.t]){const sv=$('ownChart'),cl=H[x.t].filter(v=>v!==null).slice().reverse();const dw=()=>{const W=sv.clientWidth,H2=sv.clientHeight;if(!W||cl.length<2)return;const mn=Math.min(...cl),mx=Math.max(...cl),pd=(mx-mn)*.1||mn*.02,lo2=mn-pd,hi2=mx+pd,pl=56,pr=16,pt=12,pb=24,X=i=>pl+(W-pl-pr)*i/(cl.length-1),Y=v=>pt+(H2-pt-pb)*(1-(v-lo2)/(hi2-lo2));let g='';for(let i=0;i<=4;i++){const v=lo2+(hi2-lo2)*i/4;g+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pl-6}" y="${Y(v)+4}" text-anchor="end" font-size="12" fill="var(--mute)">${v.toFixed(v<10?3:2)}</text>`}const col=cl.at(-1)>=cl[0]?'var(--up)':'var(--dn)';g+=`<polyline fill="none" stroke="${col}" stroke-width="2.5" points="${cl.map((v,i)=>X(i)+','+Y(v)).join(' ')}"/><circle cx="${X(cl.length-1)}" cy="${Y(cl.at(-1))}" r="4" fill="${col}"/><text x="${pl}" y="${H2-6}" font-size="12" fill="var(--mute)">${cl.length} trading days ago</text><text x="${W-pr}" y="${H2-6}" text-anchor="end" font-size="12" fill="var(--mute)">latest</text>`;sv.innerHTML=g};if(window.__oro)window.__oro.disconnect();window.__oro=new ResizeObserver(dw);window.__oro.observe(sv)}
 if(x.m==='US'&&x.tv)tvWidget($('tvStock'),'advanced-chart',{autosize:true,symbol:x.tv,interval:'D',timezone:'Asia/Kuala_Lumpur',theme:dark()?'dark':'light',style:'1',allow_symbol_change:false,hide_top_toolbar:false,support_host:'https://www.tradingview.com'});
 if(window.__rro)window.__rro.disconnect();window.__rro=new ResizeObserver(dr);window.__rro.observe(r);
}

/* ================= MY STOCKS: watchlist + portfolio ================= */
let PORT=store.get('desk-port',[]);if(!Array.isArray(PORT))PORT=[];
function mine(){
 const pSel=$('pT');if(!pSel.options.length)pSel.innerHTML=S.slice().sort((a,b)=>a.t.localeCompare(b.t)).map(x=>`<option value="${esc(x.t)}">${esc(x.t)} — ${esc(x.n)}</option>`).join('');
 const W=[...WATCH].map(t=>S.find(x=>x.t===t)).filter(Boolean);
 $('watchTable').innerHTML=W.length?`<thead><tr><th class="st"></th><th>Stock</th><th class="n">Price</th><th class="n">Day</th><th>Label</th></tr></thead><tbody>${W.map(x=>{const e=E.evaluate(x,STRATK);return `<tr class="row" tabindex="0" data-t="${esc(x.t)}"><td class="st">${star(x.t)}</td><td><b>${esc(x.t)}</b> <span class="sm mute">${esc(x.n)}</span></td><td class="n">${money(x.p,x.cur)}</td><td class="n ${sgn(x.ch)}">${chg(x.ch)}</td><td>${e.bad?'':labelCell(e)}</td></tr>`}).join('')}</tbody>`:'<tbody><tr><td class="mute">Tap ☆ next to any stock in the screener or a stock file to add it here.</td></tr></tbody>';
 let totV=0,totC=0;const rows=PORT.map((h,i)=>{const x=S.find(s=>s.t===h.t);if(!x)return `<tr><td>${esc(h.t)}</td><td colspan="6" class="mute">No longer tracked</td><td><button type="button" class="sm" data-del="${i}">Remove</button></td></tr>`;
  const v=h.qty*x.p,c=h.qty*h.cost,toRM=x.cur==='USD'?FX:1;totV+=v*toRM;totC+=c*toRM;const e=E.evaluate(x,STRATK),stop=e.sig?e.sig.stop:null;
  return `<tr><td><a href="#stock-${esc(x.t.toLowerCase())}"><b>${esc(x.t)}</b></a></td><td class="n">${h.qty.toLocaleString('en-US')}</td><td class="n">${money(h.cost,x.cur)}</td><td class="n">${money(x.p,x.cur)}<br><span class="sm">${ageTag(x)}</span></td><td class="n">${money(v,x.cur)}</td><td class="n ${sgn(v-c)}">${money(v-c,x.cur)}<br><span class="sm">${pct(v/c-1)}</span></td><td>${e.bad?'':labelCell(e)}${stop?`<br><span class="sm">locked stop ${money(stop,x.cur)}</span>`:''}</td><td><button type="button" class="sm" data-del="${i}">Remove</button></td></tr>`}).join('');
 $('portTable').innerHTML=PORT.length?`<thead><tr><th>Stock</th><th class="n">Shares</th><th class="n">Avg cost</th><th class="n">Price</th><th class="n">Value</th><th class="n">Gain / loss</th><th>Label now</th><th></th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="4"><b>Total in ringgit</b> <span class="sm mute">(US holdings at USD/MYR ${FX.toFixed(4)})</span></td><td class="n"><b>RM${totV.toLocaleString('en-US',{maximumFractionDigits:0})}</b></td><td class="n ${sgn(totV-totC)}"><b>RM${(totV-totC).toLocaleString('en-US',{maximumFractionDigits:0})}</b><br><span class="sm">${pct(totC?totV/totC-1:null)}</span></td><td colspan="2"></td></tr></tfoot>`:'<tbody><tr><td class="mute">No holdings yet. Add one below. Holdings are saved only in this browser.</td></tr></tbody>'}
$('portForm').addEventListener('submit',ev=>{ev.preventDefault();const t=$('pT').value,q=parseFloat($('pQ').value),c=parseFloat($('pC').value);
 if(!(q>0)||!(c>0)){$('pMsg').textContent='Enter the number of shares and the average price you paid.';return}
 PORT.push({t,qty:q,cost:c,added:new Date().toISOString().slice(0,10)});store.set('desk-port',PORT);$('pQ').value='';$('pC').value='';$('pMsg').textContent=`Added ${q} ${t}.`;mine()});
$('portTable').addEventListener('click',ev=>{const b=ev.target.closest('[data-del]');if(!b)return;PORT.splice(+b.dataset.del,1);store.set('desk-port',PORT);mine()});
$('pT').addEventListener('change',()=>{const x=S.find(s=>s.t===$('pT').value);$('pCl').textContent=x?`Average price paid (${x.cur==='USD'?'US$':'RM'})`:'Average price paid'});

/* ================= SIGNAL RECORD ================= */
function trackView(){const T=E.track();
 $('trackSum').innerHTML=T.n?`<p><b>${T.n}</b> closed signal${T.n>1?'s':''}: ${T.target} reached target, ${T.stopped} stopped out, ${T.withdrawn} withdrawn, ${T.expired} expired. Average result ${pct(T.avg)} (measured from the entry midpoint).</p>`:'<p>No signal has closed yet, so there is no track record. It builds up automatically from here.</p>';
 const row=(s,open)=>{const x=S.find(y=>y.t===s.t),cur=s.cur;return `<tr><td><a href="#stock-${esc(s.t.toLowerCase())}"><b>${esc(s.t)}</b></a></td><td>${esc(fmtD(s.issued))}</td><td>${esc(s.label)}</td><td class="n">${money(s.entryLo,cur)}–${money(s.entryHi,cur)}</td><td class="n">${money(s.stop,cur)}</td><td class="n">${money(s.target,cur)}</td><td class="n">${open?money(x?x.p:null,cur):money(s.closePrice,cur)}</td><td class="n ${sgn(s.ret)}">${pct(s.ret)}</td><td>${open?(x&&x.p<=s.stop?'<span class="dn">at/below stop</span>':'open'):esc(s.outcome)+(s.closedOn?' '+esc(fmtD(s.closedOn)):'')}</td></tr>`};
 const head='<thead><tr><th>Stock</th><th>Issued</th><th>Label</th><th class="n">Entry</th><th class="n">Stop</th><th class="n">Target</th><th class="n">Price</th><th class="n">Result</th><th>Status</th></tr></thead>';
 $('trackOpen').innerHTML=T.open.length?head+'<tbody>'+T.open.map(s=>row(s,true)).join('')+'</tbody>':'<tbody><tr><td class="mute">No open signals.</td></tr></tbody>';
 $('trackClosed').innerHTML=T.closed.length?head+'<tbody>'+T.closed.slice().reverse().map(s=>row(s,false)).join('')+'</tbody>':'<tbody><tr><td class="mute">None yet.</td></tr></tbody>'}

/* ================= NEWS VIEW ================= */
function newsView(){const mk=$('nMkt').value,im=$('nImp').value;
 const L=N.filter(n=>(mk==='ALL'||n.mk.includes(mk))&&(im==='ALL'||(im==='NEG'&&n.s<0)||(im==='POS'&&n.s>0)||(im==='BIG'&&Math.abs(n.s)>=40))).sort((a,b)=>b.d.localeCompare(a.d));
 $('newsList').innerHTML=L.length?L.map(newsItem).join(''):'<p class="mute">Nothing matches these filters.</p>'}
['nMkt','nImp'].forEach(id=>$(id).addEventListener('change',newsView));

/* ================= SOURCES ================= */
const srcs=new Map();IDX.forEach(i=>srcs.set(i.u,i.k));E.R.S.forEach(x=>{srcs.set(x.pu,x.t+' price (research)');if(x.fu)srcs.set(x.fu,x.t+' fundamentals (research)')});N.forEach(n=>n.src.forEach(s=>srcs.set(s[1],s[0])));
$('srcList').innerHTML=[...srcs].map(([u,l])=>{let h='';try{h=new URL(u).hostname.replace('www.','')}catch(e){}return `<li><a href="${esc(u)}">${esc(l)}</a> <span class="mute">— ${esc(h)}</span></li>`}).join('');
$('methodCounts').textContent=`${S.length} stocks (${nUS} US, ${nMY} Bursa); ${S.filter(x=>x.researched).length} researched, ${S.filter(x=>!x.researched).length} not yet researched.`;

/* ================= MOOD EXPLAINER ================= */
const rx=$('regExplain');
$('regchips').addEventListener('click',ev=>{const b=ev.target.closest('[data-reg]');if(!b)return;
 const open=b.getAttribute('aria-expanded')==='true';document.querySelectorAll('[data-reg]').forEach(o=>o.setAttribute('aria-expanded','false'));
 if(open){rx.hidden=true;return}
 const r=REGX[b.dataset.reg];b.setAttribute('aria-expanded','true');
 rx.innerHTML=`<button type="button" class="close" id="rxClose">Close</button><h3>${esc(r.lab)}: ${esc(r.m.val)}</h3><p>${esc(r.mean)}</p><p class="ana">${esc(r.ana)}</p><p class="sm"><b>The numbers behind it</b></p><ul class="sm">${r.ev.map(e=>`<li>${esc(e)}</li>`).join('')}</ul><p class="sm"><b>What it means on this dashboard:</b> ${esc(r.page)}</p><p class="sm mute">Experts call this ${esc(r.m.term)}. ${esc(r.m.rule)} <a href="#" id="rxMore">See the full market details</a></p>`;
 rx.hidden=false});
rx.addEventListener('click',ev=>{if(ev.target.id==='rxClose'){rx.hidden=true;document.querySelectorAll('[data-reg]').forEach(o=>o.setAttribute('aria-expanded','false'))}
 if(ev.target.id==='rxMore'){ev.preventDefault();$('moodPanel').scrollIntoView({behavior:'smooth',block:'start'})}});

/* ================= ASK AI ================= */
const chat=$('chat'),st=$('askStatus'),qEl=$('q');let hist=[],busy=false,sample=null,gen=0,ctrl=null;
const PR=['Which 3 stocks look best for a dividend investor, and why?','Why is NVDA capped at Watchlist?','How might the December Fed hike affect Bursa?','Compare Maybank, CIMB and Public Bank','Which stocks carry the most risk right now?'];
$('prompts').innerHTML=PR.map(p=>`<button type="button" class="sm" data-p="${esc(p)}">${esc(p)}</button>`).join('');
$('prompts').addEventListener('click',ev=>{const b=ev.target.closest('[data-p]');if(b){qEl.value=b.dataset.p;ask()}});
function bubble(cls,text){const d=document.createElement('div');d.className='msg '+cls;d.textContent=text;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;return d}
async function ask(){const q=qEl.value.trim();if(!q||busy||!sample)return;
 busy=true;const my=++gen;$('askBtn').disabled=true;const ub=bubble('u',q);qEl.value='';const a=bubble('a','Thinking…');st.textContent='';
 const P=E.aiPayload(STRATK);const upd=P.pricesUpdated.research?`a research snapshot from ${whenMYT(P.pricesUpdated.research)}`:`prices updated Bursa ${whenMYT(P.pricesUpdated.MY)}, US ${whenMYT(P.pricesUpdated.US)}`;
 const sys=`You are the research assistant inside an investment dashboard covering ${P.counts.US} US and ${P.counts.MY} Bursa Malaysia stocks (${upd}). Answer ONLY from the JSON below. Never invent prices, figures, news or targets; if the answer needs data not in it, say so. When explaining a score use sub, why and caps. Stocks with researched:false have had no human/AI review of risks. Mention price age when it isn't a fresh close. Labels are formula outputs, not advice; end with a one-line reminder that this is not financial advice. Be concise (under 220 words), plain text. The user is a beginner: explain jargon with an everyday comparison.\n\nDATA:\n${JSON.stringify(P).replace(/</g,'\\u003c')}`;
 const msgs=[{role:'user',content:sys+'\n\n(Start of conversation.)'},{role:'assistant',content:'Understood. I will answer only from this data.'},...hist.slice(-6),{role:'user',content:q}];
 ctrl=new AbortController();
 try{const r=await sample(msgs,{cache:false,signal:ctrl.signal,onText:({text})=>{if(my===gen)a.textContent=text}});
  if(my!==gen)return;a.textContent=r.text;hist.push({role:'user',content:q},{role:'assistant',content:r.text});if(hist.length>12)hist=hist.slice(-12)}
 catch(err){if(my!==gen)return;a.remove();ub.remove();qEl.value=q;
  st.textContent=err&&err.code==='rate_limited'?'The AI is busy. Your question is back in the box; try again in a minute.':err&&err.code==='not_granted'?'Permission to use Ask AI was not granted.':'The AI could not answer just now. Your question is back in the box.'}
 finally{if(my===gen){busy=false;$('askBtn').disabled=false}}}
$('askForm').addEventListener('submit',ev=>{ev.preventDefault();ask()});
qEl.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.shiftKey&&!ev.isComposing){ev.preventDefault();ask()}});
$('clearBtn').addEventListener('click',()=>{gen++;if(ctrl)try{ctrl.abort()}catch(e){}hist=[];chat.innerHTML='';busy=false;$('askBtn').disabled=false;st.textContent=''});
const noAI=()=>{$('askOff').hidden=false;$('askForm').hidden=true;$('prompts').hidden=true};
if(window.claude&&window.claude.use){claude.use('sample').then(s=>{sample=s;if(!s)noAI()}).catch(noAI)}else noAI();

/* ================= TRADINGVIEW ================= */
const dark=()=>{const t=document.documentElement.dataset.theme;return t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches};
function tvWidget(box,kind,cfg){if(!box)return;box.innerHTML='';const c=document.createElement('div');c.className='tradingview-widget-container';c.style.height='100%';c.style.width='100%';const w=document.createElement('div');w.className='tradingview-widget-container__widget';w.style.height='100%';c.appendChild(w);
 const sc=document.createElement('script');sc.src='https://s3.tradingview.com/external-embedding/embed-widget-'+kind+'.js';sc.async=true;sc.textContent=JSON.stringify(Object.assign({locale:'en',colorTheme:dark()?'dark':'light',isTransparent:false},cfg));c.appendChild(sc);box.appendChild(c);
 setTimeout(()=>{if(!box.querySelector('iframe'))box.innerHTML='<p class="tvfail">The live TradingView view could not load here. It works on the website version of this dashboard with an internet connection.</p>'},8000)}
let liveDone=false,chartSym='NASDAQ:NVDA';
function liveChart(){tvWidget($('tvChart'),'advanced-chart',{autosize:true,symbol:chartSym,interval:'D',timezone:'Asia/Kuala_Lumpur',theme:dark()?'dark':'light',style:'1',allow_symbol_change:true,hide_side_toolbar:false,support_host:'https://www.tradingview.com'})}
function liveView(){board();if(liveDone)return;liveDone=true;
 const us=S.filter(x=>x.m==='US'&&x.tv);
 tvWidget($('tvTape'),'ticker-tape',{symbols:[{proName:'FOREXCOM:SPXUSD',title:'S&P 500'},{proName:'FOREXCOM:NSXUSD',title:'Nasdaq 100'},{proName:'FX_IDC:USDMYR',title:'USD/MYR'},{proName:'TVC:UKOIL',title:'Brent'},...us.slice(0,12).map(x=>({proName:x.tv,title:x.t}))],showSymbolLogo:true,displayMode:'adaptive'});
 $('tvPicks').innerHTML=[['S&P 500','FOREXCOM:SPXUSD'],['Nasdaq 100','FOREXCOM:NSXUSD'],...us.slice(0,14).map(x=>[x.t,x.tv])].map(([l,v])=>`<button type="button" class="sm" data-sym="${esc(v)}" aria-pressed="${v===chartSym}">${esc(l)}</button>`).join('');
 $('tvPicks').addEventListener('click',ev=>{const b=ev.target.closest('[data-sym]');if(!b)return;chartSym=b.dataset.sym;document.querySelectorAll('#tvPicks [data-sym]').forEach(o=>o.setAttribute('aria-pressed',o===b));liveChart()});
 $('bSort').addEventListener('change',board);
 liveChart();tvWidget($('tvScreener'),'screener',{width:'100%',height:'100%',defaultColumn:'overview',defaultScreen:'most_capitalized',market:'america',showToolbar:true})}
function board(){const so=$('bSort').value;const L=S.filter(x=>x.m==='MY').map(x=>({x,e:E.evaluate(x,STRATK)}));
 const k={ch:r=>-Math.abs(r.x.ch??0),up:r=>-(r.x.ch??-99),dn:r=>r.x.ch??99,score:r=>-(r.e.score??-1)}[so];L.sort((a,b)=>so==='t'?a.x.t.localeCompare(b.x.t):k(a)-k(b));
 const t=LIVE&&LIVE.mkUpdated&&LIVE.mkUpdated.MY;$('myUpd').textContent=t?`· updated ${whenMYT(t)}${E.marketOpen('MY')?' · market open':' · market closed'}`:'· research snapshot';
 $('bBoard').innerHTML=`<thead><tr><th>Stock</th><th class="n">Price</th><th class="n">Change</th><th>Score</th><th>Label</th></tr></thead><tbody>${L.map(({x,e})=>`<tr class="row" tabindex="0" data-t="${esc(x.t)}"><td><b>${esc(x.t)}</b> <span class="sm mute">${esc(x.n)}</span><br><span class="sm">${ageTag(x)}</span></td><td class="n">${money(x.p,x.cur)}</td><td class="n ${sgn(x.ch)}">${chg(x.ch)}</td><td style="min-width:120px">${e.bad?'':scoreCell(e.score)}</td><td>${e.bad?'':labelCell(e)}</td></tr>`).join('')}</tbody>`}

/* ================= ROUTER ================= */
const VIEWS=['command','live','screener','stock','mine','news','track','ask','method'];
function route(){const h=(location.hash||'#command').slice(1);let v=h.startsWith('stock-')?'stock':h;if(!VIEWS.includes(v))v='command';
 document.querySelectorAll('.view').forEach(s=>s.classList.toggle('on',s.id==='v-'+v));
 document.querySelectorAll('.nav a:not(.brand)').forEach(a=>{if(a.getAttribute('href')==='#'+(v==='stock'?'screener':v))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
 if(v==='live')liveView();if(v==='screener')screener();if(v==='stock')stockFile(h.slice(6));if(v==='news')newsView();if(v==='command'){topTable();draw()}if(v==='mine')mine();if(v==='track')trackView();
 window.scrollTo(0,0)}
header();kpis();topTable();screener(true);newsView();addEventListener('hashchange',route);route();
window.__desk={E,evaluate:E.evaluate,S};
}

(async()=>{
 [LIVE,SIGS]=await Promise.all([getJSON('data/desk.json'),getJSON('data/signals.json')]);
 try{start()}catch(e){document.body.insertAdjacentHTML('afterbegin','<p style="padding:16px">The page could not start. Please reload.</p>');console.error(e);return}
 // every 5 minutes: look for newer prices, and re-check how old the current ones are
 if(LIVE)setInterval(async()=>{const J=await getJSON('data/desk.json');
  if(J&&J.updated&&J.updated!==LIVE.updated){const nb=$('newData');nb.hidden=false;nb.innerHTML=`New prices are in (updated ${esc(E.hhmm(J.updated))}). <button type="button" class="pri" onclick="location.reload()">Refresh now</button>`;
   const ab=$('ageBanner');ab.hidden=false;ab.innerHTML=`New prices are in (updated ${esc(E.hhmm(J.updated))}) — <a href="javascript:location.reload()" style="color:inherit">tap to refresh</a>`;return}
  const E2=makeEngine({R:DESK_RESEARCH,live:LIVE,signals:SIGS,now:nowDate()}),st=E2.status(),ab=$('ageBanner');
  if(st.length){ab.hidden=false;ab.innerHTML=st.map(s=>esc(s.text)).join('<br>')}},300000);
})();
})();
