import { config } from '../config.mjs';
import { staffingSnapshotFromPublishedShifts } from './workforce.mjs';

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

function storeOpsSnapshot(storeId,businessDate){
 const planned=staffingSnapshotFromPublishedShifts(storeId,businessDate);
 if(planned.lines.length)return planned;
 if(config.realOnly)throw Object.assign(new Error('Aucun planning publié pour ce magasin. Aucune équipe simulée n’est affichée.'),{status:503,code:'STAFFING_REAL_SOURCE_NOT_CONFIGURED',details:{storeId,businessDate}});
 return storeOpsPilotSnapshot(storeId,businessDate)
}

export async function getStaffingSnapshot(storeId,businessDate){
 if(config.pilot.staffingSource==='storeops')return storeOpsSnapshot(storeId,businessDate);
 if(config.dynamics.mode!=='live'&&!config.realOnly)return storeOpsSnapshot(storeId,businessDate);
 throw Object.assign(new Error('Planning réel non connecté. Publiez le planning dans StoreOps ou connectez la source RH/D365.'),{status:503,code:'STAFFING_REAL_SOURCE_NOT_CONFIGURED',details:{storeId,businessDate}});
}
