import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { db, uid, audit, todayISO } from '../db.mjs';

const MEDIA_DIR = process.env.STOREOPS_MEDIA_DIR || join(dirname(process.env.STOREOPS_DB || new URL('../storeops.db', import.meta.url).pathname),'media');
mkdirSync(MEDIA_DIR,{recursive:true});

export const SLA_MINUTES={LOW:480,MEDIUM:240,HIGH:120,CRITICAL:30};
const WATCH_WINDOW_MINUTES=30;

function userName(id){return id?db.prepare(`SELECT name FROM users WHERE id=?`).get(id)?.name||null:null}
function storeManager(storeId){return db.prepare(`SELECT id FROM users WHERE store_id=? AND role='store_manager' AND active=1 ORDER BY id LIMIT 1`).get(storeId)?.id||null}
function addMinutesIso(minutes){return new Date(Date.now()+minutes*60000).toISOString()}
function normalizeSqlDate(value){if(!value)return null;const s=String(value);if(s.includes('T'))return s;return s.replace(' ','T')+'Z'}
function slaMeta(row){
  const due=normalizeSqlDate(row.due_at);
  if(row.status==='RESOLVED') return {state:'MET',label:'Résolu',minutesRemaining:null,escalationLevel:'NONE'};
  if(!due) return {state:'NO_DUE',label:'Sans échéance',minutesRemaining:null,escalationLevel:'NONE'};
  const remaining=Math.floor((new Date(due)-new Date())/60000);
  if(remaining<0) return {state:'BREACHED',label:`En retard de ${Math.abs(remaining)} min`,minutesRemaining:remaining,escalationLevel:'OPS_DIRECTOR'};
  if(remaining<=WATCH_WINDOW_MINUTES) return {state:'WATCH',label:`Échéance dans ${remaining} min`,minutesRemaining:remaining,escalationLevel:row.criticality==='CRITICAL'?'OPS_DIRECTOR':'WATCH'};
  return {state:'ON_TRACK',label:`${remaining} min restantes`,minutesRemaining:remaining,escalationLevel:'NONE'};
}
function hydrateIncident(row){
  if(!row) return null;
  const actions=db.prepare(`SELECT a.*,au.name assigned_to_name,cu.name created_by_name,du.name completed_by_name FROM incident_actions a LEFT JOIN users au ON au.id=a.assigned_to LEFT JOIN users cu ON cu.id=a.created_by LEFT JOIN users du ON du.id=a.completed_by WHERE a.incident_id=? ORDER BY a.created_at,a.id`).all(row.id).map(a=>({...a,sla:slaMeta({...row,status:a.status==='DONE'?'RESOLVED':'OPEN',due_at:a.due_at||row.due_at})}));
  const evidence=db.prepare(`SELECT e.*,u.name created_by_name FROM incident_evidence e LEFT JOIN users u ON u.id=e.created_by WHERE e.incident_id=? ORDER BY e.created_at DESC`).all(row.id).map(e=>({...e,url:`/api/media/${e.id}`}));
  const sla=slaMeta(row);
  return {...row,created_by_name:userName(row.created_by),assigned_to_name:userName(row.assigned_to),resolved_by_name:userName(row.resolved_by),actions,evidence,open_actions:actions.filter(a=>a.status==='OPEN').length,sla,is_overdue:sla.state==='BREACHED',escalation_level:sla.escalationLevel};
}

export function listIncidents(storeId,status='OPEN'){
  const allowed=['OPEN','RESOLVED','ALL']; if(!allowed.includes(String(status).toUpperCase())) status='OPEN';
  const where=status==='ALL'?'':' AND i.status=?';
  const args=status==='ALL'?[storeId]:[storeId,status];
  const rows=db.prepare(`SELECT i.* FROM incidents i WHERE i.store_id=?${where} ORDER BY CASE i.criticality WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,i.created_at DESC`).all(...args);
  return rows.map(hydrateIncident).sort((a,b)=>{
    const rank={BREACHED:0,WATCH:1,ON_TRACK:2,NO_DUE:3,MET:4};
    return (rank[a.sla.state]??9)-(rank[b.sla.state]??9);
  });
}

export function incidentById(id){return hydrateIncident(db.prepare(`SELECT * FROM incidents WHERE id=?`).get(id))}

export function createIncident({storeId,user,title,description='',category='OPERATIONS',criticality='MEDIUM',blockingLevel='NONE',assignedTo=null,dueAt=null,sourceType='MANUAL',sourceId=null,requiresEvidence=false}){
  if(!title?.trim()) throw Object.assign(new Error('Titre de l’incident obligatoire.'),{status:400});
  const allowedCriticality=['LOW','MEDIUM','HIGH','CRITICAL'];
  const allowedBlocking=['NONE','PROCESS','STORE_OPENING','STORE_CLOSING','TRANSACTION'];
  if(!allowedCriticality.includes(criticality)) criticality='MEDIUM';
  if(!allowedBlocking.includes(blockingLevel)) blockingLevel='NONE';
  assignedTo=assignedTo||storeManager(storeId);
  if(assignedTo && !db.prepare(`SELECT 1 FROM users WHERE id=? AND active=1`).get(assignedTo)) throw Object.assign(new Error('Responsable affecté introuvable.'),{status:400});
  const effectiveDue=dueAt||addMinutesIso(SLA_MINUTES[criticality]);
  const id=uid('inc');
  db.prepare(`INSERT INTO incidents(id,store_id,title,description,category,criticality,blocking_level,status,source_type,source_id,assigned_to,due_at,requires_evidence,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,storeId,title.trim(),description||null,category,criticality,blockingLevel,'OPEN',sourceType,sourceId,assignedTo,effectiveDue,requiresEvidence?1:0,user.id);
  audit({storeId,userId:user.id,action:'INCIDENT_CREATED',entityType:'INCIDENT',entityId:id,details:{title,category,criticality,blockingLevel,assignedTo,dueAt:effectiveDue,requiresEvidence,slaMinutes:SLA_MINUTES[criticality]}});
  return incidentById(id);
}

export function addAction({incidentId,user,title,note='',assignedTo=null,dueAt=null}){
  const incident=db.prepare(`SELECT * FROM incidents WHERE id=?`).get(incidentId); if(!incident) throw Object.assign(new Error('Incident introuvable.'),{status:404});
  if(incident.status!=='OPEN') throw Object.assign(new Error('Incident déjà clôturé.'),{status:409});
  if(!title?.trim()) throw Object.assign(new Error('Action corrective obligatoire.'),{status:400});
  const id=uid('ia');
  db.prepare(`INSERT INTO incident_actions(id,incident_id,title,note,status,assigned_to,due_at,created_by) VALUES(?,?,?,?,?,?,?,?)`).run(id,incidentId,title.trim(),note||null,'OPEN',assignedTo||incident.assigned_to||storeManager(incident.store_id)||null,dueAt||incident.due_at||null,user.id);
  audit({storeId:incident.store_id,userId:user.id,action:'INCIDENT_ACTION_CREATED',entityType:'INCIDENT',entityId:incidentId,details:{actionId:id,title,assignedTo,dueAt:dueAt||incident.due_at||null}});
  return incidentById(incidentId);
}

export function completeAction({incidentId,actionId,user,note=''}){
  const incident=db.prepare(`SELECT * FROM incidents WHERE id=?`).get(incidentId); if(!incident) throw Object.assign(new Error('Incident introuvable.'),{status:404});
  const action=db.prepare(`SELECT * FROM incident_actions WHERE id=? AND incident_id=?`).get(actionId,incidentId); if(!action) throw Object.assign(new Error('Action corrective introuvable.'),{status:404});
  if(action.status==='DONE') return incidentById(incidentId);
  db.prepare(`UPDATE incident_actions SET status='DONE',completion_note=?,completed_by=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).run(note||null,user.id,actionId);
  audit({storeId:incident.store_id,userId:user.id,action:'INCIDENT_ACTION_COMPLETED',entityType:'INCIDENT',entityId:incidentId,details:{actionId,note}});
  return incidentById(incidentId);
}

function parseDataUrl(dataUrl){
  const m=String(dataUrl||'').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/); if(!m) throw Object.assign(new Error('Preuve invalide. Formats acceptés : JPG, PNG, WEBP.'),{status:400});
  const buf=Buffer.from(m[2],'base64'); if(!buf.length||buf.length>5*1024*1024) throw Object.assign(new Error('La preuve doit faire moins de 5 Mo.'),{status:413});
  const ext={"image/jpeg":'.jpg',"image/png":'.png',"image/webp":'.webp'}[m[1]]; return {mime:m[1],buf,ext};
}

export function addEvidence({incidentId,user,dataUrl,fileName='preuve',caption=''}){
  const incident=db.prepare(`SELECT * FROM incidents WHERE id=?`).get(incidentId); if(!incident) throw Object.assign(new Error('Incident introuvable.'),{status:404});
  const parsed=parseDataUrl(dataUrl); const id=uid('ev'); const storageKey=`${id}${parsed.ext}`; writeFileSync(join(MEDIA_DIR,storageKey),parsed.buf);
  db.prepare(`INSERT INTO incident_evidence(id,incident_id,kind,file_name,mime_type,storage_key,caption,created_by) VALUES(?,?,?,?,?,?,?,?)`).run(id,incidentId,'PHOTO',fileName||storageKey,parsed.mime,storageKey,caption||null,user.id);
  audit({storeId:incident.store_id,userId:user.id,action:'INCIDENT_EVIDENCE_ADDED',entityType:'INCIDENT',entityId:incidentId,details:{evidenceId:id,fileName,caption}});
  return incidentById(incidentId);
}

export function mediaById(id){
  const e=db.prepare(`SELECT e.*,i.store_id FROM incident_evidence e JOIN incidents i ON i.id=e.incident_id WHERE e.id=?`).get(id); if(!e) return null;
  const path=join(MEDIA_DIR,e.storage_key); if(!existsSync(path)) return null; return {...e,bytes:readFileSync(path)};
}

export function resolveIncident({incidentId,user,resolutionNote}){
  const incident=db.prepare(`SELECT * FROM incidents WHERE id=?`).get(incidentId); if(!incident) throw Object.assign(new Error('Incident introuvable.'),{status:404});
  if(incident.status==='RESOLVED') return incidentById(incidentId);
  const open=db.prepare(`SELECT COUNT(*) n FROM incident_actions WHERE incident_id=? AND status='OPEN'`).get(incidentId).n; if(open) throw Object.assign(new Error(`${open} action(s) corrective(s) restent ouvertes.`),{status:409});
  if(!resolutionNote?.trim()) throw Object.assign(new Error('Compte-rendu de résolution obligatoire.'),{status:400});
  const evidenceCount=db.prepare(`SELECT COUNT(*) n FROM incident_evidence WHERE incident_id=?`).get(incidentId).n;
  if(incident.requires_evidence && !evidenceCount) throw Object.assign(new Error('Une preuve photo est obligatoire avant clôture.'),{status:409});
  db.prepare(`UPDATE incidents SET status='RESOLVED',resolution_note=?,resolved_by=?,resolved_at=CURRENT_TIMESTAMP WHERE id=?`).run(resolutionNote.trim(),user.id,incidentId);
  audit({storeId:incident.store_id,userId:user.id,action:'INCIDENT_RESOLVED',entityType:'INCIDENT',entityId:incidentId,details:{resolutionNote}});
  return incidentById(incidentId);
}

export function reopenIncident({incidentId,user,note=''}){
  const incident=db.prepare(`SELECT * FROM incidents WHERE id=?`).get(incidentId); if(!incident) throw Object.assign(new Error('Incident introuvable.'),{status:404});
  if(incident.status==='OPEN') return incidentById(incidentId);
  const due=addMinutesIso(SLA_MINUTES[incident.criticality]||SLA_MINUTES.MEDIUM);
  db.prepare(`UPDATE incidents SET status='OPEN',resolution_note=NULL,resolved_by=NULL,resolved_at=NULL,due_at=? WHERE id=?`).run(due,incidentId);
  audit({storeId:incident.store_id,userId:user.id,action:'INCIDENT_REOPENED',entityType:'INCIDENT',entityId:incidentId,details:{note,dueAt:due}});
  return incidentById(incidentId);
}

export function incidentStats(storeId){
  const incidents=listIncidents(storeId,'OPEN');
  const open=incidents.length;
  const critical=incidents.filter(i=>i.criticality==='CRITICAL').length;
  const overdue=incidents.filter(i=>i.sla.state==='BREACHED').length;
  const escalated=incidents.filter(i=>i.escalation_level==='OPS_DIRECTOR').length;
  const watch=incidents.filter(i=>i.sla.state==='WATCH').length;
  const resolvedToday=db.prepare(`SELECT COUNT(*) n FROM incidents WHERE store_id=? AND status='RESOLVED' AND date(resolved_at)=?`).get(storeId,todayISO()).n;
  return {open,critical,overdue,escalated,watch,resolvedToday};
}
