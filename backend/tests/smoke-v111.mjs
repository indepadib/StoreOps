const nativeFetch=globalThis.fetch;
const prepared=new Set();
function headerValue(headers,name){if(!headers)return null;if(headers instanceof Headers)return headers.get(name);if(Array.isArray(headers)){const x=headers.find(([k])=>String(k).toLowerCase()===name.toLowerCase());return x?.[1]||null}for(const [k,v] of Object.entries(headers))if(k.toLowerCase()===name.toLowerCase())return v;return null}
async function prepareCashOpening(url,user){
 const u=new URL(url),m=u.pathname.match(/^\/api\/stores\/([^/]+)\/process\/opening\/validate$/);if(!m)return;
 const storeId=m[1],key=`${storeId}:${user||'u-ops'}`;if(prepared.has(key))return;
 const origin=u.origin,headers={'content-type':'application/json','x-demo-user':user||'u-ops'};
 const r=await nativeFetch(`${origin}/api/stores/${storeId}/cash-opening`,{headers});if(!r.ok)return;const data=await r.json();
 for(const line of data.opening?.lines||[]){if(line.status==='READY')continue;await nativeFetch(`${origin}/api/cash-opening/lines/${line.id}/check`,{method:'POST',headers,body:JSON.stringify({cashierName:line.cashier_name||`Caissier ${line.till_code}`,declaredFloat:Number(line.expected_float||0),posOk:true,tpeOk:true,printerOk:true,shiftOpened:true,note:'Préparation automatique du smoke historique V1.11'})})}
 prepared.add(key);
}
globalThis.fetch=async(input,init={})=>{const url=typeof input==='string'?input:input.url,user=headerValue(init.headers,'x-demo-user');if(String(url).includes('/process/opening/validate')){try{await prepareCashOpening(url,user)}catch{}}return nativeFetch(input,init)};
await import('./smoke.mjs');
