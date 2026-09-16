import { config } from '../config.mjs';
import { storeTerminals } from './pilot-profile.mjs';

function storeOpsSnapshot(storeId,businessDate){
  const prefix=String(storeId||'STORE').toUpperCase().replaceAll('-','_');
  const configured=storeTerminals(storeId);
  if(!configured.length&&config.realOnly){
    throw Object.assign(new Error('Configuration réelle des caisses non renseignée pour ce magasin. Aucune caisse générique n’est créée.'),{status:503,code:'CASH_OPENING_REAL_MASTER_NOT_CONFIGURED',details:{storeId,businessDate}});
  }
  const terminals=configured.length?configured:[1,2,3].map(i=>({till_code:`C0${i}`,label:`Caisse ${i}`,tpe_mode:'INTEGRATED',expected_float:500}));
  return {
    sourceKey:`STOREOPS-CASH-OPENING-${storeId}-${businessDate}`,
    storeId,businessDate,source:configured.length?'STOREOPS_REAL_MASTER':'STOREOPS_PILOT',
    lines:terminals.map(t=>({
      tillCode:t.till_code,
      shiftId:`${prefix}-OPEN-${t.till_code}-${businessDate}`,
      expectedFloat:Number(t.expected_float||0),
      label:t.label,
      tpeMode:t.tpe_mode
    }))
  };
}

export async function getCashOpeningSnapshot(storeId,businessDate){
  if(config.pilot.cashOpeningSource==='storeops')return storeOpsSnapshot(storeId,businessDate);
  if(config.dynamics.mode!=='live'&&!config.realOnly)return storeOpsSnapshot(storeId,businessDate);
  throw Object.assign(new Error('Flux réel de préparation caisses non connecté. StoreOps n’affiche aucune valeur simulée.'),{status:503,code:'D365_CASH_OPENING_MAPPING_REQUIRED',details:{storeId,businessDate}});
}
