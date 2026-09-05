import { config } from '../config.mjs';
import { storeTerminals } from './pilot-profile.mjs';

export async function getCashOpeningSnapshot(storeId,businessDate){
  if(config.dynamics.mode!=='live'){
    const prefix=String(storeId||'STORE').toUpperCase().replaceAll('-','_');
    const configured=storeTerminals(storeId);
    const terminals=configured.length?configured:[1,2,3].map(i=>({till_code:`C0${i}`,label:`Caisse ${i}`,tpe_mode:'INTEGRATED',expected_float:500}));
    return {
      sourceKey:`CASH-OPENING-${storeId}-${businessDate}`,
      storeId,businessDate,source:'SIMULATED_D365',
      lines:terminals.map(t=>({
        tillCode:t.till_code,
        shiftId:`${prefix}-OPEN-${t.till_code}-${businessDate}`,
        expectedFloat:Number(t.expected_float||0),
        label:t.label,
        tpeMode:t.tpe_mode
      }))
    };
  }
  throw Object.assign(new Error('Flux préparation caisses Dynamics live non configuré : mapper les caisses, shifts ouverts et fonds attendus F&O/Commerce avant activation.'),{status:503,code:'D365_CASH_OPENING_MAPPING_REQUIRED',details:{storeId,businessDate}});
}
