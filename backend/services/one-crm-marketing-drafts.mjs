import {randomUUID} from 'node:crypto';
import {RFM_SEGMENTS} from './one-crm-rfm-snapshot-reader.mjs';
const kinds=['campaign','journey','offer'],channels=['email','whatsapp','sms','push'];
const text=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function projectMarketingDraft(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['id','revision','kind','title','segment','channel','message','objective','trigger','delayHours'].includes(k))||!kinds.includes(input.kind)||!text(input.title,1,120)||!RFM_SEGMENTS.includes(input.segment)||!channels.includes(input.channel)||!text(input.message,1,2000)||!text(input.objective,1,300))throw Error('INVALID_DRAFT');
 const {kind,title,segment,channel,message,objective}=input;
 const payload={title:title.trim(),segment,channel,message:message.trim(),objective:objective.trim()};
 if(kind==='journey'){if(!['manual','segment_entry','enrollment','purchase'].includes(input.trigger)||!Number.isSafeInteger(input.delayHours)||input.delayHours<0||input.delayHours>2160)throw Error('INVALID_DRAFT');Object.assign(payload,{trigger:input.trigger,delayHours:input.delayHours})}
 else if(input.trigger!==undefined||input.delayHours!==undefined)throw Error('INVALID_DRAFT');
 const editing=input.id!==undefined||input.revision!==undefined;
 if(editing&&(!uuid(input.id)||!Number.isSafeInteger(input.revision)||input.revision<1))throw Error('INVALID_DRAFT');
 return {kind,payload,id:editing?input.id:null,revision:editing?input.revision:null};
}
export function createMarketingDraftStore(sql){
 const scope=(company,owner)=>{if(!text(company,1,160)||!text(owner,1,200))throw Error('INVALID_SCOPE')};
 const project=r=>({id:r.draft_id,kind:r.kind,revision:r.revision,updatedAt:r.updated_at,...r.payload,status:'DRAFT',activationEnabled:false});
 async function list(company,owner,kind){scope(company,owner);if(!kinds.includes(kind))throw Error('INVALID_DRAFT');const rows=await sql`SELECT draft_id,kind,payload,revision,updated_at::text AS updated_at FROM crm_marketing_draft WHERE company=${company} AND owner_id=${owner} AND kind=${kind} ORDER BY updated_at DESC,draft_id LIMIT 100`;return rows.map(project)}
 async function save(company,owner,input){scope(company,owner);const d=projectMarketingDraft(input),payload=JSON.stringify(d.payload);let rows;
 if(d.id)rows=await sql`UPDATE crm_marketing_draft SET payload=${payload}::jsonb,revision=revision+1,updated_at=NOW() WHERE company=${company} AND owner_id=${owner} AND draft_id=${d.id}::uuid AND kind=${d.kind} AND revision=${d.revision} RETURNING draft_id,kind,payload,revision,updated_at::text AS updated_at`;
 else rows=await sql`INSERT INTO crm_marketing_draft(company,owner_id,draft_id,kind,payload) VALUES(${company},${owner},${randomUUID()}::uuid,${d.kind},${payload}::jsonb) RETURNING draft_id,kind,payload,revision,updated_at::text AS updated_at`;
 return rows[0]?project(rows[0]):null;
 }
 return {list,save};
}
