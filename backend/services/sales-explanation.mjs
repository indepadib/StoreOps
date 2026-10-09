const round=v=>Math.round((v+Number.EPSILON)*100)/100;
const pct=(a,b)=>b?round((a-b)/b*100):null;
export function hourlyComparison(current,prior,cutoffMinute=null){
 const now=new Map((current.hourly||[]).map(r=>[Number(r.key),r])),old=new Map((prior?.hourly||[]).map(r=>[Number(r.key),r]));
 let currentCumulative=0,previousCumulative=0;
 return Array.from({length:cutoffMinute===null?24:Math.floor(cutoffMinute/60)+1},(_,hour)=>{
  const sales=Number(now.get(hour)?.sales||0),previous=prior?Number(old.get(hour)?.sales||0):null;
  currentCumulative+=sales;previousCumulative+=previous||0;
  return{hour,label:`${String(hour).padStart(2,'0')}:00`,partial:cutoffMinute!==null&&hour===Math.floor(cutoffMinute/60),sales,previous,delta:previous===null?null:round(sales-previous),tickets:now.get(hour)?.tickets??0,previousTickets:prior?old.get(hour)?.tickets??0:null,currentCumulative:round(currentCumulative),previousCumulative:prior?round(previousCumulative):null};
 });
}
export function salesExplanation(current,prior,stock={}){
 const availability={stock:stock.ruptureReady?'READY':'UNAVAILABLE',causality:'NOT_ESTABLISHED',riskBasis:'RECENT_SALES_RATE_24H'};
 if(!prior||!current.tickets||!prior.tickets)return{decomposition:null,basketDrivers:null,availability};
 const ca=Number(current.netSales),pa=Number(prior.netSales),ct=Number(current.tickets),pt=Number(prior.tickets),cb=ca/ct,pb=pa/pt;
 const ticketContribution=(ct-pt)*pb,basketContribution=ct*(cb-pb);
 const cu=Number(current.units),pu=Number(prior.units),citems=cu/ct,pitems=pu/pt,cprice=cu>0?ca/cu:null,pprice=pu>0?pa/pu:null;
 return{decomposition:{salesDelta:round(ca-pa),ticketContribution:round(ticketContribution),basketContribution:round(basketContribution),currentTickets:ct,previousTickets:pt,currentBasket:round(cb),previousBasket:round(pb),basis:'TICKETS_THEN_BASKET'},basketDrivers:cu>0&&pu>0?{currentItemsPerTicket:round(citems),previousItemsPerTicket:round(pitems),itemsPerTicketChangePct:pct(citems,pitems),currentSalesPerUnit:round(cprice),previousSalesPerUnit:round(pprice),salesPerUnitChangePct:pct(cprice,pprice),quantityContribution:round((citems-pitems)*pprice),priceMixContribution:round(citems*(cprice-pprice)),basis:'QUANTITY_THEN_PRICE_MIX'}:null,availability};
}
