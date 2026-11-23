import {config} from '../config.mjs';
import {odataGet} from './dynamics.mjs';
import {storeOperationalSettings} from './store-settings.mjs';

const transactionEntity='RetailLoyaltyCardRewardPointTransactionV2';
const rewardEntity='RetailLoyaltyRewardPoints';
const clean=value=>String(value??'').trim();
const escape=value=>clean(value).replaceAll("'","''");
const enumValue=value=>{
 const text=clean(value),literal=text.match(/'([^']+)'$/);
 return (literal?literal[1]:text.split('.').pop()).toUpperCase();
};
const dayAfter=day=>new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const validDay=day=>/^\d{4}-\d{2}-\d{2}$/.test(day||'')&&Number.isFinite(Date.parse(day))&&new Date(Date.parse(day)).toISOString().slice(0,10)===day;
const failure=code=>Object.assign(new Error(code),{code});

async function readPages(entity,query,get,maxRows){
 const rows=[],cursors=new Set();
 let continuation=null,pages=0;
 do{
  // Let Dynamics page the full collection. A finite $top limits the entire
  // OData result and can hide records even when no nextLink is returned.
  const payload=await get(entity,{...query,top:null,continuation});
  pages++;
  if(!Array.isArray(payload?.value))throw failure('WALLET_EARN_MALFORMED_COLLECTION');
  rows.push(...payload.value);
  const next=payload['@odata.nextLink'];
  if(rows.length>maxRows||rows.length===maxRows&&next)throw failure('WALLET_EARN_TRUNCATED');
  if(next!=null&&typeof next!=='string')throw failure('WALLET_EARN_MALFORMED_CONTINUATION');
  if(next&&cursors.has(next))throw failure('WALLET_EARN_REPEATED_CONTINUATION');
  if(next)cursors.add(next);
  continuation=next||null;
 }while(continuation);
 return {rows,pages};
}

/**
 * Monetary loyalty Earn entries, scoped to a store's operating unit and company.
 * EntryDate is the source's business date. Point amounts are admitted only when
 * the reward definition explicitly declares a redeemable MAD amount.
 */
export async function readStoreWalletEarn(storeId,{startDate,endDate}={},{
 get=odataGet,
 settings=storeOperationalSettings,
 mode=config.dynamics.mode,
 maxRows=100000,
}={}){
 const base={storeId,startDate,endDate,currency:'MAD',total:null,earn:null,credits:null,reversals:null,complete:false,
  source:'D365/'+transactionEntity,
  provenance:{entity:transactionEntity,rewardEntity,dateField:'EntryDate',dateBasis:'BUSINESS_DATE',entryType:'Earn',amountField:'RewardPointAmountQty'},
 };
 if(!validDay(startDate)||!validDay(endDate)||startDate>endDate)return {...base,status:'UNAVAILABLE',reason:'WALLET_EARN_INVALID_PERIOD'};
 if(mode!=='live')return {...base,status:'UNAVAILABLE',reason:'WALLET_EARN_NOT_LIVE'};
 const store=settings(storeId),unit=clean(store?.d365?.operatingUnitNumber),company=clean(store?.d365?.legalEntityId||config.dynamics.dataAreaId);
 if(!unit||!company)return {...base,status:'UNAVAILABLE',reason:'WALLET_EARN_STORE_UNMAPPED'};
 if(!Number.isInteger(maxRows)||maxRows<1||maxRows>100000)throw failure('WALLET_EARN_INVALID_CAP');
 try{
  const definitions=await readPages(rewardEntity,{
   select:'RewardPointId,RewardPointType,RewardPointCurrency,Redeemable',
   extra:'cross-company=true',
  },get,maxRows);
  const monetary=new Map();
  for(const row of definitions.rows){
   const id=clean(row.RewardPointId);
   if(!id)throw failure('WALLET_EARN_REWARD_MAPPING_INCOMPLETE');
   const qualifies=enumValue(row.RewardPointType)==='AMOUNT'&&clean(row.RewardPointCurrency).toUpperCase()==='MAD'&&enumValue(row.Redeemable)==='YES';
   if(monetary.has(id)&&monetary.get(id)!==qualifies)throw failure('WALLET_EARN_REWARD_MAPPING_CONFLICT');
   monetary.set(id,qualifies);
  }
  const rewardPointIds=[...monetary].filter(([,qualified])=>qualified).map(([id])=>id);
  if(!rewardPointIds.length)return {...base,status:'UNAVAILABLE',reason:'WALLET_EARN_MAD_REWARD_UNMAPPED'};
  const filter=`LoyaltyTransactionCompany eq '${escape(company)}' and OperatingUnitNumber eq '${escape(unit)}' and EntryDate ge ${startDate}T00:00:00Z and EntryDate lt ${dayAfter(endDate)}T00:00:00Z`;
  const transactions=await readPages(transactionEntity,{
   filter,
   select:'LoyaltyTransactionCompany,OperatingUnitNumber,storeId,Terminal,TransactionNumber,LoyaltyTransactionLineNumber,EntryDate,EntryType,RewardPointId,RewardPointAmountQty,CardNumber,CustomerAccount',
   extra:'cross-company=true',
  },get,maxRows);
  let credits=0,reversals=0,entryCount=0,ignoredNonMonetary=0,ignoredOtherTypes=0,duplicates=0;
  const seen=new Map();
  for(const row of transactions.rows){
   const entryDay=clean(row.EntryDate).slice(0,10);
   if(clean(row.LoyaltyTransactionCompany)!==company||clean(row.OperatingUnitNumber)!==unit||!validDay(entryDay)||entryDay<startDate||entryDay>endDate)throw failure('WALLET_EARN_SCOPE_MISMATCH');
   if(enumValue(row.EntryType)!=='EARN'){ignoredOtherTypes++;continue;}
   const rewardId=clean(row.RewardPointId);
   if(!monetary.has(rewardId))throw failure('WALLET_EARN_UNKNOWN_REWARD');
   if(!monetary.get(rewardId)){ignoredNonMonetary++;continue;}
   if(row.RewardPointAmountQty==null||clean(row.RewardPointAmountQty)===''||!Number.isFinite(Number(row.RewardPointAmountQty)))throw failure('WALLET_EARN_INVALID_AMOUNT');
   if(!clean(row.TransactionNumber)||!clean(row.LoyaltyTransactionLineNumber))throw failure('WALLET_EARN_TRANSACTION_ID_MISSING');
   const identity=JSON.stringify([company,unit,row.storeId,row.Terminal,row.TransactionNumber,row.LoyaltyTransactionLineNumber,row.EntryDate,row.EntryType,rewardId,row.CardNumber,row.CustomerAccount]);
   const amount=Number(row.RewardPointAmountQty);
   if(seen.has(identity)){
    if(seen.get(identity)!==amount)throw failure('WALLET_EARN_DUPLICATE_CONFLICT');
    duplicates++;continue;
   }
   seen.set(identity,amount);entryCount++;
   if(amount>=0)credits+=amount;
   else reversals+=amount;
  }
  const round=value=>Math.round((value+Number.EPSILON)*100)/100;
  const net=round(credits+reversals);
  return {...base,status:'READY',complete:true,total:net,earn:net,credits:round(credits),reversals:round(reversals),
   entryCount,rowCount:transactions.rows.length,pages:transactions.pages,
   provenance:{...base.provenance,company,operatingUnit:unit,rewardPointIds,rewardDefinitionPages:definitions.pages,ignoredNonMonetary,ignoredOtherTypes,duplicates},
  };
 }catch(error){
  return {...base,status:error?.code==='WALLET_EARN_TRUNCATED'?'TRUNCATED':'UNAVAILABLE',reason:clean(error?.code)||'WALLET_EARN_READ_FAILED'};
 }
}
