export function paymentPeriod(date,grain){
 if(grain==='day')return date;
 if(grain==='month')return date.slice(0,7);
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const year=d.getUTCFullYear(),week=Math.ceil((((d-Date.UTC(year,0,1,12))/86400000)+1)/7);return year+'-S'+String(week).padStart(2,'0');
}
export function paymentHistoryRows(reports,{grain='month',manual=true,methods='card',byStore=true,start='',end=''}={}){
 if(!reports.length||reports.some(r=>r.status!=='READY'))throw Error('Historique incomplet : total suspendu.');
 const groups=new Map();
 for(const report of reports)for(const row of report.rows){
  if(start&&row.date<start||end&&row.date>end||!manual&&row.kind==='CARD_MANUAL'||methods==='card'&&!['CARD_TPE','CARD_MANUAL'].includes(row.kind))continue;
  const period=paymentPeriod(row.date,grain),store=byStore?(report.storeName||report.storeId):'Réseau sélectionné',key=JSON.stringify([period,store,row.currency,row.tender,row.label,row.kind]);
  const item=groups.get(key)||{period,store,currency:row.currency,tender:row.tender,label:row.label,kind:row.kind,positiveMinor:0,negativeMinor:0,netMinor:0,lines:0};
  for(const field of ['positiveMinor','negativeMinor','netMinor','lines']){item[field]+=row[field];if(!Number.isSafeInteger(item[field]))throw Error('Précision monétaire dépassée.');}groups.set(key,item);
 }
 return[...groups.values()].map(r=>({...r,positive:r.positiveMinor/100,negative:r.negativeMinor/100,net:r.netMinor/100})).sort((a,b)=>a.period.localeCompare(b.period)||a.store.localeCompare(b.store)||a.currency.localeCompare(b.currency)||a.tender.localeCompare(b.tender));
}
export function paymentTotals(rows){
 const groups=new Map();for(const row of rows){const total=groups.get(row.currency)||{currency:row.currency,positiveMinor:0,negativeMinor:0,netMinor:0};for(const field of ['positiveMinor','negativeMinor','netMinor']){total[field]+=row[field];if(!Number.isSafeInteger(total[field]))throw Error('Précision monétaire dépassée.');}groups.set(row.currency,total)}return[...groups.values()].map(r=>({currency:r.currency,positive:r.positiveMinor/100,negative:r.negativeMinor/100,net:r.netMinor/100}));
}
