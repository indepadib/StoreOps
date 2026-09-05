import { db, audit } from '../db.mjs';
import { createIncident } from './incidents.mjs';
import { autoResolutionDecision } from './incident-resolution-policy.mjs';

function parse(v,fallback=null){try{return v?JSON.parse(v):fallback}catch{return fallback}}
function normalizeBoolean(v){return v===true || v==='true' || v===1 || v==='1'}

export function getTaskForm(taskId){
  const task=db.prepare(`SELECT t.*,sd.store_id,sd.business_date,sd.opening_status,sd.closing_status FROM tasks t JOIN store_days sd ON sd.id=t.store_day_id WHERE t.id=?`).get(taskId);
  if(!task) return null;
  const fields=db.prepare(`SELECT * FROM task_fields WHERE task_id=? ORDER BY rowid`).all(taskId).map(f=>({...f,options:parse(f.options_json,[]),value:parse(f.value_json,null)}));
  return {task,fields};
}

function validateField(field,raw){
  if((raw===undefined || raw===null || raw==='') && field.required) return {ok:false,message:`${field.label} est obligatoire.`};
  if(raw===undefined || raw===null || raw==='') return {ok:true,value:null,nonconform:false};
  if(field.input_type==='BOOLEAN'){
    const value=normalizeBoolean(raw);
    return {ok:true,value,nonconform:field.required && !value,message:!value?`${field.label} : non conforme.`:null};
  }
  if(['NUMBER','MONEY'].includes(field.input_type)){
    const value=Number(raw); if(!Number.isFinite(value)) return {ok:false,message:`${field.label} doit être numérique.`};
    const low=field.min_value!=null && value<Number(field.min_value); const high=field.max_value!=null && value>Number(field.max_value);
    return {ok:true,value,nonconform:low||high,message:low||high?`${field.label} hors tolérance.`:null};
  }
  if(field.input_type==='SELECT'){
    const options=parse(field.options_json,[]); if(options.length && !options.includes(raw)) return {ok:false,message:`Valeur invalide pour ${field.label}.`};
  }
  return {ok:true,value:String(raw),nonconform:false};
}

function financialVariances(task,valuesByCode){
  if(task.group_name!=='closing' || !task.title.toLowerCase().includes('caisses')) return [];
  const pairs=[['ca_commercial','ca_comptable','Écart CA commercial / comptable'],['especes_attendues','especes_declarees','Écart espèces'],['tpe_systeme','tpe_cloture','Écart TPE']];
  const tolerance=Number(process.env.CLOSING_VARIANCE_TOLERANCE_DH || 1);
  return pairs.flatMap(([a,b,label])=>{
    const va=Number(valuesByCode[a]),vb=Number(valuesByCode[b]); if(!Number.isFinite(va)||!Number.isFinite(vb)) return [];
    const delta=Math.round((vb-va)*100)/100; return Math.abs(delta)>tolerance?[{label,delta,tolerance}]:[];
  });
}

export function submitTaskForm({taskId,user,values}){
  const form=getTaskForm(taskId); if(!form) throw Object.assign(new Error('Tâche introuvable'),{status:404});
  const {task,fields}=form;
  if(task.group_name==='opening' && task.opening_status==='OPENED') throw Object.assign(new Error('Le parcours d’ouverture est verrouillé après validation finale.'),{status:409});
  if(task.group_name==='closing' && task.opening_status!=='OPENED') throw Object.assign(new Error('La fermeture ne peut être contrôlée avant l’ouverture officielle du magasin.'),{status:409});
  if(task.group_name==='closing' && task.closing_status==='CLOSED') throw Object.assign(new Error('Le parcours de fermeture est verrouillé après validation finale.'),{status:409});
  const normalized={}; const errors=[]; const nonconforms=[];
  for(const f of fields){
    const r=validateField(f,values?.[f.code]);
    if(!r.ok){errors.push(r.message);continue}
    normalized[f.code]=r.value;
    if(r.nonconform) nonconforms.push({code:f.code,label:f.label,message:r.message});
    db.prepare(`UPDATE task_fields SET value_json=?,is_nonconform=? WHERE id=?`).run(JSON.stringify(r.value),r.nonconform?1:0,f.id);
  }
  if(errors.length) throw Object.assign(new Error('Formulaire incomplet'),{status:400,details:errors});

  const financial=financialVariances(task,normalized); nonconforms.push(...financial.map(x=>({code:'financial_variance',label:x.label,message:`${x.label}: ${x.delta} DH`})));
  db.prepare(`UPDATE tasks SET value_json=?,status=? WHERE id=?`).run(JSON.stringify(normalized),nonconforms.length?'IN_PROGRESS':'COMPLETED',task.id);
  if(!nonconforms.length) db.prepare(`UPDATE tasks SET completed_by=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,task.id);

  audit({storeId:task.store_id,businessDate:task.business_date,userId:user.id,action:nonconforms.length?'TASK_NONCONFORM':'TASK_COMPLETED',entityType:'TASK',entityId:task.id,details:{title:task.title,values:normalized,nonconforms}});

  let incidentResolutionPending=null;
  if(nonconforms.length){
    const existing=db.prepare(`SELECT id FROM incidents WHERE source_type='TASK' AND source_id=? AND status='OPEN' LIMIT 1`).get(task.id);
    const description=nonconforms.map(x=>x.message).join(' · ');
    if(!existing){
      createIncident({storeId:task.store_id,user,title:`Contrôle non conforme · ${task.title}`,description,category:'OPERATIONS',criticality:task.criticality,blockingLevel:task.blocking_level,sourceType:'TASK',sourceId:task.id,assignedTo:user.role==='store_manager'?user.id:null,requiresEvidence:task.criticality==='CRITICAL'||['STORE_OPENING','STORE_CLOSING'].includes(task.blocking_level)});
    } else {
      db.prepare(`UPDATE incidents SET description=?,criticality=?,blocking_level=? WHERE id=?`).run(description,task.criticality,task.blocking_level,existing.id);
    }
  } else {
    const existing=db.prepare(`SELECT * FROM incidents WHERE source_type='TASK' AND source_id=? AND status='OPEN' LIMIT 1`).get(task.id);
    if(existing){
      const openActions=db.prepare(`SELECT COUNT(*) n FROM incident_actions WHERE incident_id=? AND status='OPEN'`).get(existing.id).n;
      const evidenceCount=db.prepare(`SELECT COUNT(*) n FROM incident_evidence WHERE incident_id=?`).get(existing.id).n;
      const decision=autoResolutionDecision({requiresEvidence:existing.requires_evidence,openActions,evidenceCount});
      if(decision.canResolve){
        db.prepare(`UPDATE incidents SET status='RESOLVED',resolution_note='Contrôle redevenu conforme',resolved_by=?,resolved_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,existing.id);
        audit({storeId:task.store_id,businessDate:task.business_date,userId:user.id,action:'INCIDENT_AUTO_RESOLVED',entityType:'INCIDENT',entityId:existing.id,details:{sourceTask:task.id,evidenceCount}});
      }else{
        incidentResolutionPending={incidentId:existing.id,reason:decision.reason,openActions:decision.openActions,evidenceCount:decision.evidenceCount,requiresEvidence:!!existing.requires_evidence};
        audit({storeId:task.store_id,businessDate:task.business_date,userId:user.id,action:'INCIDENT_RESOLUTION_PENDING',entityType:'INCIDENT',entityId:existing.id,details:{sourceTask:task.id,reason:decision.reason,openActions:decision.openActions,evidenceCount:decision.evidenceCount}});
      }
    }
  }
  return {ok:!nonconforms.length,taskId:task.id,status:nonconforms.length?'IN_PROGRESS':'COMPLETED',nonconforms,values:normalized,incidentResolutionPending};
}