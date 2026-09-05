import { config } from '../config.mjs';

export async function getCashOpeningSnapshot(storeId,businessDate){
  if(config.dynamics.mode!=='live'){
    const prefix=String(storeId||'STORE').toUpperCase().replaceAll('-','_');
    return {
      sourceKey:`CASH-OPENING-${storeId}-${businessDate}`,
      storeId,businessDate,source:'SIMULATED_D365',
      lines:[
        {tillCode:'C01',shiftId:`${prefix}-OPEN-C01-${businessDate}`,expectedFloat:500},
        {tillCode:'C02',shiftId:`${prefix}-OPEN-C02-${businessDate}`,expectedFloat:500},
        {tillCode:'C03',shiftId:`${prefix}-OPEN-C03-${businessDate}`,expectedFloat:500}
      ]
    };
  }
  throw Object.assign(new Error('Flux préparation caisses Dynamics live non configuré : mapper les caisses, shifts ouverts et fonds attendus F&O/Commerce avant activation.'),{status:503,code:'D365_CASH_OPENING_MAPPING_REQUIRED',details:{storeId,businessDate}});
}
