export const CONTROL_STATES={CRITICAL:{label:'Intervenir',tone:'danger',order:0},WARNING:{label:'À suivre',tone:'warn',order:1},UNKNOWN:{label:'À vérifier',tone:'neutral',order:2},OK:{label:'Sous contrôle',tone:'ok',order:3}};
const n=v=>Number(v||0);
export function networkClock(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return{date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};
}
export function assessNetworkStore(row,{now=new Date()}={}){
 const clock=networkClock(now),reasons=[];
 const add=(state,label,page,value)=>reasons.push({state,label,page,value});
 const opened=row.day?.opening_status==='OPENED',closed=row.day?.closing_status==='CLOSED',parts=String(row.opening_time||'08:00').split(':').map(Number),openingDue=clock.minute>=parts[0]*60+parts[1];
 const stale=!!row.day?.business_date&&row.day.business_date!==clock.date;
 const known=row.dataHealth?.network!==false&&row.day?.business_date===clock.date;
 if(!known)add('UNKNOWN',stale?'Situation d’un autre jour':'Situation magasin indisponible','today');
 if(known){
  if(n(row.criticalIncidents))add('CRITICAL',`${row.criticalIncidents} incident(s) critique(s)`,'incidents',n(row.criticalIncidents));
  if(n(row.coldChain?.mismatch))add('CRITICAL',`${row.coldChain.mismatch} contrôle(s) froid en écart`,'coldChain');
  if(n(row.dlc?.expired))add('CRITICAL',`${row.dlc.expired} lot(s) périmé(s)`,'dlc');
  if(!opened&&!closed&&openingDue){
   const blockers=n(row.opening?.blockers)+n(row.staffing?.blocking)+n(row.coldChain?.blocking)+n(row.cashOpening?.blocking)+n(row.commercial?.blocking)+n(row.handover?.blocking);
   add(blockers?'CRITICAL':'WARNING',blockers?'Ouverture bloquée':'Ouverture non confirmée','opening');
  }
  if(n(row.escalatedIncidents)||n(row.overdueIncidents))add('WARNING',`${n(row.escalatedIncidents)+n(row.overdueIncidents)} alerte(s) en retard / escaladée(s)`,'incidents');
  if(n(row.dlc?.critical))add('WARNING',`${row.dlc.critical} DLC proche(s)`,'dlc');
  if(n(row.commercial?.pending)+n(row.commercial?.mismatch))add('WARNING',`${n(row.commercial.pending)+n(row.commercial.mismatch)} action(s) prix / promo`,'commercial');
  if(n(row.inventory?.pendingRecounts))add('WARNING',`${row.inventory.pendingRecounts} recomptage(s)`,'inventory');
  if(n(row.handover?.blocking))add('WARNING','Passation à traiter','handover');
  if(n(row.qualityRejected))add('WARNING','Réception avec refus qualité','quality');
  if(opened&&n(row.staffing?.blocking)&&row.staffing?.status!=='NOT_STARTED')add('WARNING','Équipe incomplète','staffing');
  if(opened&&n(row.cashOpening?.mismatch))add('WARNING','Écart de caisse à l’ouverture','cashOpening');
  if(n(row.loss?.blocking))add('WARNING','Démarque à traiter','loss');
  if(row.day?.closing_status==='IN_PROGRESS'&&n(row.cash?.blocking))add('WARNING','Clôture caisse à traiter','cash');
  if(opened&&[row.staffing,row.coldChain,row.cashOpening].some(s=>!s||s.status==='NOT_STARTED'))add('UNKNOWN','Contrôles d’ouverture incomplets','opening');
 }
 const pulse=row.businessPulse,pulseReady=pulse?.status==='READY'&&pulse.businessDate===clock.date&&now.getTime()-Date.parse(pulse.refreshedAt)<300000&&now.getTime()>=Date.parse(pulse.refreshedAt),k=pulseReady?pulse.snapshot?.kpis||{}:{};
 if(pulseReady&&pulse.comparison?.available&&k.changeVsComparison!=null&&Number(k.changeVsComparison)<=-10)add('WARNING',`CA ${Number(k.changeVsComparison).toFixed(1)} % vs D-7 même période`,'managerPerformance');
 if(pulseReady&&pulse.stock?.ruptureReady&&n(k.outOfStockCount))add('WARNING',`${k.outOfStockCount} rupture(s)`,'inventory');
 reasons.sort((a,b)=>CONTROL_STATES[a.state].order-CONTROL_STATES[b.state].order);
 const state=reasons[0]?.state||'OK';
 return{...row,control:{state,...CONTROL_STATES[state],reasons,primary:reasons[0]?.label||(closed?'Journée clôturée':opened?'Aucune alerte opérationnelle remontée':`Ouverture prévue à ${row.opening_time||'08:00'}`),phase:closed?'Clôturé':opened?'Ouvert':openingDue?'Ouverture attendue':'Préparation',pulseReady,kpis:k}};
}
export function controlOverview(rows){
 const counts={CRITICAL:0,WARNING:0,UNKNOWN:0,OK:0};for(const r of rows)counts[r.control.state]++;
 const salesRows=rows.filter(r=>r.control.pulseReady&&r.control.kpis.netSales!=null),sales=salesRows.length?salesRows.reduce((s,r)=>s+n(r.control.kpis.netSales),0):null;
 return{counts,total:rows.length,sales,salesCoverage:salesRows.length,opened:rows.filter(r=>r.control.phase==='Ouvert').length};
}
export function selectControlRows(rows,{filter='ALL',query=''}={}){
 const q=query.trim().toLocaleLowerCase('fr');
 return rows.filter(r=>(filter==='ALL'||filter==='ATTENTION'&&['CRITICAL','WARNING','UNKNOWN'].includes(r.control.state)||r.control.state===filter)&&`${r.name} ${r.code} ${r.day?.opening_owner_name||''}`.toLocaleLowerCase('fr').includes(q)).sort((a,b)=>a.control.order-b.control.order||b.control.reasons.length-a.control.reasons.length||String(a.name).localeCompare(String(b.name),'fr'));
}
