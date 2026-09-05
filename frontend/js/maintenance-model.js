export const EQUIPMENT_TYPES=[['POS','Caisse / POS'],['TPE','TPE'],['SCALE','Balance'],['PRINTER','Imprimante'],['COLD','Meuble froid'],['FREEZER','Surgélateur'],['NETWORK','Réseau / Internet'],['PDA','PDA / Scanner'],['DOOR','Porte / Rideau'],['ALARM','Alarme'],['CCTV','Caméra / CCTV'],['LIGHTING','Éclairage'],['ELECTRICAL','Électricité'],['OTHER','Autre']];
export const IMPACTS={DEGRADED:{label:'Service dégradé',blockingLevel:'PROCESS',criticality:'MEDIUM'},CHECKOUT:{label:'Encaissement impacté',blockingLevel:'TRANSACTION',criticality:'HIGH'},OPENING:{label:'Bloque ouverture',blockingLevel:'STORE_OPENING',criticality:'CRITICAL'},CLOSING:{label:'Bloque fermeture',blockingLevel:'STORE_CLOSING',criticality:'CRITICAL'},NONE:{label:'Sans blocage immédiat',blockingLevel:'NONE',criticality:'LOW'}};
export function equipmentLabel(code){return EQUIPMENT_TYPES.find(x=>x[0]===code)?.[1]||code||'Équipement'}
export function buildMaintenanceIncident({equipmentType='OTHER',equipmentId='',issue='',details='',impact='DEGRADED',criticality='',assignedTo=null,dueAt=null}={}){
 const type=equipmentLabel(equipmentType),asset=String(equipmentId||'').trim(),problem=String(issue||'').trim();if(!problem)throw new Error('Décrire la panne ou le défaut.');
 const rule=IMPACTS[impact]||IMPACTS.DEGRADED,crit=criticality||rule.criticality;
 const title=[type,asset,problem].filter(Boolean).join(' · ');
 const description=[`Équipement : ${type}${asset?' / '+asset:''}`,`Impact : ${rule.label}`,String(details||'').trim()].filter(Boolean).join('\n');
 return{title,description,category:'TECHNICAL',criticality:crit,blockingLevel:rule.blockingLevel,assignedTo:assignedTo||null,dueAt:dueAt||null,requiresEvidence:crit==='CRITICAL'||rule.blockingLevel!=='NONE'};
}
export function maintenanceSummary(items=[]){
 const technical=(items||[]).filter(x=>x?.category==='TECHNICAL'),open=technical.filter(x=>x.status==='OPEN'),resolved=technical.filter(x=>x.status==='RESOLVED');
 const overdue=open.filter(x=>x.is_overdue||x.sla?.state==='BREACHED').length,critical=open.filter(x=>x.criticality==='CRITICAL').length,blocking=open.filter(x=>x.blocking_level&&x.blocking_level!=='NONE').length;
 const byType=new Map();for(const x of open){const type=String(x.title||'').split(' · ')[0]||'Autre';byType.set(type,(byType.get(type)||0)+1)}
 const topEquipment=[...byType.entries()].sort((a,b)=>b[1]-a[1])[0]||null;
 return{technical,open,resolved,openCount:open.length,critical,overdue,blocking,topEquipment};
}
