const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
async function call(method,path,user='u-vf',payload){
  const r=await fetch(BASE+path,{method,headers:{'content-type':'application/json','x-demo-user':user},body:payload===undefined?undefined:JSON.stringify(payload)});
  let data={};try{data=await r.json()}catch{}
  return {r,data};
}
function ok(condition,message){if(!condition)throw new Error(message)}

let x=await call('GET','/api/dlc/config','u-vf');
ok(x.r.status===200&&x.data.departments?.length===13,'DLC reference config failed');
x=await call('POST','/api/stores/val-fleuri/dlc','u-emp-vf',{ean:'6111040001111',expiryDate:new Date().toISOString().slice(0,10),quantity:5,department:'Crémerie / PLS'});
ok(x.r.status===403,'employee must not create DLC controls');
x=await call('POST','/api/stores/val-fleuri/dlc','u-vf',{ean:'6111040001111',expiryType:'DLC',expiryDate:new Date().toISOString().slice(0,10),quantity:5,unit:'pièce',department:'Crémerie / PLS',family:'Lait frais',zone:'Rayon',lotRef:'SMOKE-DLC'});
ok(x.r.status===201&&x.data.risk?.stage==='CRITICAL'&&x.data.remaining_quantity===5,'DLC critical evaluation failed');
const dlcId=x.data.id;
x=await call('POST',`/api/dlc/${dlcId}/treatments`,'u-vf',{actionType:'NO_ACTION',quantity:0});
ok(x.r.status===409,'invalid action must be blocked for critical DLC');
x=await call('POST',`/api/dlc/${dlcId}/treatments`,'u-vf',{actionType:'DESTROY',quantity:2});
ok(x.r.status===409,'DLC destruction proof requirement bypassed');

x=await call('POST','/api/stores/val-fleuri/handover','u-emp-vf',{title:'Interdit'});
ok(x.r.status===403,'employee must not create handover');
const today=new Date().toISOString().slice(0,10);
x=await call('POST','/api/stores/val-fleuri/handover','u-vf',{title:'Smoke handover blocking',description:'À traiter avant ouverture',category:'TECHNICAL',priority:'CRITICAL',blockingOpening:true,targetDate:today});
ok(x.r.status===201&&x.data.blocking_opening===1,'manager handover create failed');const handoverId=x.data.id;
x=await call('GET','/api/stores/val-fleuri/handover','u-vf');
ok(x.r.status===200&&x.data.stats.blocking>=1&&x.data.items.some(i=>i.id===handoverId),'handover active list/stats failed');
x=await call('POST',`/api/handover/${handoverId}/acknowledge`,'u-vf',{});
ok(x.r.status===200&&x.data.status==='ACKNOWLEDGED','handover acknowledge failed');
x=await call('POST',`/api/handover/${handoverId}/resolve`,'u-vf',{});
ok(x.r.status===400,'handover resolution note must be required');
x=await call('POST',`/api/handover/${handoverId}/resolve`,'u-vf',{note:'Contrôle réalisé et conforme'});
ok(x.r.status===200&&x.data.status==='RESOLVED','handover resolve failed');
x=await call('GET','/api/stores/val-fleuri/handover','u-vf');
ok(x.r.status===200&&x.data.stats.blocking===0,'resolved handover must clear opening blocker');

x=await call('POST','/api/stores/val-fleuri/handover/review-closing','u-vf',{});
ok(x.r.status===200&&x.data.day.handover_reviewed_at,'closing handover review failed');
const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
x=await call('POST','/api/stores/val-fleuri/handover','u-vf',{title:'Sujet ajouté après revue',category:'OPERATIONS',priority:'NORMAL',targetDate:tomorrow});
ok(x.r.status===201,'outgoing handover create failed');
x=await call('GET','/api/stores/val-fleuri/tasks?group=closing','u-vf');
ok(x.r.status===200&&!x.data.day.handover_reviewed_at,'new outgoing handover must invalidate closing review');

x=await call('POST','/api/stores/val-fleuri/incidents','u-emp-vf',{title:'Interdit'});
ok(x.r.status===403,'employee must not create incidents');

x=await call('PUT','/api/quality-profiles/Frais','u-vf',{tempMin:1});
ok(x.r.status===403,'store manager must not change network quality profile');
x=await call('PUT','/api/quality-profiles/Frais','u-ops',{temperatureRequired:true,tempMin:0,tempMax:4,expiryRequired:true,photoOnNonconform:true});
ok(x.r.status===200&&Number(x.data.temp_max)===4,'director quality profile update failed');

x=await call('PUT','/api/sla-policies/CRITICAL','u-vf',{resolutionMinutes:31});
ok(x.r.status===403,'store manager must not change SLA policy');
x=await call('PUT','/api/sla-policies/CRITICAL','u-ops',{responseMinutes:15,resolutionMinutes:30,escalationMinutes:15,active:true});
ok(x.r.status===200&&Number(x.data.resolution_minutes)===30,'director SLA update failed');

x=await call('POST','/api/stores/val-fleuri/incidents','u-vf',{title:'Smoke incident',category:'SECURITY',criticality:'CRITICAL',blockingLevel:'STORE_OPENING',requiresEvidence:true});
ok(x.r.status===201&&x.data.due_at&&x.data.assigned_to==='u-vf','manager incident SLA/auto assignment failed');const incidentId=x.data.id;
ok(Number(x.data.sla?.policy?.resolution_minutes)===30,'critical SLA policy not applied');

x=await call('POST',`/api/incidents/${incidentId}/actions`,'u-vf',{title:'Sécuriser la zone',assignedTo:'u-vf'});
ok(x.r.status===201&&x.data.open_actions===1,'action create failed');const actionId=x.data.actions[0].id;

x=await call('POST',`/api/incidents/${incidentId}/resolve`,'u-vf',{resolutionNote:'Corrigé'});
ok(x.r.status===409,'incident resolved with open action');
x=await call('POST',`/api/incidents/${incidentId}/actions/${actionId}/complete`,'u-vf',{note:'Action terminée'});
ok(x.r.status===200&&x.data.open_actions===0,'action complete failed');
x=await call('POST',`/api/incidents/${incidentId}/resolve`,'u-vf',{resolutionNote:'Corrigé'});
ok(x.r.status===409,'evidence requirement was bypassed');

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl7lK0AAAAASUVORK5CYII=';
x=await call('POST',`/api/dlc/${dlcId}/treatments`,'u-vf',{actionType:'DESTROY',quantity:2,dataUrl:'data:image/png;base64,'+png,fileName:'pv-destruction.png',caption:'PV smoke'});
ok(x.r.status===201&&x.data.remaining_quantity===3&&x.data.evidence.length===1&&x.data.pending_action===true,'DLC partial disposal/evidence failed');
x=await call('POST',`/api/dlc/${dlcId}/recheck`,'u-vf',{quantity:0,note:'Lot écoulé / sorti'});
ok(x.r.status===200&&x.data.status==='CLOSED','DLC recheck closure failed');
x=await call('GET','/api/stores/val-fleuri/dlc?status=ALL','u-vf');
ok(x.r.status===200&&x.data.items.some(i=>i.id===dlcId&&i.status==='CLOSED'),'DLC register failed');
x=await call('PUT','/api/dlc/thresholds/Crémerie%20%2F%20PLS','u-vf',{criticalDays:1,alertDays:4,watchDays:8});
ok(x.r.status===403,'store manager must not change DLC thresholds');
x=await call('PUT','/api/dlc/thresholds/Crémerie%20%2F%20PLS','u-ops',{criticalDays:1,alertDays:4,watchDays:8});
ok(x.r.status===200&&Number(x.data.alert_days)===4&&Number(x.data.watch_days)===8,'director DLC threshold update failed');

x=await call('POST',`/api/incidents/${incidentId}/evidence`,'u-vf',{dataUrl:'data:image/png;base64,'+png,fileName:'smoke.png',caption:'preuve'});
ok(x.r.status===201&&x.data.evidence.length===1,'evidence upload failed');
x=await call('POST',`/api/incidents/${incidentId}/resolve`,'u-vf',{resolutionNote:'Zone sécurisée et recontrôlée'});
ok(x.r.status===200&&x.data.status==='RESOLVED','incident resolve failed');

const past=new Date(Date.now()-5*60000).toISOString();
x=await call('POST','/api/stores/val-fleuri/incidents','u-vf',{title:'SLA overdue smoke',category:'TECHNICAL',criticality:'HIGH',dueAt:past});
ok(x.r.status===201&&x.data.sla?.state==='BREACHED'&&x.data.escalation_level==='OPS_DIRECTOR','overdue incident escalation failed');const overdueId=x.data.id;
x=await call('GET','/api/stores/val-fleuri/incidents?status=OPEN','u-ops');
ok(x.r.status===200&&x.data.stats.overdue>=1&&x.data.stats.escalated>=1,'network SLA stats failed');

x=await call('GET','/api/stores/val-fleuri/incidents?status=ALL','u-vf');
ok(x.r.status===200&&x.data.items.some(i=>i.id===incidentId)&&x.data.items.some(i=>i.id===overdueId),'incident list failed');

console.log('StoreOps V1.6 handover smoke tests passed');
