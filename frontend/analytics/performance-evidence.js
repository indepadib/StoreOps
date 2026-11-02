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
