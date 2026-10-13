import { config } from '../config.mjs';
import { listDataEntities, probeDataEntity, odataGetAll } from './dynamics.mjs';
import { salesStoreIdentifiers } from './d365-sales-mapping.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>String(v).replaceAll("'","''");
const validName=v=>/^[A-Za-z0-9_]+$/.test(clean(v));
const cache=new Map();
const ttlMs=()=>Math.max(30_000,Math.min(600_000,Number(process.env.RETAIL_ANALYTICS_TENDER_CACHE_MS)||120_000));

function metaEntityName(row={}){
  return clean(
    row.PublicEntityName||
    row.EntitySetName||
    row.Name||
    row.DataEntityName||
    row.EntityName||
    row.CollectionName
  );
}
function unique(values=[]){return [...new Set(values.map(clean).filter(Boolean))]}
function keyMatch(row,candidates=[]){
  const keys=Object.keys(row||{});
  for(const candidate of candidates){
    const exact=keys.find(k=>k.toLowerCase()===clean(candidate).toLowerCase());
    if(exact)return exact;
  }
  return null;
}
function nextDate(day){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
function dateVariants(field,day){
  return [
    {mode:'DATE',filter:`${field} eq ${day}`},
    {mode:'DATE_STRING',filter:`${field} eq '${esc(day)}'`},
    {mode:'DATETIME',filter:`${field} ge ${day}T00:00:00Z and ${field} lt ${nextDate(day)}T00:00:00Z`}
  ];
}
function storeFilters(field,value){
  const v=clean(value),out=[`${field} eq '${esc(v)}'`];
  if(/^-?\d+(?:\.\d+)?$/.test(v))out.push(`${field} eq ${v}`);
  return [...new Set(out)];
}
function paymentFieldMap(row={}){
  return {
    transaction:keyMatch(row,['TransactionId','transactionId','RetailTransactionId','TransactionNumber']),
    store:keyMatch(row,['StoreId','storeId','Store','RetailStoreId','ChannelReferenceId','RetailChannelId','Channel']),
    date:keyMatch(row,['BusinessDate','businessDate','TransactionDate','TransDate','Date','CreatedDate']),
    amount:keyMatch(row,['Amount','PaymentAmount','TenderAmount','AmountCur','AmountInTransactionCurrency','PaymentAmountInTransactionCurrency']),
    tender:keyMatch(row,['TenderTypeId','tenderTypeId','TenderType','PaymentMethodId','PaymentMethodNumber','PaymentMethod','TenderId']),
    currency:keyMatch(row,['Currency','CurrencyCode','TransactionCurrencyCode']),
    terminal:keyMatch(row,['TerminalId','terminalId','RegisterId'])
  };
}
function mappingComplete(fields={}){
  return !!(fields.store&&fields.date&&fields.amount&&fields.tender);
}
async function discoverPaymentSchema(){
  const explicit=clean(process.env.D365_TENDER_PAYMENT_ENTITY);
  const metadata=await listDataEntities('payment').catch(()=>[]);
  const names=unique([
    explicit,
    'RetailTransactionPaymentTransactions',
    'RetailTransactionPaymentTrans',
    'RetailTransactionPaymentTransEntity',
    'RetailPaymentTransactions',
    ...metadata.map(metaEntityName).filter(n=>/payment/i.test(n)&&/transaction|retail/i.test(n))
  ]).filter(validName);

  let lastError=null;
  for(const entity of names){
    try{
      const probe=await probeDataEntity(entity,{top:5,extra:config.dynamics.dataAreaId?'cross-company=true':''});
      const sample=probe?.rows?.find(row=>Object.keys(row||{}).length)||probe?.rows?.[0]||null;
      if(!probe?.ok||!sample)continue;
      const fields=paymentFieldMap(sample);
      if(mappingComplete(fields))return{status:'READY',entity,fields,sampleKeys:Object.keys(sample)};
    }catch(error){lastError=error}
  }
  return{status:'UNAVAILABLE',entity:null,fields:null,error:{code:lastError?.code||'D365_TENDER_ENTITY_UNMAPPED',message:lastError?.message||'Aucune Data Entity de paiements retail exploitable détectée.'}};
}
async function tenderNameMap(){
  const explicit=clean(process.env.D365_TENDER_TYPE_ENTITY);
  const metadata=await listDataEntities('tender').catch(()=>[]);
  const names=unique([
    explicit,
    'RetailTenderTypeEntity',
    'RetailTenderTypes',
    ...metadata.map(metaEntityName).filter(n=>/tender/i.test(n)&&/type|payment/i.test(n))
  ]).filter(validName);

  for(const entity of names){
    try{
      const probe=await probeDataEntity(entity,{top:5,extra:config.dynamics.dataAreaId?'cross-company=true':''});
      const sample=probe?.rows?.find(row=>Object.keys(row||{}).length)||probe?.rows?.[0]||null;
      if(!sample)continue;
      const idField=keyMatch(sample,['PaymentMethodNumber','TenderTypeId','tenderTypeId','PaymentMethodId','Id']);
      const nameField=keyMatch(sample,['Name','name','Description','PaymentMethodName']);
      if(!idField||!nameField)continue;
      const payload=await odataGetAll(entity,{select:`${idField},${nameField}`,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:250,maxRows:3000});
      const map=new Map();
      for(const row of payload.value||[]){
        const id=clean(row[idField]),name=clean(row[nameField]);if(id)map.set(id,name||id);
      }
      return{status:'READY',entity,idField,nameField,map};
    }catch{}
  }
  return{status:'UNAVAILABLE',entity:null,map:new Map()};
}
function configuredWalletIds(){
  return unique(clean(process.env.D365_WALLET_TENDER_IDS||process.env.D365_WALLET_TENDER_ID).split(','));
}
function isWalletValue(value,nameMap,walletIds){
  const raw=clean(value);
  if(!raw)return false;
  if(walletIds.includes(raw))return true;
  if(/wallet/i.test(raw))return true;
  const label=clean(nameMap.get(raw));
  return /wallet/i.test(label);
}
function signProfile(rows,amountField){
  let positive=0,negative=0,zero=0,sum=0,gross=0;
  for(const row of rows){
    const n=Number(row?.[amountField]);if(!Number.isFinite(n))continue;
    sum+=n;gross+=Math.abs(n);
    if(n>0)positive++;else if(n<0)negative++;else zero++;
  }
  return{positive,negative,zero,netAmount:Math.round(sum*100)/100,grossAbsoluteAmount:Math.round(gross*100)/100};
}
function derivedBurn(profile){
  if(profile.positive>0&&profile.negative===0)return{amount:profile.netAmount,signMode:'POSITIVE'};
  if(profile.negative>0&&profile.positive===0)return{amount:Math.abs(profile.netAmount),signMode:'NEGATIVE'};
  if(profile.positive===0&&profile.negative===0)return{amount:0,signMode:'ZERO'};
  return{amount:null,signMode:'MIXED_SIGN_VALIDATION_REQUIRED'};
}

export async function readWalletBurn(storeId,{businessDate=new Date().toISOString().slice(0,10),force=false}={}){
  const day=/^\d{4}-\d{2}-\d{2}$/.test(clean(businessDate))?clean(businessDate):new Date().toISOString().slice(0,10);
  const key=`${storeId}|${day}`,hit=cache.get(key);
  if(!force&&hit&&Date.now()<hit.expiresAt)return{...hit.value,cache:{status:'HIT'}};

  if(config.dynamics.mode!=='live'){
    return{status:'UNAVAILABLE',storeId,businessDate:day,burn:null,source:'D365_NOT_LIVE',message:'Le burn Wallet exige la source de paiement réelle.'};
  }

  const schema=await discoverPaymentSchema();
  if(schema.status!=='READY'){
    return{status:'UNAVAILABLE',storeId,businessDate:day,burn:null,source:'PAYMENT_ENTITY_UNMAPPED',diagnostics:schema};
  }

  const tenderTypes=await tenderNameMap();
  const walletIds=configuredWalletIds();
  const identifiers=salesStoreIdentifiers(storeId,schema.fields.store);
  if(!identifiers.length){
    return{status:'UNAVAILABLE',storeId,businessDate:day,burn:null,source:'STORE_IDENTIFIER_UNMAPPED',entity:schema.entity,fields:schema.fields};
  }

  const select=unique([
    schema.fields.transaction,schema.fields.store,schema.fields.date,schema.fields.amount,
    schema.fields.tender,schema.fields.currency,schema.fields.terminal,
    config.dynamics.dataAreaId?config.dynamics.dataAreaField:null
  ]).join(',');

  let rows=null,selected=null,lastError=null;
  outer:for(const identifier of identifiers){
    for(const sf of storeFilters(schema.fields.store,identifier.value)){
      for(const dv of dateVariants(schema.fields.date,day)){
        const filters=[sf,dv.filter];
        if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
        try{
          const result=await odataGetAll(schema.entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:500,maxRows:25000});
          rows=result.value||[];
          selected={identifier,storeFilter:sf,dateMode:dv.mode,rowCount:result.rowCount||rows.length,pages:result.pages||0,truncated:!!result.truncated};
          if(rows.length)break outer;
          if(rows!==null)break outer;
        }catch(error){lastError=error}
      }
    }
  }

  if(rows===null){
    return{status:'UNAVAILABLE',storeId,businessDate:day,burn:null,source:'D365_PAYMENT_READ_FAILED',entity:schema.entity,fields:schema.fields,error:{code:lastError?.code||'D365_PAYMENT_READ_FAILED',message:lastError?.message||String(lastError||'Lecture paiement impossible')}};
  }

  const walletRows=rows.filter(row=>isWalletValue(row?.[schema.fields.tender],tenderTypes.map,walletIds));
  const profile=signProfile(walletRows,schema.fields.amount),burn=derivedBurn(profile);
  const value={
    status:burn.amount===null?'SIGN_VALIDATION_REQUIRED':'READY',
    storeId,businessDate:day,
    burn:burn.amount,
    signMode:burn.signMode,
    walletTransactions:walletRows.length,
    allPaymentRows:rows.length,
    source:`D365/${schema.entity}`,
    entity:schema.entity,
    fields:schema.fields,
    walletIds:[...new Set([
      ...walletIds,
      ...[...tenderTypes.map.entries()].filter(([,name])=>/wallet/i.test(clean(name))).map(([id])=>id)
    ])],
    tenderTypeSource:tenderTypes.status==='READY'?tenderTypes.entity:null,
    signProfile:profile,
    diagnostics:{
      storeIdentifierKind:selected?.identifier?.kind||null,
      storeIdentifier:selected?.identifier?.value||null,
      dateMode:selected?.dateMode||null,
      rowCount:selected?.rowCount??rows.length,
      pages:selected?.pages||0,
      truncated:!!selected?.truncated
    },
    checkedAt:new Date().toISOString()
  };

  cache.set(key,{value,expiresAt:Date.now()+ttlMs()});
  return{...value,cache:{status:'MISS'}};
}

export function clearWalletBurnCache(storeId=null){
  if(!storeId){cache.clear();return}
  for(const key of cache.keys())if(key.startsWith(storeId+'|'))cache.delete(key);
}