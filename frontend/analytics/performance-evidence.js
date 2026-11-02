// Display only measures supported by the prepared, scoped sales evidence.
const finite=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
export function evolution(current,previous){
  const a=finite(current),b=finite(previous);
  return{delta:a!=null&&b!=null?a-b:null,pct:a!=null&&b>0?(a-b)/b*100:null};
}
export function ratio(value,total){const a=finite(value),b=finite(total);return a!=null&&b>0?a/b*100:null;}
export function matchesEvidence(data,scope,stores){
  return !!data&&data.period?.startDate===scope?.periodStart&&data.period?.endDate===scope?.periodEnd&&data.comparison?.startDate===scope?.compareStart&&data.comparison?.endDate===scope?.compareEnd&&JSON.stringify((data.stores||[]).map(s=>s.storeId||s.id).sort())===JSON.stringify((stores||[]).map(s=>s.id).sort());
}
export function marginEvidence(data,previous=false){
  const m=data?.margin||{},s=data?.summary?.[previous?'previous':'current']||{},covered=m[previous?'previousCovered':'covered'];
  // Previous full margin must itself have a published amount; current status alone
  // never authorizes publishing a diagnostic amount from either period.
  const full=(previous||m.available===true&&['VALIDATED','ESTIMATED'].includes(m.status))&&finite(s.marginValue)!=null&&finite(s.marginSalesBase)>0;
  if(full)return{kind:'FULL',value:Number(s.marginValue),rate:Number(s.marginValue)/Number(s.marginSalesBase)*100,coverage:previous?null:finite(m.coveragePct),estimated:previous?covered?.estimated===true:m.estimated===true||m.status==='ESTIMATED',salesHT:Number(s.marginSalesBase),unvaluedSalesTTC:0};
  if(covered&&finite(covered.valueHT)!=null&&finite(covered.salesHT)>0&&finite(covered.coveragePct)>0&&finite(covered.coveragePct)<=100)return{kind:'PARTIAL',value:Number(covered.valueHT),rate:Number(covered.valueHT)/Number(covered.salesHT)*100,coverage:Number(covered.coveragePct),estimated:covered.estimated===true,salesHT:Number(covered.salesHT),unvaluedSalesTTC:finite(covered.unvaluedSalesTTC)};
  return{kind:'UNAVAILABLE',value:null,rate:null,coverage:finite(m.coveragePct),estimated:false,salesHT:null,unvaluedSalesTTC:null};
}
export function promotionEvidence(data){
  const c=data?.summary?.current||{},p=data?.summary?.previous||{};
  const currentShare=ratio(c.promotionSales,c.sales),previousShare=ratio(p.promotionSales,p.sales),currentTicketShare=ratio(c.promotionTickets,c.tickets),previousTicketShare=ratio(p.promotionTickets,p.tickets);
  return{current:c,previous:p,sales:evolution(c.promotionSales,p.promotionSales),tickets:evolution(c.promotionTickets,p.promotionTickets),discounts:evolution(c.discountAmount,p.discountAmount),currentShare,previousShare,shareDelta:currentShare!=null&&previousShare!=null?currentShare-previousShare:null,currentTicketShare,previousTicketShare,ticketShareDelta:currentTicketShare!=null&&previousTicketShare!=null?currentTicketShare-previousTicketShare:null};
}

export function calendarDays(start,end){
  const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
  if(!valid(start)||!valid(end)||end<start)return null;
  return Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)+1;
}
export function dailyComparison(current,previous,scope){
  const days=calendarDays(scope?.periodStart,scope?.periodEnd),previousDays=calendarDays(scope?.compareStart,scope?.compareEnd),a=finite(current),b=finite(previous);
  const value=days&&a!=null?a/days:null,reference=previousDays&&b!=null?b/previousDays:null;
  return{days,previousDays,value,previous:reference,...evolution(value,reference)};
}
const escapeMetric=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const metricNumber=(v,digits=2)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:digits}).format(v);
function metricValue(value,unit,digits){return finite(value)==null?'À compléter':new Intl.NumberFormat('fr-FR',{minimumFractionDigits:unit==='money'?2:0,maximumFractionDigits:digits}).format(Number(value))+(unit==='money'?' DH':unit==='percent'?' %':'');}
// One hierarchy for every comparative KPI: value, reference, change, then daily pace.
export function performanceCard({label,value,previous=null,unit='number',digits=2,daily=false,scope={},changeMode='percent',note='',positiveGood=false,estimated=false,emphasis=false}){
  const a=finite(value),b=finite(previous),delta=evolution(a,b),dailyValue=dailyComparison(a,b,scope),points=a!=null&&b!=null?a-b:null;
  const movement=changeMode==='points'?points:delta.pct,sign=movement>0?'+':'',tone=positiveGood&&movement!=null?(movement>0?'up':movement<0?'down':'flat'):'neutral';
  const changeLabel=changeMode==='none'?'':movement!=null?sign+metricNumber(movement,2)+(changeMode==='points'?' points':' %'):b===0&&a!=null?(a===0?'Stable · base nulle':'Base précédente nulle'):'Comparaison indisponible';
  const absolute=changeMode==='percent'&&delta.delta!=null?(delta.delta>0?'+':'')+metricValue(delta.delta,unit,digits):'';
  const max=Math.max(Math.abs(a||0),Math.abs(b||0));
  const bars=changeMode!=='none'&&a!=null&&b!=null&&a>=0&&b>=0&&max>0?`<div class="metric-comparison-bars" aria-hidden="true"><i style="width:${b/max*100}%"></i><b style="width:${a/max*100}%"></b></div>`:'';
  const dailyHtml=daily?`<div class="metric-daily"><div><span>Moyenne / jour</span><strong>${escapeMetric(metricValue(dailyValue.value,unit,2))}</strong></div><p>Avant : ${escapeMetric(metricValue(dailyValue.previous,unit,2))} / jour${dailyValue.pct!=null?' · '+escapeMetric((dailyValue.pct>0?'+':'')+metricNumber(dailyValue.pct,2)+' %'):''}</p><small>${dailyValue.days??'—'} jours calendaires · comparaison ${dailyValue.previousDays??'—'} jours</small></div>`:'';
  return `<article class="performance-card${emphasis?' performance-card--margin':''}${unit==='money'?' performance-card--money':''}"><div class="metric-title">${escapeMetric(label)}</div><strong class="metric-value">${estimated?'≈ ':''}${escapeMetric(metricValue(a,unit,digits))}</strong>${changeMode!=='none'?`<div class="metric-evolution ${tone}">${escapeMetric(changeLabel)}${absolute?`<span>${escapeMetric(absolute)}</span>`:''}</div><p class="metric-reference">Avant : <strong>${escapeMetric(metricValue(b,unit,digits))}</strong></p>`:''}${bars}${dailyHtml}${note?`<p class="metric-note">${escapeMetric(note)}</p>`:''}</article>`;
}
