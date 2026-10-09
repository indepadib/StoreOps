export const CONTROL_STATES={CRITICAL:{label:'Intervenir',tone:'danger',order:0},WARNING:{label:'À suivre',tone:'warn',order:1},UNKNOWN:{label:'À vérifier',tone:'neutral',order:2},OK:{label:'Sous contrôle',tone:'ok',order:3}};
const n=v=>Number(v||0);
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
export const NETWORK_FRESH_MS=300000;
export function networkClock(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return{date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};
}
export function networkSalesStatus(row,{now=new Date()}={}){
 const pulse=row.businessPulse;
 if(!pulse)return{state:'UNREAD',label:'Chiffres non chargés',kpis:{},comparisonReady:false};
 if(pulse.status!=='READY'||!finite(pulse.snapshot?.kpis?.netSales))return{state:'UNAVAILABLE',label:'Ventes indisponibles',kpis:{},comparisonReady:false};
 const at=Date.parse(pulse.refreshedAt),age=now.getTime()-at;
 if(pulse.businessDate!==networkClock(now).date||!Number.isFinite(age)||age<0||age>=NETWORK_FRESH_MS)return{state:'STALE',label:'Ventes à actualiser',kpis:{},comparisonReady:false};
 const partial=!!pulse.diagnostics?.truncated,kpis=pulse.snapshot.kpis;
 return{state:partial?'PARTIAL':'FRESH',label:partial?'Lecture des ventes incomplète':'Chiffres disponibles',kpis,comparisonReady:!partial&&pulse.comparison?.available===true&&finite(kpis.comparison)&&!pulse.diagnostics?.comparisonTruncated};
}
export function networkSalesEvidence(row,{now=new Date()}={}){
 const sales=networkSalesStatus(row,{now}),pulse=row.businessPulse;
 if(sales.state!=='FRESH')return{available:false,message:sales.label};
 if(!sales.comparisonReady)return{available:false,message:'Comparatif D-7 indisponible à même période'};
 const a=pulse.analysis||{},d=a.decomposition,valid=d&&['ticketContribution','basketContribution','currentTickets','previousTickets','currentBasket','previousBasket'].every(k=>finite(d[k]));
 const delta=Number(sales.kpis.netSales)-Number(sales.kpis.comparison);
 const mechanism=valid?(Number(d.currentTickets)<Number(d.previousTickets)&&Number(d.currentBasket)<Number(d.previousBasket)?'TRAFFIC_AND_BASKET':Number(d.currentTickets)<Number(d.previousTickets)?'TRAFFIC':Number(d.currentBasket)<Number(d.previousBasket)?'BASKET':delta>0?'UP':'STABLE'):'UNKNOWN';
 const message={TRAFFIC_AND_BASKET:'Moins de tickets et un panier moyen plus faible.',TRAFFIC:'Le nombre de tickets diminue.',BASKET:'Le panier moyen diminue.',UP:'L’activité progresse.',STABLE:'L’activité reste stable.',UNKNOWN:'Écart de CA disponible ; détail tickets / panier insuffisant.'}[mechanism];
 const departments=(a.departmentDrivers||[]).filter(r=>finite(r.delta)&&Number(r.delta)<0).sort((a,b)=>Number(a.delta)-Number(b.delta)).slice(0,3);
 return{available:true,message,delta,decomposition:valid?d:null,departments,stockRisk24h:pulse.stock?.ruptureReady&&finite(a.salesRisk24h)?Number(a.salesRisk24h):null};
}
export function assessNetworkStore(row,{now=new Date()}={}){
 const clock=networkClock(now),reasons=[];
 const add=(state,label,page,value)=>reasons.push({state,label,page,value});
 const opened=row.day?.opening_status==='OPENED',closed=row.day?.closing_status==='CLOSED',parts=String(row.opening_time||'08:00').split(':').map(Number),openingDue=clock.minute>=parts[0]*60+parts[1];
 const stale=!!row.day?.business_date&&row.day.business_date!==clock.date;
 const age=row.snapshotAt?now.getTime()-Date.parse(row.snapshotAt):0,staleSnapshot=!Number.isFinite(age)||age<0||age>=NETWORK_FRESH_MS;
 const known=row.dataHealth?.network!==false&&row.day?.business_date===clock.date&&!staleSnapshot;
 if(!known)add('UNKNOWN',stale?'Situation d’un autre jour':staleSnapshot?'Situation à actualiser':'Situation magasin indisponible','today');
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
  if(n(row.loss?.blocking))add('WARNING','Démarque à traiter','losses');
  if(row.day?.closing_status==='IN_PROGRESS'&&n(row.cash?.blocking))add('WARNING','Clôture caisse à traiter','cash');
  if(opened&&[row.staffing,row.coldChain,row.cashOpening].some(s=>!s||s.status==='NOT_STARTED'))add('UNKNOWN','Contrôles d’ouverture incomplets','opening');
 }
 const pulse=row.businessPulse,sales=networkSalesStatus(row,{now}),pulseReady=sales.state==='FRESH',k=sales.kpis;
 if(['UNAVAILABLE','STALE','PARTIAL'].includes(sales.state))add('UNKNOWN',sales.label,'managerPerformance');
 if(sales.comparisonReady&&k.changeVsComparison!=null&&Number(k.changeVsComparison)<=-10)add('WARNING',`CA ${Number(k.changeVsComparison).toFixed(1)} % vs D-7 même période`,'managerPerformance');
 if(pulseReady&&pulse.stock?.ruptureReady&&n(k.outOfStockCount))add('WARNING',`${k.outOfStockCount} rupture(s)`,'inventory');
 reasons.sort((a,b)=>CONTROL_STATES[a.state].order-CONTROL_STATES[b.state].order);
 const state=reasons[0]?.state||'OK';
 return{...row,control:{state,...CONTROL_STATES[state],reasons,primary:reasons[0]?.label||(closed?'Journée clôturée':opened?'Aucune alerte opérationnelle remontée':`Ouverture prévue à ${row.opening_time||'08:00'}`),phase:closed?'Clôturé':opened?'Ouvert':openingDue?'Ouverture attendue':'Préparation',pulseReady,sales,kpis:k}};
}
export function controlOverview(rows){
 const counts={CRITICAL:0,WARNING:0,UNKNOWN:0,OK:0};for(const r of rows)counts[r.control.state]++;
 const salesRows=rows.filter(r=>r.control.pulseReady&&r.control.kpis.netSales!=null),sales=salesRows.length?salesRows.reduce((s,r)=>s+n(r.control.kpis.netSales),0):null;
 const comparable=salesRows.filter(r=>r.control.sales.comparisonReady),current=comparable.reduce((s,r)=>s+n(r.control.kpis.netSales),0),previous=comparable.reduce((s,r)=>s+n(r.control.kpis.comparison),0);
 return{counts,total:rows.length,sales,salesCoverage:salesRows.length,opened:rows.filter(r=>r.control.phase==='Ouvert').length,comparison:{coverage:comparable.length,current:comparable.length?current:null,previous:comparable.length?previous:null,delta:comparable.length?current-previous:null,change:comparable.length&&previous>0?(current-previous)/previous*100:null}};
}
export function selectControlRows(rows,{filter='ALL',query=''}={}){
 const q=query.trim().toLocaleLowerCase('fr');
 return rows.filter(r=>(filter==='ALL'||filter==='ATTENTION'&&['CRITICAL','WARNING','UNKNOWN'].includes(r.control.state)||r.control.state===filter)&&`${r.name} ${r.code} ${r.day?.opening_owner_name||''}`.toLocaleLowerCase('fr').includes(q)).sort((a,b)=>a.control.order-b.control.order||b.control.reasons.length-a.control.reasons.length||String(a.name).localeCompare(String(b.name),'fr'));
}
