import { config } from '../config.mjs';
import { storeTerminals } from './pilot-profile.mjs';

function storeOpsSnapshot(storeId,businessDate){
  const prefix=String(storeId||'STORE').toUpperCase().replaceAll('-','_');
  const configured=storeTerminals(storeId);
  const terminals=configured.length?configured:[1,2,3].map(i=>({till_code:`C0${i}`,label:`Caisse ${i}`,tpe_mode:'INTEGRATED',expected_float:500}));
  return {
    sourceKey:`STOREOPS-CASH-OPENING-${storeId}-${businessDate}`,
    storeId,businessDate,source:'STOREOPS_PILOT',
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
  if(config.dynamics.mode!=='live')return storeOpsSnapshot(storeId,businessDate);
  throw Object.assign(new Error('Flux préparation caisses Dynamics live non configuré. Passe STOREOPS_CASH_OPENING_SOURCE=storeops pour le pilote ou mappe les shifts Commerce.'),{status:503,code:'D365_CASH_OPENING_MAPPING_REQUIRED',details:{storeId,businessDate}});
}
