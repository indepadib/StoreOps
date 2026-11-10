// Recruitment is exclusively a real customer-account creation. Card dates are never a fallback.
import { readCustomerCreations, customerCreationMapping } from './dynamics-customer-creations.mjs';
import { storeOperationalSettings } from './store-settings.mjs';

export async function readStoreLoyaltyEnrollments(storeId, period={}) {
 // Retained API name: do not feed account creations to historical transaction attribution.
 return {status:'UNAVAILABLE',storeId,...period,items:[],total:null,source:'CUSTOMER_CREATION_DIRECT_ATTRIBUTION_REQUIRED'};
}
export async function readStoreLoyaltyRecruitmentsByStaff(storeId, period={}) {
 const result=await readCustomerCreations([{id:storeId,unit:storeOperationalSettings(storeId)?.d365?.operatingUnitNumber}],period);
 const row=result.stores?.[0];
 return {...result,storeId,total:row?.recruitments??null,items:row?.staff||[],status:row?.staffStatus||'UNAVAILABLE'};
}
export async function readStoreLoyaltyRecruitments(storeId,{businessDate}={}) {
 const result=await readCustomerCreations([{id:storeId,unit:storeOperationalSettings(storeId)?.d365?.operatingUnitNumber}],{startDate:businessDate,endDate:businessDate});
 return {...result,storeId,businessDate,recruitments:result.stores?.[0]?.recruitments??null};
}
export function loyaltyIntegrationConfig(){return customerCreationMapping()}
