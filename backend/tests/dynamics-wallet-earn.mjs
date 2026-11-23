import assert from 'node:assert/strict';
process.env.STOREOPS_DB=':memory:';
const {readStoreWalletEarn}=await import('../services/dynamics-wallet-earn.mjs');

const definitions=[
 {RewardPointId:'MAD',RewardPointType:'Amount',RewardPointCurrency:'MAD',Redeemable:'Yes'},
 {RewardPointId:'PTS',RewardPointType:'Quantity',RewardPointCurrency:'MAD',Redeemable:'Yes'},
 {RewardPointId:'EUR',RewardPointType:'Amount',RewardPointCurrency:'EUR',Redeemable:'Yes'},
 {RewardPointId:'LOCKED',RewardPointType:'Amount',RewardPointCurrency:'MAD',Redeemable:'No'},
];
const row=(line,amount,overrides={})=>({
 LoyaltyTransactionCompany:'COMPANY',OperatingUnitNumber:'UNIT',storeId:'STORE',Terminal:'TERMINAL',
 TransactionNumber:'TRANSACTION',LoyaltyTransactionLineNumber:String(line),EntryDate:'2026-11-01T12:00:00Z',
 EntryType:'Earn',RewardPointId:'MAD',RewardPointAmountQty:amount,...overrides,
});
const options={startDate:'2026-11-01',endDate:'2026-11-30'};
const settings=()=>({d365:{operatingUnitNumber:'UNIT',legalEntityId:'COMPANY'}});
const pages=[
 {value:[row(1,10),row(2,-2.5)],'@odata.nextLink':'?%24skiptoken=cursor%2Bopaque'},
 {value:[row(1,10),row(3,5),row(4,200,{RewardPointId:'PTS'}),row(5,5,{EntryType:'Redeem'}),row(6,20,{RewardPointId:'EUR'})]},
];
const calls=[];
const get=async(entity,query)=>{
 calls.push({entity,query});
 if(entity==='RetailLoyaltyRewardPoints')return{value:definitions};
 return pages[query.continuation?1:0];
};
const result=await readStoreWalletEarn('store',options,{get,settings,mode:'live'});
assert.equal(result.status,'READY');
assert.equal(result.complete,true);
assert.equal(result.credits,15);
assert.equal(result.reversals,-2.5);
assert.equal(result.earn,12.5);
assert.equal(result.total,12.5);
assert.equal(result.entryCount,3);
assert.equal(result.provenance.duplicates,1);
assert.equal(result.provenance.ignoredNonMonetary,2);
assert.equal(result.pages,2);
assert.deepEqual(result.provenance.rewardPointIds,['MAD']);
assert.equal(calls[1].query.top,null,'server pagination must not limit the total collection with $top');
assert.equal(calls[2].query.continuation,pages[0]['@odata.nextLink']);
assert.match(calls[1].query.filter,/OperatingUnitNumber eq 'UNIT'/);
assert.match(calls[1].query.filter,/LoyaltyTransactionCompany eq 'COMPANY'/);
assert.match(calls[1].query.filter,/EntryDate lt 2026-12-01T00:00:00Z/);
assert.equal(JSON.stringify(result).includes('CardNumber'),false);

async function run(transactions,defs=definitions,overrides={}){
 return readStoreWalletEarn('store',options,{mode:'live',settings,
  get:async entity=>entity==='RetailLoyaltyRewardPoints'?{value:defs}:transactions,...overrides});
}
assert.equal((await run({value:[]})).total,0);
assert.equal((await run({value:[row(1,-5)]})).earn,-5);
assert.equal((await run({value:[row(1,0)]})).earn,0);
assert.equal((await run({value:[row(1,10,{EntryType:"Namespace.Type'Earn'"})]})).earn,10);
assert.equal((await run({value:[row(1,null)]})).reason,'WALLET_EARN_INVALID_AMOUNT');
assert.equal((await run({value:[row(1,10,{RewardPointId:'UNKNOWN'})]})).reason,'WALLET_EARN_UNKNOWN_REWARD');
assert.equal((await run({value:[row(1,10,{OperatingUnitNumber:'OTHER'})]})).reason,'WALLET_EARN_SCOPE_MISMATCH');
assert.equal((await run({value:[row(1,10,{EntryDate:'2026-12-01T12:00:00Z'})]})).reason,'WALLET_EARN_SCOPE_MISMATCH');
assert.equal((await run({value:[row(1,10),row(1,20)]})).reason,'WALLET_EARN_DUPLICATE_CONFLICT');
assert.equal((await run({value:[]},definitions.filter(x=>x.RewardPointId!=='MAD'))).reason,'WALLET_EARN_MAD_REWARD_UNMAPPED');
const truncated=await run({value:[row(1,1),row(2,2)],'@odata.nextLink':'?cursor=next'},definitions,{maxRows:2});
assert.equal(truncated.status,'TRUNCATED');
assert.equal(truncated.total,null);
const broken=await run({});
assert.equal(broken.status,'UNAVAILABLE');
assert.equal(broken.total,null);
const unavailable=await run({value:[]},definitions,{get:async()=>{throw new Error('internal transport details')}});
assert.equal(unavailable.status,'UNAVAILABLE');
assert.equal(unavailable.total,null);
assert.equal(JSON.stringify(unavailable).includes('internal transport details'),false);
const missingStore=await run({value:[]},definitions,{settings:()=>({})});
assert.equal(missingStore.reason,'WALLET_EARN_STORE_UNMAPPED');
assert.equal((await readStoreWalletEarn('store',{startDate:'2026-02-30',endDate:'2026-03-01'},{mode:'live',settings,get})).reason,'WALLET_EARN_INVALID_PERIOD');
console.log('PASS Wallet Earn monetary MAD scope, signed reversals, opaque continuation, deduplication and incomplete-source gates');
