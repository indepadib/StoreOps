const num=v=>Number.isFinite(Number(v))?Number(v):0;
const round=v=>Math.round((Number(v)||0)*1000)/1000;
export function receiptMetrics(receipt={}){
 const lines=receipt.lines||[],controlled=lines.filter(l=>!!l.quality_control_id),pending=lines.length-controlled.length;
 let orderedControlled=0,delivered=0,accepted=0,rejected=0,shortQty=0,overQty=0,varianceLines=0,rejectedLines=0;
 for(const l of controlled){
  const ordered=num(l.ordered_qty),d=num(l.delivered_qty),a=num(l.accepted_qty),r=num(l.rejected_qty),variance=d-ordered;
  orderedControlled+=ordered;delivered+=d;accepted+=a;rejected+=r;
  if(variance<0)shortQty+=Math.abs(variance);if(variance>0)overQty+=variance;if(Math.abs(variance)>.0001)varianceLines++;if(r>0)rejectedLines++;
 }
 const totalOrdered=lines.reduce((s,l)=>s+num(l.ordered_qty),0),acceptanceRate=delivered>0?Math.round((accepted/delivered)*1000)/10:100;
 return{lines:lines.length,controlled:controlled.length,pending,totalOrdered:round(totalOrdered),orderedControlled:round(orderedControlled),delivered:round(delivered),accepted:round(accepted),rejected:round(rejected),shortQty:round(shortQty),overQty:round(overQty),varianceLines,rejectedLines,acceptanceRate,hasException:varianceLines>0||rejectedLines>0};
}
export function lineReceiptMetrics(line={}){
 if(!line.quality_control_id)return{controlled:false,variance:null,shortQty:0,overQty:0,rejected:num(line.rejected_qty),status:'PENDING'};
 const ordered=num(line.ordered_qty),delivered=num(line.delivered_qty),rejected=num(line.rejected_qty),variance=round(delivered-ordered);
 return{controlled:true,variance,shortQty:variance<0?Math.abs(variance):0,overQty:variance>0?variance:0,rejected,status:rejected>0?'QUALITY_EXCEPTION':Math.abs(variance)>.0001?'QUANTITY_EXCEPTION':'OK'};
}
export function supplierMetrics(receipts=[]){
 const map=new Map();
 for(const r of receipts||[]){const vendor=String(r.vendor||'Fournisseur inconnu'),m=receiptMetrics(r),x=map.get(vendor)||{vendor,receipts:0,lines:0,controlled:0,delivered:0,accepted:0,rejected:0,shortQty:0,overQty:0,varianceLines:0,rejectedLines:0};x.receipts++;x.lines+=m.lines;x.controlled+=m.controlled;x.delivered+=m.delivered;x.accepted+=m.accepted;x.rejected+=m.rejected;x.shortQty+=m.shortQty;x.overQty+=m.overQty;x.varianceLines+=m.varianceLines;x.rejectedLines+=m.rejectedLines;map.set(vendor,x)}
 return[...map.values()].map(x=>({...x,delivered:round(x.delivered),accepted:round(x.accepted),rejected:round(x.rejected),shortQty:round(x.shortQty),overQty:round(x.overQty),acceptanceRate:x.delivered>0?Math.round((x.accepted/x.delivered)*1000)/10:100,exceptionLines:x.varianceLines+x.rejectedLines})).sort((a,b)=>b.exceptionLines-a.exceptionLines||b.rejected-a.rejected||a.vendor.localeCompare(b.vendor));
}
