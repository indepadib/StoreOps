import { db, audit } from '../db.mjs';
import { blockingHandoverCount, dayCycleMetrics } from './handover.mjs';
import { blockingDlcCount } from './dlc.mjs';
import { commercialBlockingCount } from './commercial.mjs';
import { cashClosingSummary } from './cash.mjs';
import { blockingLossCount } from './loss.mjs';
import { cashOpeningSummary,markCashOpeningOpened } from './cash-opening.mjs';
import { coldChainSummary,markColdChainOpened } from './cold-chain.mjs';

export function processProgress(storeDayId, group){
  const rows=db.prepare(`SELECT id,status,blocking_level,step_order,title FROM tasks WHERE store_day_id=? AND group_name=? ORDER BY step_order`).all(storeDayId,group);
  const total=rows.length,done=rows.filter(x=>x.status==='COMPLETED').length;
  const blockers=rows.filter(x=>x.blocking_level!=='NONE'&&x.status!=='COMPLETED').length;
  const current=rows.find(x=>x.status!=='COMPLETED')||null;
  return {total,done,percent:total?Math.round(done*100/total):0,blockers,currentStep:current?.step_order||null,currentTaskId:current?.id||null,currentTitle:current?.title||null};
}

export function takeOwnership({storeDay,user,group}){
  if(!['opening','closing'].includes(group))throw Object.assign(new Error('Process inconnu'),{status:400});
  if(group==='opening'&&storeDay.opening_status==='OPENED')throw Object.assign(new Error('Le magasin est déjà déclaré ouvert.'),{status:409});
  if(group==='closing'&&storeDay.opening_status!=='OPENED')throw Object.assign(new Error('La fermeture ne peut commencer qu’après validation de l’ouverture.'),{status:409});
  if(group==='closing'&&storeDay.closing_status==='CLOSED')throw Object.assign(new Error('Le magasin est déjà déclaré fermé.'),{status:409});
  const field=group==='opening'?'opening_owner_id':'closing_owner_id',statusField=group==='opening'?'opening_status':'closing_status',startedField=group==='opening'?'opening_started_at':'closing_started_at';
  db.prepare(`UPDATE store_days SET ${field}=?,${statusField}='IN_PROGRESS',${startedField}=COALESCE(${startedField},CURRENT_TIMESTAMP) WHERE id=?`).run(user.id,storeDay.id);
  audit({storeId:storeDay.store_id,businessDate:storeDay.business_date,userId:user.id,action:`${group.toUpperCase()}_TAKEN`,entityType:'STORE_DAY',entityId:storeDay.id});
}

export function validateProcess({storeDay,user,group}){
  if(group==='opening'&&storeDay.opening_status==='OPENED')throw Object.assign(new Error('Le magasin est déjà déclaré ouvert.'),{status:409});
  if(group==='closing'&&storeDay.opening_status!=='OPENED')throw Object.assign(new Error('La fermeture ne peut être validée avant l’ouverture du magasin.'),{status:409});
  if(group==='closing'&&storeDay.closing_status==='CLOSED')throw Object.assign(new Error('Le magasin est déjà déclaré fermé.'),{status:409});
  const fresh=db.prepare(`SELECT * FROM store_days WHERE id=?`).get(storeDay.id),p=processProgress(storeDay.id,group);
  const openCritical=db.prepare(`SELECT COUNT(*) n FROM incidents WHERE store_id=? AND status='OPEN' AND blocking_level=?`).get(storeDay.store_id,group==='opening'?'STORE_OPENING':'STORE_CLOSING').n;
  const handoverBlocking=group==='opening'?blockingHandoverCount(storeDay.store_id,storeDay.business_date):0;
  const handoverReviewed=group==='closing'?!!fresh.handover_reviewed_at:true;
  const dlcBlocking=group==='closing'?blockingDlcCount(storeDay.store_id):0;
  const commercialBlocking=group==='opening'?commercialBlockingCount(storeDay.store_id,storeDay.business_date):0;
  const cold=group==='opening'?coldChainSummary(storeDay.store_id,storeDay.business_date):{blocking:0,status:'NA'};
  const coldBlocking=group==='opening'?Number(cold.blocking||0):0;
  const cashOpen=group==='opening'?cashOpeningSummary(storeDay.store_id,storeDay.business_date):{blocking:0,status:'NA'};
  const cashOpeningBlocking=group==='opening'?Number(cashOpen.blocking||0):0;
  const cash=group==='closing'?cashClosingSummary(storeDay.store_id,storeDay.business_date):{blocking:0,status:'NA'};
  const cashBlocking=group==='closing'?Number(cash.blocking||0):0;
  const lossBlocking=group==='closing'?Number(blockingLossCount(storeDay.store_id,storeDay.business_date)||0):0;
  if(p.blockers>0||p.done<p.total||openCritical>0||handoverBlocking>0||commercialBlocking>0||coldBlocking>0||cashOpeningBlocking>0||!handoverReviewed||dlcBlocking>0||cashBlocking>0||lossBlocking>0){
    const reason=!handoverReviewed?'La passation de fin de journée doit être revue avant fermeture.':handoverBlocking?`${handoverBlocking} passation(s) bloquante(s) doivent être résolues avant ouverture.`:commercialBlocking?`${commercialBlocking} changement(s) prix/promo restent à vérifier avant ouverture.`:coldBlocking?`${coldBlocking} zone(s) froid ne sont pas conformes. Relevé, porte et recontrôle doivent être validés avant ouverture.`:cashOpeningBlocking?`${cashOpeningBlocking} caisse(s) ne sont pas prêtes. Affectation, fond, POS, TPE, imprimante et shift Dynamics doivent être conformes avant ouverture.`:cashBlocking?'La clôture caisses doit être rapprochée et validée avant fermeture magasin.':lossBlocking?`${lossBlocking} perte(s) / démarque(s) restent à documenter ou poster avant fermeture.`:dlcBlocking?`${dlcBlocking} lot(s) DLC/DDM périmé(s) ou critique(s) restent à traiter avant fermeture.`:'Tous les contrôles obligatoires ne sont pas conformes.';
    const err=new Error(reason);err.status=409;err.details={...p,openCritical,handoverBlocking,commercialBlocking,coldBlocking,coldStatus:cold.status,cashOpeningBlocking,cashOpeningStatus:cashOpen.status,handoverReviewed,dlcBlocking,cashBlocking,cashStatus:cash.status,lossBlocking};throw err;
  }
  if(group==='opening'){
    db.prepare(`UPDATE store_days SET opening_status='OPENED',opened_at=CURRENT_TIMESTAMP WHERE id=?`).run(storeDay.id);
    markCashOpeningOpened({storeId:storeDay.store_id,businessDate:storeDay.business_date,user});
    markColdChainOpened({storeId:storeDay.store_id,businessDate:storeDay.business_date,user});
  } else db.prepare(`UPDATE store_days SET closing_status='CLOSED',closed_at=CURRENT_TIMESTAMP WHERE id=?`).run(storeDay.id);
  audit({storeId:storeDay.store_id,businessDate:storeDay.business_date,userId:user.id,action:group==='opening'?'STORE_OPENED':'STORE_CLOSED',entityType:'STORE_DAY',entityId:storeDay.id,details:{cycle:dayCycleMetrics(db.prepare(`SELECT * FROM store_days WHERE id=?`).get(storeDay.id))}});
  return processProgress(storeDay.id,group);
}
