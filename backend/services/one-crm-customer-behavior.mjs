const DAY=86400000,round=v=>Math.round(v*100)/100;
const stamp=d=>Date.parse(d+'T00:00:00Z');
const dateInZone=instant=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant)).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day};
export function summarizeCustomerBehavior(tickets,checkedAt){
 const asOf=dateInZone(checkedAt),today=stamp(asOf),days=[...new Set(tickets.map(t=>t.date))].sort(),stores=new Map(),products=new Map();
 let total=0,last30=0,last90=0;
 for(const t of tickets){
  const age=(today-stamp(t.date))/DAY;if(!Number.isInteger(age)||age<0)throw Error('Invalid behavior date');
  total+=t.positiveTtc;if(age<30)last30++;if(age<90)last90++;
  const store=stores.get(t.storeId)||{storeId:t.storeId,tickets:0,positiveTtc:0};store.tickets++;store.positiveTtc+=t.positiveTtc;stores.set(t.storeId,store);
  const seen=new Set();
  for(const i of t.items){
   const r=products.get(i.productNumber)||{productNumber:i.productNumber,productName:i.productName||null,tickets:0,positiveTtc:0};
   if(!seen.has(i.productNumber)){r.tickets++;seen.add(i.productNumber)}
   r.positiveTtc+=i.positiveTtc;if(!r.productName&&i.productName)r.productName=i.productName;products.set(i.productNumber,r);
  }
 }
 const rank=(a,b)=>b.tickets-a.tickets||b.positiveTtc-a.positiveTtc;
 const storeBreakdown=[...stores.values()].sort((a,b)=>rank(a,b)||a.storeId.localeCompare(b.storeId)).map(x=>({...x,positiveTtc:round(x.positiveTtc)}));
 const best=storeBreakdown[0],favoriteStore=best&&storeBreakdown.filter(x=>x.tickets===best.tickets).length===1?best.storeId:null;
 const topProducts=[...products.values()].sort((a,b)=>rank(a,b)||a.productNumber.localeCompare(b.productNumber)).slice(0,10).map(x=>({...x,positiveTtc:round(x.positiveTtc)}));
 return {basis:'OBSERVED_POSITIVE_PURCHASE_HISTORY',asOf,averageBasket:tickets.length?round(total/tickets.length):null,recencyDays:days.length?(today-stamp(days.at(-1)))/DAY:null,shoppingDays:days.length,averageDaysBetweenVisits:days.length>1?round((stamp(days.at(-1))-stamp(days[0]))/DAY/(days.length-1)):null,ticketsLast30Days:last30,ticketsLast90Days:last90,distinctProducts:products.size,favoriteStore,storeBreakdown,topProducts};
}
