import { config } from '../config.mjs';

export async function getStaffingSnapshot(storeId,businessDate){
 if(config.dynamics.mode!=='live'){
  const code=String(storeId||'STORE').toUpperCase().replaceAll('-','_');
  return{sourceKey:`STAFFING-${storeId}-${businessDate}`,source:'SIMULATED_D365_HR',storeId,businessDate,lines:[
   {employeeRef:`${code}-MGR`,employeeName:'Responsable ouverture',roleCode:'MANAGER',roleLabel:'Responsable ouverture',scheduledStart:'07:30'},
   {employeeRef:`${code}-C01`,employeeName:'Caissier 1',roleCode:'CASHIER',roleLabel:'Caisse',scheduledStart:'07:45'},
   {employeeRef:`${code}-C02`,employeeName:'Caissier 2',roleCode:'CASHIER',roleLabel:'Caisse',scheduledStart:'08:00'},
   {employeeRef:`${code}-F01`,employeeName:'Employé surface',roleCode:'FLOOR',roleLabel:'Surface de vente',scheduledStart:'07:30'}
  ]};
 }
 throw Object.assign(new Error('Planning équipe live non configuré : mapper la source réelle collaborateurs/planning (D365/HR) avant activation.'),{status:503,code:'D365_STAFFING_MAPPING_REQUIRED',details:{storeId,businessDate}});
}
