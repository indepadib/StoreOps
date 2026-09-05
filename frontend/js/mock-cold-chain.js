const KEY='storeops_showcase_cold_chain_v1';
const today=()=>new Date().toISOString().slice(0,10);
const uid=p=>`${p}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const DEFAULT=[
 {code:'COLD_ROOM_POS',label:'Chambre froide positive',device_code:'CF+01',temp_min:0,temp_max:4,step_order:1},
 {code:'FRESH_DISPLAY',label:'Meubles frais / PLS',device_code:'MF+01',temp_min:0,temp_max:4,step_order:2},
 {code:'FROZEN_DISPLAY',label:'Surgelés',device_code:'SG-01',temp_min:-30,temp_max:-18,step_order:3}
];
function load(){try{return JSON.parse(localStorage.getItem(KEY))||{profiles:DEFAULT,days:{}}}catch{return{profiles:DEFAULT,days:{}}}}
function save(s){localStorage.setItem(KEY,JSON.stringify(s))}
function err(message,status=400,details){const e=new Error(message);e.status=status;e.details=details;return e}
async function user(core){return(await core('/api/session')).user}
function access(u,storeId){return u.role==='ops_director'||u.store_id===storeId}
function manage(u,storeId){return access(u,storeId)&&['store_manager','ops_director'].includes(u.role)}
function k(storeId,date){return `${storeId}:${date}`}
function ensure(s,storeId,date=today()){
 const key=k(storeId,date);if(s.days[key])return s.days[key];
 const d={id:uid('cold'),store_id:storeId,business_date:date,status:'PREPARING',ready_by_name:null,ready_at:null,opened_at:null,lines:s.profiles.map(p=>({id:uid('coldl'),profile_code:p.code,device_code:p.device_code,first_temp:null,second_temp:null,door_ok:null,maintenance_signaled:0,status:'PENDING',note:'',incident_id:null,checked_by_name:null,checked_at:null,rechecked_by_name:null,rechecked_at:null}))};s.days[key]=d;save(s);return d
}
async function hydrate(s,d,core){const lines=[];for(const x of d.lines){const p=s.profiles.find(y=>y.code===x.profile_code),incident=x.incident_id?await core(`/api/incidents/${x.incident_id}`).catch(()=>null):null;lines.push({...x,profile:p,incident})}return{...d,lines,metrics:{lines:lines.length,ready:lines.filter(x=>x.status==='READY').length,pending:lines.filter(x=>x.status==='PENDING').length,mismatch:lines.filter(x=>x.status==='MISMATCH').length,openIncidents:lines.filter(x=>x.incident?.status==='OPEN').length}}}
export function coldChainShowcaseSummary(storeId,date=today()){const s=load(),d=s.days[k(storeId,date)];if(!d)return{status:'NOT_STARTED',lines:0,ready:0,pending:0,mismatch:0,openIncidents:0,blocking:1};const lines=d.lines||[],ready=lines.filter(x=>x.status==='READY').length,pending=lines.filter(x=>x.status==='PENDING').length,mismatch=lines.filter(x=>x.status==='MISMATCH').length;return{status:d.status,lines:lines.length,ready,pending,mismatch,openIncidents:lines.filter(x=>x.incident_id).length,blocking:['READY','OPENED'].includes(d.status)?0:Math.max(1,pending+mismatch)}}
export function resetColdChainShowcase(){localStorage.removeItem(KEY)}
export function markColdChainShowcaseOpened(storeId,date=today()){const s=load(),d=s.days[k(storeId,date)];if(d&&d.status==='READY'){d.status='OPENED';d.opened_at=new Date().toISOString();save(s)}return d}
async function autoTask(core,d,s){if(d.status!=='READY')return;try{const data=await core(`/api/stores/${d.store_id}/tasks?group=opening`),task=(data.tasks||[]).find(t=>Number(t.step_order)===4);if(!task||task.status==='COMPLETED')return;const pos=d.lines.find(x=>x.profile_code==='COLD_ROOM_POS'),neg=d.lines.find(x=>x.profile_code==='FROZEN_DISPLAY');await core(`/api/tasks/${task.id}/submit`,{method:'POST',body:JSON.stringify({values:{froid_positif:Number(pos.second_temp??pos.first_temp),froid_negatif:Number(neg.second_temp??neg.first_temp)}})})}catch{}}
function profile(s,code){return s.profiles.find(x=>x.code===code)}
function compliant(p,t){return Number(t)>=Number(p.temp_min)&&Number(t)<=Number(p.temp_max)}
async function ensureIncident(core,u,d,line,p,temp,doorOk,note){if(line.incident_id){try{const existing=await core(`/api/incidents/${line.incident_id}`);if(existing.status==='OPEN')return existing}catch{}}
 const inc=await core(`/api/stores/${d.store_id}/incidents`,{method:'POST',body:JSON.stringify({title:`Chaîne du froid · ${p.label}`,description:`Relevé ${Number(temp).toFixed(1)}°C · attendu ${p.temp_min} à ${p.temp_max}°C${doorOk?'':' · porte/fermeture non conforme'}`,category:'COLD',criticality:'CRITICAL',blockingLevel:'STORE_OPENING',requiresEvidence:true})});
 await core(`/api/incidents/${inc.id}/actions`,{method:'POST',body:JSON.stringify({title:'Contrôler porte / alimentation / groupe froid, attendre stabilisation, refaire un relevé et signaler la maintenance si nécessaire',note:note||''})});line.incident_id=inc.id;return inc
}
async function refresh(s,d,u,core){if(d.lines.length&&d.lines.every(x=>x.status==='READY')){d.status='READY';d.ready_by_name=u.name;d.ready_at=new Date().toISOString();save(s);await autoTask(core,d,s)}else{d.status='PREPARING';d.ready_by_name=null;d.ready_at=null;save(s)}return hydrate(s,d,core)}
export async function mockColdChainApi(path,options={},core){
 const url=new URL(path,'https://showcase.local'),clean=url.pathname,method=String(options.method||'GET').toUpperCase(),body=options.body?JSON.parse(options.body):{},s=load(),u=await user(core);let m;
 if(clean==='/api/cold-chain/config')return{profiles:s.profiles};
 if((m=clean.match(/^\/api\/cold-chain\/profiles\/([^/]+)$/))&&(method==='PUT'||method==='PATCH')){if(u.role!=='ops_director')throw err('Réservé au Directeur d’exploitation',403);const p=profile(s,m[1]);if(!p)throw err('Zone froid inconnue.',404);const min=Number(body.tempMin),max=Number(body.tempMax);if(!Number.isFinite(min)||!Number.isFinite(max)||min>=max)throw err('Plage température invalide.',400);p.temp_min=min;p.temp_max=max;save(s);return p}
 if((m=clean.match(/^\/api\/stores\/([^/]+)\/cold-chain$/))&&method==='GET'){const storeId=m[1];if(!access(u,storeId))throw err('Accès interdit à ce magasin.',403);const date=url.searchParams.get('date')||today(),d=ensure(s,storeId,date);return{summary:coldChainShowcaseSummary(storeId,date),day:await hydrate(s,d,core)}}
 if((m=clean.match(/^\/api\/cold-chain\/lines\/([^/]+)\/(check|recheck)$/))&&method==='POST'){
  let d,line;for(const day of Object.values(s.days)){const found=(day.lines||[]).find(x=>x.id===m[1]);if(found){d=day;line=found;break}}if(!d||!line)throw err('Zone froid introuvable.',404);if(!manage(u,d.store_id))throw err('Réservé au Responsable magasin ou Directeur d’exploitation',403);if(d.status==='OPENED')throw err('Le contrôle froid d’ouverture est verrouillé après ouverture.',409);const p=profile(s,line.profile_code),temp=Number(body.temperature);if(!Number.isFinite(temp))throw err('Température obligatoire.',400);if(m[2]==='recheck'&&line.first_temp==null)throw err('Un premier relevé est requis avant recontrôle.',409);const issues=[];if(!compliant(p,temp))issues.push(`${m[2]==='recheck'?'Recontrôle':'Température'} ${temp.toFixed(1)}°C hors tolérance ${p.temp_min} à ${p.temp_max}°C.`);if(body.doorOk!==true)issues.push('Porte / fermeture non conforme.');if(m[2]==='check'){line.first_temp=temp;line.checked_by_name=u.name;line.checked_at=new Date().toISOString()}else{line.second_temp=temp;line.rechecked_by_name=u.name;line.rechecked_at=new Date().toISOString();line.maintenance_signaled=body.maintenanceSignaled?1:0}line.door_ok=body.doorOk?1:0;line.status=issues.length?'MISMATCH':'READY';line.note=body.note||line.note||'';if(issues.length)await ensureIncident(core,u,d,line,p,temp,body.doorOk===true,body.note||'');save(s);const day=await refresh(s,d,u,core),result={day,line:day.lines.find(x=>x.id===line.id),issues};if(issues.length)throw err('Contrôle froid non conforme.',409,result);return result
 }
 throw err('Route démo chaîne du froid inconnue.',404);
}
