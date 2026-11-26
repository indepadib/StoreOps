import {config} from '../config.mjs';
import {odataGet} from './dynamics.mjs';
import {readCompleteCollection} from './dynamics-account-creations.mjs';
import {normalizeCustomerMaster} from './one-crm-customer-directory.mjs';
let cache=null,inflight=null;
export async function readCustomerMaster(){
 const company=String(config.dynamics.dataAreaId||'').trim();
 if(config.dynamics.mode!=='live'||!company)throw Error('Live company required');
 const key=JSON.stringify([config.dynamics.baseUrl,company]);
 if(cache?.key===key&&cache.expires>Date.now())return cache.value;
 if(inflight?.key===key)return inflight.promise;
 const promise=(async()=>{
  const rows=await readCompleteCollection('CustTableCDREntities',{filter:"SysDataAreaId eq '"+company.replaceAll("'","''")+"' and CustGroup eq 'Retail'",select:'AccountNum,SysCreatedDateTime,SysDataAreaId,CustGroup',extra:'cross-company=true'},odataGet);
  const value=normalizeCustomerMaster(rows,{company,checkedAt:new Date().toISOString()});
  cache={key,value,expires:Date.now()+300000};return value;
 })();
 inflight={key,promise};try{return await promise}finally{if(inflight?.promise===promise)inflight=null}
}

export async function readCustomerProfile(row){
 const company=String(config.dynamics.dataAreaId||'').trim(),accountRef=row.accountRef;
 const base={status:'READY',accountRef,createdAt:row.createdAt,source:'D365/CustTableCDREntities',scope:'LEGAL_ENTITY_RETAIL',historyStatus:'NOT_CONNECTED',activationEnabled:false};
 const unavailable={status:'UNAVAILABLE',cardCount:null,firstEnrollmentAt:null};
 if(config.dynamics.mode!=='live'||!company)return {...base,loyalty:unavailable};
 try{
  const esc=v=>String(v).replaceAll("'","''");
  const accounts=await readCompleteCollection('CustTableCDREntities',{filter:"SysDataAreaId eq '"+esc(company)+"' and CustGroup eq 'Retail' and AccountNum eq '"+esc(accountRef)+"'",select:'AccountNum,Party,SysCreatedDateTime,SysDataAreaId',extra:'cross-company=true'},odataGet);
  if(accounts.length!==1||String(accounts[0].AccountNum).trim()!==accountRef||String(accounts[0].SysDataAreaId).trim()!==company||(row.createdAt!==null&&new Date(accounts[0].SysCreatedDateTime).toISOString()!==row.createdAt))return {...base,loyalty:unavailable};
  const [parties,cards]=await Promise.all([readCompleteCollection('DirPartyTableBiEntities',{select:'PartyNumber,SourceKey'},odataGet),readCompleteCollection('RetailLoyaltyCards',{select:'CardNumber,PartyNumber,LoyaltyEnrollmentDate'},odataGet)]);
  const {projectLoyaltyIdentity}=await import('./one-crm-customer-profile.mjs');
  return {...base,loyalty:projectLoyaltyIdentity({account:accounts[0],parties,cards})};
 }catch{return {...base,loyalty:unavailable}}
}

import {readDirectorySourcePage,readDirectorySourceCount,findDirectorySourceAccount} from './one-crm-customer-source.mjs';
const sourceDeps=()=>({company:String(config.dynamics.dataAreaId||'').trim(),read:odataGet});
export const readCustomerPage=(page,search)=>readDirectorySourcePage({...sourceDeps(),page,search});
let countCache=null;
export async function readCustomerCount(){
 const deps=sourceDeps(),key=JSON.stringify([config.dynamics.baseUrl,deps.company]);
 if(countCache?.key===key&&countCache.expires>Date.now())return countCache.value;
 const value=await readDirectorySourceCount(deps);countCache={key,value,expires:Date.now()+300000};return value;
}
export const findCustomerAccount=accountRef=>findDirectorySourceAccount({...sourceDeps(),accountRef});
