const known=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const difference=(a,b)=>a===null||b===null?null:Math.round((a-b)*100)/100;
const rate=(numerator,denominator)=>numerator===null||denominator===null||denominator===0?null:100*numerator/denominator;

function comparisonRow(current,previous){
 const sales=known(current?.sales),previousSales=known(previous?.sales),tickets=known(current?.tickets),previousTickets=known(previous?.tickets);
 const averageBasket=known(current?.averageBasket),previousBasket=known(previous?.averageBasket);
 const delta=difference(sales,previousSales);
 return {sales,previousSales,delta,change:rate(delta,previousSales),tickets,previousTickets,ticketsDelta:difference(tickets,previousTickets),averageBasket,previousBasket,basketDelta:difference(averageBasket,previousBasket),margin:known(current?.marginValue),marginRate:known(current?.marginRate),identifiedSales:known(current?.identifiedSales)};
}

function dates({startDate,endDate}={}){
 if(![startDate,endDate].every(date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)))return [];
 const start=Date.parse(startDate),end=Date.parse(endDate);
 const length=(end-start)/86400000+1;
 if(!Number.isInteger(length)||length<1||length>731)return [];
 return Array.from({length},(_,index)=>new Date(start+index*86400000).toISOString().slice(0,10));
}

function breakdown(rows,total){
 const usable=rows.filter(row=>known(row.delta)!==null);
 const subtotal=usable.length?usable.reduce((sum,row)=>sum+row.delta,0):null;
 return {total,subtotal:subtotal===null?null:Math.round(subtotal*100)/100,gap:difference(total,subtotal),known:usable.length,count:rows.length};
}

export function mergeDailyEvidence(parts,key){
 const dates=new Map();
 for(const part of parts)for(const row of part.daily?.[key]||[]){
  if(!row.date)continue;
  if(!dates.has(row.date))dates.set(row.date,[]);
  dates.get(row.date).push(row);
 }
 const add=(rows,field)=>{
  const values=rows.map(row=>known(row[field]));
  return values.includes(null)?null:values.reduce((total,value)=>total+value,0);
 };
 return [...dates].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>{
  const sales=add(rows,'sales'),tickets=add(rows,'tickets'),marginSalesBase=add(rows,'marginSalesBase'),marginValue=add(rows,'marginValue');
  return {date,sales,tickets,units:add(rows,'units'),averageBasket:sales!=null&&tickets?sales/tickets:null,marginSalesBase,marginValue,marginRate:rate(marginValue,marginSalesBase),identifiedSales:add(rows,'identifiedSales')};
 });
}

export function buildSalesProof(data){
 const current=new Map((data.daily?.current||[]).map(row=>[row.date,row]));
 const previous=new Map((data.daily?.previous||[]).map(row=>[row.date,row]));
 const currentDates=dates(data.period),previousDates=dates(data.comparison);
 const days=Array.from({length:Math.max(currentDates.length,previousDates.length)},(_,index)=>{
  const date=currentDates[index]||null,compareDate=previousDates[index]||null;
  return {date,compareDate,...comparisonRow(current.get(date),previous.get(compareDate))};
 });
 const stores=(data.stores||[]).map(row=>({
  name:row.storeName||row.storeCode||row.storeId,
  status:row.status==='READY'?'Disponible':'À vérifier',
  ...comparisonRow(row,{sales:row.previousSales,tickets:row.previousTickets,averageBasket:row.previousAverageBasket})
 }));
 const groups=(rows,key)=>rows.map(row=>{
  const prev=known(row.previousSales??row.previous),sales=known(row.sales),delta=difference(sales,prev);
  return {name:row.label||row.key,code:row.key,sales,previousSales:prev,delta,change:rate(delta,prev),margin:known(row.marginValue),marginRate:known(row.marginRate),identifiedSales:null,
   weight:known(row.sharePct),type:key};
 });
 const departments=groups(data.hierarchy?.department||[],'department'),products=groups(data.products||[],'product');
 const total=difference(known(data.summary?.current?.sales),known(data.summary?.previous?.sales));
 return {days,stores,departments,products,
  accounting:{days:breakdown(days,total),stores:breakdown(stores,total),departments:breakdown(departments,total),products:breakdown(products,total)}};
}
