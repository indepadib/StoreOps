import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../services/vendor-directory.mjs',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replace('export async function vendorNamesMany','async function vendorNamesMany');
function directory({probe,read}={}){
 let now=Date.now();
 const config={dynamics:{mode:'live',dataAreaId:'5001',dataAreaField:'dataAreaId'}};
 const context={config,process:{env:{}},Date:class extends Date{static now(){return now}},Map,Set,probeDataEntity:probe||(async()=>({ok:true,rows:[{VendorAccountNumber:'A',VendorOrganizationName:'',VendorName:'Available',VendorPersonFirstName:'',VendorPersonLastName:'',dataAreaId:'5001'}]})),odataGetAll:read};
 vm.runInNewContext(source+';globalThis.lookup=vendorNamesMany;',context);
 return{lookup:context.lookup,config,advance:milliseconds=>{now+=milliseconds}};
}

let probeOptions,readOptions;
const names=directory({
 probe:async(_entity,options)=>{probeOptions=options;return{ok:true,rows:[{VendorAccountNumber:'A',VendorOrganizationName:'',VendorName:'',VendorPersonFirstName:'',VendorPersonLastName:'',SearchName:'',dataAreaId:'5001'}]};},
 read:async(_entity,options)=>{readOptions=options;return{value:[
  {VendorAccountNumber:'A',VendorOrganizationName:'',VendorName:'Extenc International',dataAreaId:'5001'},
  {VendorAccountNumber:'B',VendorOrganizationName:'',VendorPersonFirstName:'Ali',VendorPersonLastName:'Marchand',SearchName:'B',dataAreaId:'5001'},
  {VendorAccountNumber:'C',VendorOrganizationName:'Wrong company',dataAreaId:'9999'},
  {VendorAccountNumber:'ORPHAN',VendorOrganizationName:'Outside request',dataAreaId:'5001'},
 ]};}
});
const found=await names.lookup(['a','B','C']);
assert.equal(found.get('a').name,'Extenc International','an empty first name field must not mask a populated business name');
assert.equal(found.get('B').name,'Ali Marchand','person vendors use their actual name instead of a search code');
assert.equal(found.get('C'),null,'a vendor from a different company must never fill a requested vendor');
assert.equal(found.has('ORPHAN'),false);
assert.match(probeOptions.filter,/dataAreaId eq '5001'/);
assert.match(readOptions.select,/VendorName/);assert.match(readOptions.select,/dataAreaId/);

const alternateAccount=directory({
 probe:async()=>({ok:true,rows:[{VendorAccountNumber:'',VendorAccount:'ALT',VendorName:'Alternate field',dataAreaId:'5001'}]}),
 read:async(_entity,options)=>{assert.match(options.filter,/VendorAccount eq 'ALT'/);return{value:[{VendorAccount:'ALT',VendorName:'Alternate field',dataAreaId:'5001'}]};}
});
assert.equal((await alternateAccount.lookup(['ALT'])).get('ALT').name,'Alternate field');

let attempts=0;
const recovery=directory({read:async()=>{if(++attempts===1)throw new Error('D365 temporarily unavailable');return{value:[{VendorAccountNumber:'RETRY',VendorName:'Recovered',dataAreaId:'5001'}]};}});
assert.equal((await recovery.lookup(['RETRY'])).get('RETRY'),null);
assert.equal((await recovery.lookup(['RETRY'])).get('RETRY').name,'Recovered','temporary errors must remain retryable immediately');

let truncated=true,reads=0;
const incomplete=directory({read:async()=>{reads++;return truncated?{truncated:true,value:[]}:{value:[{VendorAccountNumber:'MISSING',VendorName:'Arrived',dataAreaId:'5001'}]};}});
await incomplete.lookup(['MISSING']);truncated=false;
assert.equal((await incomplete.lookup(['MISSING'])).get('MISSING').name,'Arrived');assert.equal(reads,2,'truncated results must not become cached absences');

let companyReads=0;
const company=directory({read:async()=>{companyReads++;return{value:[{VendorAccountNumber:'SAME',VendorName:company.config.dynamics.dataAreaId,dataAreaId:company.config.dynamics.dataAreaId}]};}});
assert.equal((await company.lookup(['SAME'])).get('SAME').name,'5001');company.config.dynamics.dataAreaId='5002';
assert.equal((await company.lookup(['SAME'])).get('SAME').name,'5002');assert.equal(companyReads,2,'vendor caches must be partitioned by company');

let missing=true;
const refreshed=directory({read:async()=>({value:missing?[]:[{VendorAccountNumber:'NEW',VendorName:'New vendor',dataAreaId:'5001'}]})});
await refreshed.lookup(['NEW']);missing=false;refreshed.advance(61_000);
assert.equal((await refreshed.lookup(['NEW'])).get('NEW').name,'New vendor','confirmed absences should be rechecked quickly');
console.log('PASS vendor name fallbacks, company scope, request scope, immediate retry, truncated reads and refreshed missing vendors');
