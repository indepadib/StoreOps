import { config } from '../config.mjs';

function storeOpsPilotSnapshot(storeId,businessDate){
 const code=String(storeId||'STORE').toUpperCase().replaceAll('-','_');
 const isVf=storeId==='val-fleuri';
 return{sourceKey:`STOREOPS-STAFFING-${storeId}-${businessDate}`,source:'STOREOPS_PILOT',storeId,businessDate,lines:[
  {employeeRef:`${code}-MGR`,employeeName:isVf?'Ayoub Nachiti':'Responsable ouverture',roleCode:'MANAGER',roleLabel:'Responsable ouverture',scheduledStart:'07:45'},
  {employeeRef:`${code}-C01`,employeeName:'Poste caisse 1',roleCode:'CASHIER',roleLabel:'Caisse',scheduledStart:'07:45'},
  {employeeRef:`${code}-C02`,employeeName:'Poste caisse 2',roleCode:'CASHIER',roleLabel:'Caisse',scheduledStart:'08:00'},
  {employeeRef:`${code}-F01`,employeeName:'Poste surface',roleCode:'FLOOR',roleLabel:'Surface de vente',scheduledStart:'07:45'}
 ]};
}

export async function getStaffingSnapshot(storeId,businessDate){
 if(config.pilot.staffingSource==='storeops')return storeOpsPilotSnapshot(storeId,businessDate);
 if(config.dynamics.mode!=='live')return storeOpsPilotSnapshot(storeId,businessDate);
 throw Object.assign(new Error('Planning équipe D365/HR non configuré. Passe STOREOPS_STAFFING_SOURCE=storeops pour le pilote ou mappe la source RH avant activation.'),{status:503,code:'D365_STAFFING_MAPPING_REQUIRED',details:{storeId,businessDate}});
}
