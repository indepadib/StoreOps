import {config} from '../config.mjs';
import {odataGet} from './dynamics.mjs';
import {storeOperationalSettings} from './store-settings.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>clean(v).replaceAll("'","''");
export function businessMidnight(date,timeZone='Africa/Casablanca'){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Date invalide');
  const target=Date.parse(date+'T00:00:00Z');let instant=target;
  for(let i=0;i<4;i++){
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(x=>[x.type,x.value]));
    const local=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`),delta=target-local;
    instant+=delta;if(!delta)break;
  }
  return new Date(instant).toISOString();
}
export async function readCompleteCollection(entity,options={},read=odataGet){
  const value=[];let continuation=null;const visited=new Set();
  do{
    const payload=await read(entity,{...options,top:null,continuation});
    if(!Array.isArray(payload?.value))throw Error('Collection D365 invalide');
    value.push(...payload.value);
    if(value.length>=100000)throw Error('Collection D365 incomplète : plafond atteint');
    const next=payload['@odata.nextLink'];
    if(next){if(visited.has(next))throw Error('Pagination D365 répétée');visited.add(next);continuation=next;}
    else break;
  }while(true);
  return value;
}

export function aggregateAccountCreations(accounts,parties,cards,stores,{company,startDate,endDate,timeZone='Africa/Casablanca',settings=storeOperationalSettings}={}){
  const from=businessMidnight(startDate,timeZone),next=new Date(endDate+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  const until=businessMidnight(next.toISOString().slice(0,10),timeZone);
  const partyNumbers=new Map(parties.map(p=>[clean(p.SourceKey),clean(p.PartyNumber)]));
  const owners=new Map();
  for(const card of cards){
    const party=clean(card.PartyNumber),unit=clean(card.OmOperatingUnitNumber),date=clean(card.LoyaltyEnrollmentDate);
    if(!party||!unit||!Number.isFinite(Date.parse(date)))continue;
    const old=owners.get(party);
    if(!old||date<old.date)owners.set(party,{date,units:new Set([unit])});
    else if(date===old.date)old.units.add(unit);
  }
  const counts=new Map(stores.map(s=>[s.id,0])),units=new Map();
  for(const s of stores){const u=clean(settings(s.id)?.d365?.operatingUnitNumber);if(u){if(units.has(u))throw Error('Magasins D365 ambigus');units.set(u,s.id);}}
  const seen=new Set();let networkTotal=0,unattributed=0,outsideScope=0;
  for(const row of accounts){
    const account=clean(row.AccountNum),area=clean(row.SysDataAreaId??row.dataAreaId),created=clean(row.SysCreatedDateTime);
    if(area!==company||!account||!Number.isFinite(Date.parse(created)))throw Error('Identité ou date de création client manquante');
    if(Date.parse(created)<Date.parse(from)||Date.parse(created)>=Date.parse(until))continue;
    const key=area+'|'+account;if(seen.has(key))continue;seen.add(key);networkTotal++;
    const owner=owners.get(partyNumbers.get(clean(row.Party)));
    if(!owner||owner.units.size!==1){unattributed++;continue;}
    const storeId=units.get([...owner.units][0]);
    if(storeId)counts.set(storeId,counts.get(storeId)+1);else outsideScope++;
  }
  return{status:unattributed?'PARTIAL':'READY',total:[...counts.values()].reduce((a,b)=>a+b,0),networkTotal,unattributed,outsideScope,
    source:'D365/CustTableCDREntities',dateField:'SysCreatedDateTime',timeZone,
    attribution:'EARLIEST_LOYALTY_CARD_OPERATING_UNIT',stores:stores.map(s=>({storeId:s.id,total:counts.get(s.id)}))};
}

export async function readAccountCreations(stores,{startDate,endDate}={}, {read=odataGet,settings=storeOperationalSettings,mode=config.dynamics.mode,company=clean(config.dynamics.dataAreaId)}={}){
  if(mode!=='live'||!company)return{status:'UNAVAILABLE',total:null,source:'ACCOUNT_CREATION_NOT_LIVE'};
  try{
    const from=businessMidnight(startDate),next=new Date(endDate+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);const until=businessMidnight(next.toISOString().slice(0,10));
    if(startDate>endDate)throw Error('Période invalide');
    const chunks=[];let cursor=startDate;
    while(cursor<=endDate){const after=new Date(cursor+'T12:00:00Z');after.setUTCDate(after.getUTCDate()+14);const stop=after.toISOString().slice(0,10),last=stop<=endDate?businessMidnight(stop):until;chunks.push([businessMidnight(cursor),last]);cursor=stop;}
    const readAccounts=async()=>{
      const rows=[];let index=0;
      const worker=async()=>{while(index<chunks.length){const [start,stop]=chunks[index++];rows.push(...await readCompleteCollection('CustTableCDREntities',{filter:`SysDataAreaId eq '${esc(company)}' and CustGroup eq 'Retail' and SysCreatedDateTime ge ${start} and SysCreatedDateTime lt ${stop}`,select:'AccountNum,Party,SysCreatedDateTime,SysDataAreaId',extra:'cross-company=true'},read));}};
      await Promise.all([worker(),worker()]);return rows;
    };
    const [accounts,parties,cards]=await Promise.all([
      readAccounts(),
      readCompleteCollection('DirPartyTableBiEntities',{select:'PartyNumber,SourceKey'},read),
      readCompleteCollection('RetailLoyaltyCards',{select:'CardNumber,PartyNumber,OmOperatingUnitNumber,LoyaltyEnrollmentDate'},read)
    ]);
    const result=aggregateAccountCreations(accounts,parties,cards,stores,{company,startDate,endDate,settings});
    result.enrollments=stores.map(store=>{
      const unit=clean(settings(store.id)?.d365?.operatingUnitNumber),seen=new Set();let missingIdentityRows=0;
      for(const card of cards){const day=clean(card.LoyaltyEnrollmentDate).slice(0,10);if(clean(card.OmOperatingUnitNumber)!==unit||day<startDate||day>endDate)continue;if(clean(card.CardNumber))seen.add(clean(card.CardNumber));else missingIdentityRows++;}
      return{storeId:store.id,status:'READY',total:seen.size,identityBasis:'LOYALTY_CARD',missingIdentityRows,source:'D365/RetailLoyaltyCards'};
    });
    return result;
  }catch(error){return{status:'UNAVAILABLE',total:null,source:'D365/CustTableCDREntities',error:{code:'ACCOUNT_CREATION_READ_FAILED',message:error.message}};}
}
