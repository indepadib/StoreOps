import assert from 'node:assert/strict';
import {discoverWalletBalanceSources} from '../services/one-crm-wallet-balance-source.mjs';
const read=async q=>{assert.equal(q,'loyalty');return [{PublicEntityName:'RetailLoyaltyCardBalances',ExampleCustomer:'PRIVATE'},{EntitySetName:'RetailLoyaltyRewardPoints'},{Name:'RetailLoyaltyCardBalances'},{Name:'UnrelatedEntity'},{Name:'RetailLoyaltyCardBalance<script>'}]};
const x=await discoverWalletBalanceSources({mode:'live',listEntities:read});
assert.equal(x.status,'READY');assert.equal(x.balance,null);assert.equal(x.balanceStatus,'NOT_VERIFIED');assert.deepEqual(x.candidates,['RetailLoyaltyCardBalances','RetailLoyaltyRewardPoints']);assert.ok(!JSON.stringify(x).includes('PRIVATE'));
assert.equal((await discoverWalletBalanceSources({mode:'simulated',listEntities:()=>{throw Error('must not read')}})).reason,'LIVE_SOURCE_REQUIRED');
assert.equal((await discoverWalletBalanceSources({mode:'live',listEntities:async()=>{throw Error('private')}})).reason,'METADATA_READ_FAILED');
assert.equal((await discoverWalletBalanceSources({mode:'live',listEntities:async()=>[]})).reason,'NO_BALANCE_CANDIDATE_FOUND');
console.log('Wallet balance metadata discovery contract passed');
