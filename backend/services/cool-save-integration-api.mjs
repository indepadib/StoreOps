import {timingSafeEqual} from 'node:crypto';
import {ingestCoolSaveExternalOrder} from './cool-save-orders.mjs';

function safeEqual(a,b){
 const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));if(x.length!==y.length)return false;return timingSafeEqual(x,y)
}
async function body(req){
 let raw='';for await(const c of req){raw+=c;if(raw.length>2e6)throw Object.assign(new Error('Payload trop volumineux.'),{status:413})}
 try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide.'),{status:400})}
}
export async function handleCoolSaveIntegrationApi({req,url}){
 if(url.pathname!=='/api/integrations/cool-save/orders'||req.method!=='POST')return null;
 const expected=String(process.env.COOL_SAVE_WEBHOOK_SECRET||'').trim();
 if(!expected)return{status:503,data:{error:'Intégration Cool & Save non configurée.',code:'COOL_SAVE_WEBHOOK_NOT_CONFIGURED'}};
 const supplied=String(req.headers['x-cool-save-secret']||'').trim();
 if(!safeEqual(supplied,expected))return{status:401,data:{error:'Signature Cool & Save invalide.',code:'COOL_SAVE_WEBHOOK_UNAUTHORIZED'}};
 const payload=await body(req),order=ingestCoolSaveExternalOrder(payload);
 return{status:order.idempotentReplay?200:201,data:order}
}
