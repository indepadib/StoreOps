// Private, offline finance reconciliation. Input over stdin only; output contains no raw identities.
import {reconcileSignedExport} from '../services/one-crm-signed-export.mjs';
import {parseObservedPilotStores} from '../services/one-crm-observed-sales.mjs';
const MAX_BYTES=64*1024*1024;
const blocked=code=>({status:'BLOCKED',issues:[code],activationEnabled:false});
const metricKeys=['tickets','positiveMinor','refundMinor','netMinor','duplicates'];
const lineKeys=['positiveLineMinor','refundLineMinor','postedLines','voidLines','duplicateLines'];
function safeMetrics(source,keys){return Object.fromEntries(keys.filter(k=>Number.isSafeInteger(source?.[k])).map(k=>[k,source[k]]))}
function run(input,env){
 const allowed=[...parseObservedPilotStores(env.ONE_CRM_PILOT_STORE_IDS)];
 if(!allowed.length||typeof env.ONE_CRM_PILOT_TENANT_ID!=='string'||!env.ONE_CRM_PILOT_TENANT_ID.trim())return blocked('PRIVATE_SCOPE_NOT_CONFIGURED');
 if(!input||input.tenantId!==env.ONE_CRM_PILOT_TENANT_ID||!allowed.includes(input.storeId))return blocked('PRIVATE_SCOPE_MISMATCH');
 const {report,lineMetrics}=reconcileSignedExport({tenantId:input.tenantId,storeId:input.storeId,date:input.date,allowedStoreIds:allowed,manifest:input.manifest,rows:input.rows,control:input.control});
 // On failure, do not expose partial metrics, raw evidence, or untrusted strings.
 if(report.status!=='VERIFIED')return {status:'BLOCKED',issues:report.issues.filter(x=>typeof x==='string'&&/^[A-Z0-9_]+$/.test(x)).map(x=>x.slice(0,100)),activationEnabled:false};
 return {status:'VERIFIED',currency:'MAD',unit:'minor',basis:'signed-ttc-after-discounts',metrics:safeMetrics(report.metrics,metricKeys),lineMetrics:safeMetrics(lineMetrics,lineKeys),activationEnabled:false,provenance:'OPERATOR_ATTESTED_NOT_INDEPENDENTLY_AUTHENTICATED'};
}
let result;
try{
 let bytes=0;const chunks=[];
 for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>MAX_BYTES){result=blocked('INPUT_TOO_LARGE');break}chunks.push(chunk)}
 if(!result){if(bytes===0)result=blocked('INPUT_REQUIRED');else{let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{result=blocked('INVALID_JSON')}if(!result)result=run(input,process.env)}}
}catch{result=blocked('INVALID_OR_UNRECONCILABLE_INPUT')}
process.stdout.write(JSON.stringify(result)+'\n');
process.exitCode=result.status==='VERIFIED'?0:2;
