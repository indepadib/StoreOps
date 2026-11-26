const clean=v=>String(v??'').trim(),quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const kind=v=>{const s=clean(v),m=s.match(/'([^']+)'$/);return (m?m[1]:s.split('.').pop()).toUpperCase()};
const money=v=>Math.round(v*100)/100;
const valid=v=>typeof v==='string'&&v.length>0&&v.length<=160&&!/[\x00-\x1f]/.test(v);
export async function readCustomerWallet({accountRef,company,stores,settings,readCollection}){
 const base={accountRef,source:'D365/RetailLoyaltyCardRewardPointTransactionV2',scope:'APPROVED_PILOT_STORES',currency:'MAD',activationEnabled:false,burn:null,balance:null,burnStatus:'NOT_CONNECTED',balanceStatus:'NOT_CONNECTED'};
 const unavailable=reason=>({...base,status:'UNAVAILABLE',reason,earn:null,credits:null,reversals:null,entryCount:null});
 if(!valid(accountRef)||!valid(company)||['0','ANONYMOUS','ANONYME','CASH','CASH CUSTOMER','WALK-IN','WALK IN'].includes(accountRef.toUpperCase())||!Array.isArray(stores)||!stores.length||stores.length>2)return unavailable('WALLET_SCOPE_INVALID');
 try{
  const units=stores.map(s=>{const d=settings(s.id)?.d365;if(clean(d?.legalEntityId)!==company||!valid(clean(d?.operatingUnitNumber)))throw Error('Store mapping');return clean(d.operatingUnitNumber)});
  if(new Set(units).size!==units.length)throw Error('Store mapping ambiguous');
  const definitions=await readCollection('RetailLoyaltyRewardPoints',{select:'RewardPointId,RewardPointType,RewardPointCurrency,Redeemable',extra:'cross-company=true'});
  if(!Array.isArray(definitions)||definitions.length>10000)throw Error('Definition coverage');
  const rewards=new Map();
  for(const r of definitions){const id=clean(r.RewardPointId),ok=kind(r.RewardPointType)==='AMOUNT'&&clean(r.RewardPointCurrency).toUpperCase()==='MAD'&&kind(r.Redeemable)==='YES';if(!id||rewards.has(id)&&rewards.get(id)!==ok)throw Error('Definition ambiguity');rewards.set(id,ok)}
  if(![...rewards.values()].some(Boolean))return unavailable('WALLET_MAD_REWARD_UNMAPPED');
  const filter='LoyaltyTransactionCompany eq '+quote(company)+' and CustomerAccount eq '+quote(accountRef)+' and ('+units.map(u=>'OperatingUnitNumber eq '+quote(u)).join(' or ')+')';
  const rows=await readCollection('RetailLoyaltyCardRewardPointTransactionV2',{filter,select:'LoyaltyTransactionCompany,OperatingUnitNumber,storeId,Terminal,TransactionNumber,LoyaltyTransactionLineNumber,EntryDate,EntryType,RewardPointId,RewardPointAmountQty,CardNumber,CustomerAccount',extra:'cross-company=true'});
  if(!Array.isArray(rows)||rows.length>10000)return unavailable('WALLET_SOURCE_LIMIT');
  let credits=0,reversals=0;const seen=new Map(),otherTypes=new Set();
  for(const r of rows){
   if(clean(r.LoyaltyTransactionCompany)!==company||clean(r.CustomerAccount)!==accountRef||!units.includes(clean(r.OperatingUnitNumber))||!Number.isFinite(Date.parse(r.EntryDate)))throw Error('Source scope');
   if(kind(r.EntryType)!=='EARN'){otherTypes.add(kind(r.EntryType));continue}
   const id=clean(r.RewardPointId);if(!rewards.has(id))throw Error('Unknown reward');if(!rewards.get(id))continue;
   if(r.RewardPointAmountQty==null||clean(r.RewardPointAmountQty)===''||!Number.isFinite(Number(r.RewardPointAmountQty))||!clean(r.TransactionNumber)||!clean(r.LoyaltyTransactionLineNumber))throw Error('Entry identity');
   const key=JSON.stringify([company,r.OperatingUnitNumber,r.storeId,r.Terminal,r.TransactionNumber,r.LoyaltyTransactionLineNumber,r.EntryDate,r.EntryType,id,r.CardNumber,accountRef]),amount=Number(r.RewardPointAmountQty);
   if(seen.has(key)){if(seen.get(key)!==amount)throw Error('Entry conflict');continue}
   seen.set(key,amount);if(amount>=0)credits+=amount;else reversals+=amount;
  }
  if(![credits,reversals,credits+reversals].every(n=>Number.isSafeInteger(Math.round(n*100))))throw Error('Amount overflow');
  return {...base,status:'READY',reason:null,earn:money(credits+reversals),credits:money(credits),reversals:money(reversals),entryCount:seen.size,storeIds:stores.map(s=>s.id),checkedAt:new Date().toISOString(),basis:'ACCOUNT_ATTRIBUTED_MONETARY_EARN_NET',coverage:'ACCOUNT_FIELD_ONLY'};
 }catch(e){return unavailable(e?.code==='D365_REQUEST_TIMEOUT'?'WALLET_SOURCE_TIMEOUT':'WALLET_SOURCE_UNAVAILABLE')}
}
