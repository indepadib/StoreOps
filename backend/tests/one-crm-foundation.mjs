import {buildProfiles,previewSegment,marketingEligibility} from '../services/one-crm-foundation.mjs';
function verify(){
 const assert=(v,m)=>{if(!v)throw Error(m)};
 const base={tenantId:'demo',storeId:'store-a',date:'2026-11-01',customerToken:'synthetic-a'};
 const t={...base,ticketId:'1',netMinor:15000};
 const data={tenantId:'demo',asOf:'2026-11-25',windowStart:'2026-11-01',coverageComplete:true,tickets:[t,t,{...base,ticketId:'2',netMinor:-2000},{...base,ticketId:'3',customerToken:null,netMinor:1000}]};
 const s=buildProfiles(data);
 assert(s.uniqueTickets===3&&s.anonymousTickets===1,'dedup and anonymous');
 assert(s.profiles[0].netMinor===13000&&s.profiles[0].purchaseTickets===1&&s.profiles[0].recencyDays===24,'RFM and refunds');
 assert(previewSegment(s,{tenantId:'demo',minNetMinor:13000,maxRecencyDays:24}).length===1,'segment match');
 assert(previewSegment(s,{tenantId:'demo',maxRecencyDays:23}).length===0,'segment exclusion');
 for(const patch of [{coverageComplete:false},{tickets:[{...t,tenantId:'other'}]},{tickets:[t,{...t,netMinor:999}]}]){let rejected=false;try{buildProfiles({...data,...patch})}catch{rejected=true}assert(rejected,'invalid input must fail')}
 const c={tenantId:'demo',customerToken:'synthetic-a',channel:'email',purpose:'marketing',at:'2026-11-01T12:00:00Z',status:'granted',proofId:'synthetic-proof'};
 const opt={tenantId:'demo',customerToken:'synthetic-a',channel:'email',asOf:'2026-11-25T12:00:00Z',consents:[c]};
 assert(marketingEligibility(opt),'explicit grant');
 assert(!marketingEligibility({...opt,channel:'whatsapp'}),'channel isolation');
 assert(!marketingEligibility({...opt,suppressed:true}),'suppression');
 assert(!marketingEligibility({...opt,consents:[c,{...c,status:'revoked'}]}),'revoke at same timestamp');
 assert(!marketingEligibility({...opt,consents:[]}),'default deny');
}
verify();
console.log('ONE CRM foundation assertions passed');
