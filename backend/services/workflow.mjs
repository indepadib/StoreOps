import { db, audit, todayISO } from '../db.mjs';

export function processProgress(storeDayId, group){
  const rows=db.prepare(`SELECT status,blocking_level FROM tasks WHERE store_day_id=? AND group_name=?`).all(storeDayId,group);
  const total=rows.length, done=rows.filter(x=>x.status==='COMPLETED').length;
  const blockers=rows.filter(x=>x.blocking_level!=='NONE' && x.status!=='COMPLETED').length;
  return {total,done,percent:total?Math.round(done*100/total):0,blockers};
}

export function takeOwnership({storeDay,user,group}){
  const field=group==='opening'?'opening_owner_id':'closing_owner_id';
  const statusField=group==='opening'?'opening_status':'closing_status';
  db.prepare(`UPDATE store_days SET ${field}=?, ${statusField}='IN_PROGRESS' WHERE id=?`).run(user.id,storeDay.id);
  audit({storeId:storeDay.store_id,userId:user.id,action:`${group.toUpperCase()}_TAKEN`,entityType:'STORE_DAY',entityId:storeDay.id});
}

export function completeTask({task,user,value}){
  const day=db.prepare(`SELECT sd.* FROM store_days sd JOIN tasks t ON t.store_day_id=sd.id WHERE t.id=?`).get(task.id);
  db.prepare(`UPDATE tasks SET status='COMPLETED',value_json=?,completed_by=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).run(JSON.stringify(value||{}),user.id,task.id);
  audit({storeId:day.store_id,businessDate:day.business_date,userId:user.id,action:'TASK_COMPLETED',entityType:'TASK',entityId:task.id,details:{title:task.title,value}});
}

export function validateProcess({storeDay,user,group}){
  const p=processProgress(storeDay.id,group);
  if(p.blockers>0 || p.done<p.total){
    const err=new Error('Tous les contrôles obligatoires ne sont pas terminés.'); err.status=409; err.details=p; throw err;
  }
  if(group==='opening') db.prepare(`UPDATE store_days SET opening_status='OPENED',opened_at=CURRENT_TIMESTAMP WHERE id=?`).run(storeDay.id);
  else db.prepare(`UPDATE store_days SET closing_status='CLOSED',closed_at=CURRENT_TIMESTAMP WHERE id=?`).run(storeDay.id);
  audit({storeId:storeDay.store_id,businessDate:storeDay.business_date,userId:user.id,action:group==='opening'?'STORE_OPENED':'STORE_CLOSED',entityType:'STORE_DAY',entityId:storeDay.id});
  return processProgress(storeDay.id,group);
}
