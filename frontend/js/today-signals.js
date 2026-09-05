const dateOnly=v=>String(v||'').slice(0,10);
export function summarizeReceipts(receipts=[],today=new Date().toISOString().slice(0,10)){
 const active=(receipts||[]).filter(r=>r?.status!=='POSTED');
 const pendingLines=active.reduce((sum,r)=>sum+(r.lines||[]).filter(l=>!l.quality_control_id).length,0);
 const controlledLines=active.reduce((sum,r)=>sum+(r.lines||[]).filter(l=>!!l.quality_control_id).length,0);
 const overdue=active.filter(r=>{const eta=dateOnly(r?.eta);return eta&&eta<today}).length;
 const dueToday=active.filter(r=>dateOnly(r?.eta)===today).length;
 return{activeReceipts:active.length,pendingLines,controlledLines,overdue,dueToday,blocking:pendingLines};
}
export function summarizeQualityToday(rows=[],today=new Date().toISOString().slice(0,10)){
 const daily=(rows||[]).filter(r=>dateOnly(r?.created_at)===today);
 const rejected=daily.reduce((s,r)=>s+Number(r?.rejected_qty||0),0);
 const nonConform=daily.filter(r=>r?.decision&&r.decision!=='ACCEPT').length;
 const temperatureNok=daily.filter(r=>r?.temperature_status==='NOK').length;
 return{controls:daily.length,rejected,nonConform,temperatureNok};
}
