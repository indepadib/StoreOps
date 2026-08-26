import { db, audit } from '../db.mjs';

export function processProgress(storeDayId, group){
  const rows=db.prepare(`SELECT id,status,blocking_level,step_order,title FROM tasks WHERE store_day_id=? AND group_name=? ORDER BY step_order`).all(storeDayId,group);
  const total=rows.length, done=rows.filter(x=>x.status==='COMPLETED').length;
  const blockers=rows.filter(x=>x.blocking_level!=='NONE' && x.status!=='COMPLETED').length;
  const current=rows.find(x=>x.status!=='COMPLETED')||null;
  return {total,done,percent:total?Math.round(done*100/total):0,blockers,currentStep:current?.step_order||null,currentTaskId:current?.id||null,currentTitle:current?.title||null};
}

export function takeOwnership({storeDay,user,group}){
  if(!['opening','closing'].includes(group)) throw Object.assign(new Error('Process inconnu'),{status:400});
  if(group==='opening' && storeDay.opening_status==='OPENED') throw Object.assign(new Error('Le magasin est déjà déclaré ouvert.'),{status:409});
  if(group==='closing' && storeDay.opening_status!=='OPENED') throw Object.assign(new Error('La fermeture ne peut commencer qu’après validation de l’ouverture.'),{status:409});
  if(group==='closing' && storeDay.closing_status==='CLOSED') throw Object.assign(new Error('Le magasin est déjà déclaré fermé.'),{status:409});
  const field=group==='opening'?'opening_owner_id':'closing_owner_id';
  const statusField=group==='opening'?'opening_status':'closing_status';
  db.prepare(`UPDATE store_days SET ${field}=?, ${statusField}='IN_PROGRESS' WHERE id=?`).run(user.id,storeDay.id);
  audit({storeId:storeDay.store_id,businessDate:storeDay.business_date,userId:user.id,action:`${group.toUpperCase()}_TAKEN`,entityType:'STORE_DAY',entityId:storeDay.id});
}

export function validateProcess({storeDay,user,group}){
  if(group==='opening' && storeDay.opening_status==='OPENED') throw Object.assign(new Error('Le magasin est déjà déclaré ouvert.'),{status:409});
  if(group==='closing' && storeDay.opening_status!=='OPENED') throw Object.assign(new Error('La fermeture ne peut être validée avant l’ouverture du magasin.'),{status:409});
  if(group==='closing' && storeDay.closing_status==='CLOSED') throw Object.assign(new Error('Le magasin est déjà déclaré fermé.'),{status:409});
  const p=processProgress(storeDay.id,group);
  const openCritical=db.prepare(`SELECT COUNT(*) n FROM incidents WHERE store_id=? AND status='OPEN' AND blocking_level=?`).get(storeDay.store_id,group==='opening'?'STORE_OPENING':'STORE_CLOSING').n;
  if(p.blockers>0 || p.done<p.total || openCritical>0){
    const err=new Error('Tous les contrôles obligatoires ne sont pas conformes.'); err.status=409; err.details={...p,openCritical}; throw err;
  }
  if(group==='opening') db.prepare(`UPDATE store_days SET opening_status='OPENED',opened_at=CURRENT_TIMESTAMP WHERE id=?`).run(storeDay.id);
  else db.prepare(`UPDATE store_days SET closing_status='CLOSED',closed_at=CURRENT_TIMESTAMP WHERE id=?`).run(storeDay.id);
  audit({storeId:storeDay.store_id,businessDate:storeDay.business_date,userId:user.id,action:group==='opening'?'STORE_OPENED':'STORE_CLOSED',entityType:'STORE_DAY',entityId:storeDay.id});
  return processProgress(storeDay.id,group);
}
