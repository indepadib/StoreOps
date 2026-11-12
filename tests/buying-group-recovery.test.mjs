import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {serveRebateRecovery,rebateRecoveryValidation as v} from '../backend/services/buying-group-recovery.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const agreementId='11111111-1111-4111-8111-111111111111';
const claimId='22222222-2222-4222-8222-222222222222';
const user={id:'director-a'};
const today='2026-11-12';
const sample={contractId:agreementId,entityCode:'FRANPRIX',periodFrom:'2026-01-01',
 periodTo:'2026-09-30',claimedMad:'12345.67',claimReference:'RFA-FRP-Q3',
 sourceReference:'Lot achats - justificatif 2026-Q3'};
const req=(route,body)=>new Request('https://storeops.ma/api/buying-group/recovery/'+route,{
 method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function txDb({contractStatus='ACTIVE',claimStatus='DRAFT',settled='0.00'}={}){
 const log=[];
 const client={
  async query(sql,args){
   log.push({sql:String(sql),args});
   if(sql.includes('FROM hs_buying.contracts WHERE id=$1 FOR UPDATE'))
    return{rows:[{id:agreementId,status:contractStatus,title:'Accord Lesieur',scope:'LOCAL',
      entity_code:'FRANPRIX',effective_from:'2026-01-01',effective_to:'2026-12-31'}]};
   if(sql.includes('FROM hs_buying.rebate_claims WHERE id=$1 FOR UPDATE'))
    return{rows:[{id:claimId,status:claimStatus,claimed_mad:'12345.67'}]};
   if(sql.includes('COALESCE(SUM(amount_mad),0)::text'))
    return{rows:[{amount:settled}]};
   if(sql.includes('INSERT INTO hs_buying.rebate_claims'))
    return{rows:[{id:claimId,status:'DRAFT',claimed_mad:sample.claimedMad}]};
   if(sql.includes('INSERT INTO hs_buying.rebate_settlements'))
    return{rows:[{id:claimId,kind:'CREDIT_NOTE',amount_mad:'200.00'}]};
   if(sql.includes('UPDATE hs_buying.rebate_claims'))
    return{rows:[{id:claimId,status:'SUBMITTED'}]};
   return{rows:[]};
  },release(){}
 };
 return{db:{pool:{connect:async()=>client}},log};
}
test('MAD parsing uses exact minor units and rejects malformed amounts',()=>{
 assert.equal(v.moneyCents('12345.67'),1234567n);
 assert.equal(v.centsAsMAD(1234567n),'12345.67');
 assert.equal(v.centsFromDB('12345.67'),1234567n);
 assert.equal(v.centsFromDB('-12.33'),-1233n);
 assert.throws(()=>v.moneyCents('12,50'),/Montant/);
 assert.throws(()=>v.moneyCents('12.333'),/Montant/);
 assert.throws(()=>v.moneyCents('0'),/hors limites/);
});
test('Claim validation requires dates, sources, contract and legal entity',()=>{
 assert.equal(v.validateClaim(sample).claimedMad,'12345.67');
 assert.throws(()=>v.validateClaim({...sample,periodTo:'2026-02-30'}),/Période/);
 assert.throws(()=>v.validateClaim({...sample,sourceReference:''}),/pièce justificative/);
 assert.throws(()=>v.validateClaim({...sample,entityCode:'UNKNOWN'}),/Enseigne/);
});
test('New rebate claim is drafted without fictitious settlement or ERP posting',async()=>{
 const {db,log}=txDb();
 const res=await serveRebateRecovery(req('claims',sample),db,user);
 assert.equal(res.status,201);
 const data=await res.json();assert.equal(data.item.status,'DRAFT');
 assert.ok(log.some(x=>x.sql.includes('INSERT INTO hs_buying.rebate_claims')));
 assert.ok(log.some(x=>x.sql.includes('RFA_CLAIM_DRAFTED')||x.args?.includes('RFA_CLAIM_DRAFTED')));
 assert.ok(log.some(x=>x.sql==='COMMIT'));
 assert.equal(log.some(x=>/INSERT INTO .*dynamics/i.test(x.sql)),false);
});
test('Cannot claim on unapproved contract, out of period, or wrong legal entity',async()=>{
 for(const [status,data] of [
  ['DRAFT',sample],
  ['ACTIVE',{...sample,periodTo:'2027-01-01'}],
  ['ACTIVE',{...sample,entityCode:'VENEZIA'}]
 ]){
  const {db,log}=txDb({contractStatus:status});
  const res=await serveRebateRecovery(req('claims',data),db,user);
  assert.ok([409,422].includes(res.status));
  assert.ok(log.some(x=>x.sql==='ROLLBACK'));
  assert.equal(log.some(x=>x.sql.includes('INSERT INTO hs_buying.rebate_claims')),false);
 }
});
test('Changing status requires supplier evidence and permitted transition',async()=>{
 const {db}=txDb({claimStatus:'DRAFT'});
 const missing=await serveRebateRecovery(req('claims/'+claimId+'/status',{status:'SUBMITTED'}),db,user);
 assert.equal(missing.status,422);
 const invalid=await serveRebateRecovery(req('claims/'+claimId+'/status',{status:'CLOSED',evidenceReference:'email fournisseur'}),db,user);
 assert.equal(invalid.status,409);
 const okay=await serveRebateRecovery(req('claims/'+claimId+'/status',{status:'SUBMITTED',evidenceReference:'email fournisseur du 12 novembre'}),db,user);
 assert.equal(okay.status,200);
});
test('Cannot close a claim unless all referenced pieces match the amount',async()=>{
 const {db}=txDb({claimStatus:'ACKNOWLEDGED',settled:'100.00'});
 const res=await serveRebateRecovery(req('claims/'+claimId+'/status',{status:'CLOSED',evidenceReference:'contrôle des pièces'}),db,user);
 assert.equal(res.status,409);
 assert.match((await res.json()).error,/Clôture impossible/);
});
test('Settlement requires a traceable piece and cannot exceed the claimed amount',async()=>{
 assert.throws(()=>v.validateSettlement({kind:'CREDIT_NOTE',amountMad:'100',evidenceDate:today,evidenceReference:''}),/Référence/);
 const {db}=txDb({claimStatus:'ACKNOWLEDGED',settled:'12300.00'});
 const excessive=await serveRebateRecovery(req('claims/'+claimId+'/settlements',{
  kind:'CREDIT_NOTE',amountMad:'200.00',evidenceDate:today,evidenceReference:'AV-2026-234'
 }),db,user);
 assert.equal(excessive.status,409);
 const exact=await serveRebateRecovery(req('claims/'+claimId+'/settlements',{
  kind:'CREDIT_NOTE',amountMad:'45.67',evidenceDate:today,evidenceReference:'AV-2026-235'
 }),db,user);
 assert.equal(exact.status,201);
});
test('Summary totals query spans entire ledger, not last 300 visible claims',()=>{
 const src=read('backend/services/buying-group-recovery.mjs');
 assert.match(src,/SUM\(CASE WHEN c\.status/);
 assert.match(src,/GROUP BY claim_id/);
 assert.match(src,/partialList:items\.length===300/);
 assert.doesNotMatch(src,/booked:\s*true/);
});
test('Recovery UI stays within StoreOps, uses zero invented example data and accessible form fields',()=>{
 const src=read('frontend/js/pages/buying-group-recovery.js'),
  nav=read('frontend/js/pages/buying-group.js'),
  theme=read('frontend/centrale-achat/hs-procurement-blue.css'),
  html=read('frontend/centrale-achat/index.html');
 assert.match(src,/Registre de recouvrement/);
 assert.match(src,/sourceReference/);
 assert.match(src,/evidenceReference/);
 assert.match(src,/new FormData/);
 assert.match(nav,/id:'recovery'/);
 assert.match(nav,/renderRebateRecovery\(recoveryHost\)/);
 assert.doesNotMatch(nav,/https:\/\/hs-buying-group-os\.vercel\.app/);
 assert.match(theme,/#102f59/);
 assert.match(html,/class="buying-skip"/);
 assert.doesNotMatch(src,/window\.location|https:\/\/anthropic\.com/);
});
test('Schema separates supplier claim from proof ledger with audit and uniqueness controls',()=>{
 const migration=read('netlify/database/migrations/20261112201500_hs_rebate_claims_settlements.sql');
 assert.match(migration,/CREATE TABLE IF NOT EXISTS hs_buying\.rebate_claims/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS hs_buying\.rebate_settlements/);
 assert.match(migration,/UNIQUE\(contract_id,entity_code,period_from,period_to\)/);
 assert.match(migration,/UNIQUE\(claim_id,kind,evidence_reference\)/);
 assert.match(migration,/REVOKE ALL ON ALL TABLES IN SCHEMA hs_buying FROM PUBLIC/);
});
