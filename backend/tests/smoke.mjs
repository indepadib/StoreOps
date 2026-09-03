const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
async function call(method,path,user='u-vf',payload){
  const r=await fetch(BASE+path,{method,headers:{'content-type':'application/json','x-demo-user':user},body:payload===undefined?undefined:JSON.stringify(payload)});
  let data={};try{data=await r.json()}catch{}
  return {r,data};
}
function ok(condition,message){if(!condition)throw new Error(message)}
function compliantValues(form){
  const out={};
  for(const f of form.fields||[]){
    if(f.input_type==='BOOLEAN')out[f.code]=true;
    else if(f.input_type==='NUMBER'){
      if(f.min_value!=null&&f.max_value!=null)out[f.code]=(Number(f.min_value)+Number(f.max_value))/2;
      else out[f.code]=0;
    }else if(f.input_type==='MONEY')out[f.code]=1000;
    else if(f.input_type==='SELECT')out[f.code]=(f.options||[])[0]||'OK';
    else out[f.code]='RAS';
  }
  return out;
}

let x=await call('GET','/api/commercial/config','u-vf');
ok(x.r.status===200&&Number(x.data.policy?.price_tolerance)===0.01,'commercial config failed');
x=await call('GET','/api/stores/val-fleuri/commercial','u-vf');
ok(x.r.status===200&&x.data.items?.length===3&&x.data.summary?.blocking===3,'commercial Dynamics sync/list failed');
const milkCommercial=x.data.items.find(i=>i.ean==='6111040001111');
x=await call('POST',`/api/commercial/${milkCommercial.id}/control`,'u-emp-vf',{observedPrice:12.9,signageOk:true,executionOk:true});
ok(x.r.status===403,'employee must not validate commercial control');
x=await call('POST',`/api/commercial/${milkCommercial.id}/control`,'u-vf',{observedPrice:13.9,signageOk:true,executionOk:true,note:'étiquette incorrecte'});
ok(x.r.status===409&&Array.isArray(x.data.issues),'commercial price mismatch must be rejected');
x=await call('GET','/api/stores/val-fleuri/incidents?status=OPEN','u-vf');
const commercialIncident=x.data.items?.find(i=>i.source_type==='COMMERCIAL_CONTROL'&&i.source_id===milkCommercial.id);
ok(x.r.status===200&&commercialIncident&&commercialIncident.blocking_level==='STORE_OPENING'&&Number(commercialIncident.requires_evidence)===1,'commercial mismatch incident linkage failed');
x=await call('POST',`/api/commercial/${milkCommercial.id}/control`,'u-vf',{observedPrice:12.9,signageOk:true,executionOk:true,note:'corrigé'});
ok(x.r.status===200&&x.data.control?.status==='VERIFIED','commercial correction recheck failed');

x=await call('PUT','/api/commercial/policy','u-vf',{priceTolerance:0.05});
ok(x.r.status===403,'store manager must not change commercial policy');
x=await call('PUT','/api/commercial/policy','u-ops',{priceTolerance:0.05});
ok(x.r.status===200&&Number(x.data.price_tolerance)===0.05,'director commercial policy update failed');
x=await call('PUT','/api/commercial/policy','u-ops',{priceTolerance:0.01});
ok(x.r.status===200,'commercial policy reset failed');

// Even a fully checked opening must remain blocked until Dynamics price/promo actions are verified.
x=await call('GET','/api/stores/carita/tasks?group=opening','u-ops');
ok(x.r.status===200&&x.data.tasks?.length===7,'Carita opening task list failed');
for(const task of x.data.tasks){
  const form=await call('GET',`/api/tasks/${task.id}/form`,'u-ops');
  ok(form.r.status===200,'opening form load failed');
  const submitted=await call('POST',`/api/tasks/${task.id}/submit`,'u-ops',{values:compliantValues(form.data)});
  ok(submitted.r.status===200,`opening task ${task.step_order} compliant submit failed`);
}
x=await call('POST','/api/stores/carita/process/opening/validate','u-ops',{});
ok(x.r.status===409&&Number(x.data.details?.commercialBlocking)===3,'commercial readiness must block opening after task checklist');
x=await call('GET','/api/stores/carita/commercial','u-ops');
ok(x.r.status===200&&x.data.items.length===3,'Carita commercial controls missing');
for(const control of x.data.items){
  const verified=await call('POST',`/api/commercial/${control.id}/control`,'u-ops',{observedPrice:control.expected_price,signageOk:true,executionOk:true,note:'contrôle CI conforme'});
  ok(verified.r.status===200,'Carita commercial control verification failed');
}
x=await call('POST','/api/stores/carita/process/opening/validate','u-ops',{});
ok(x.r.status===200,'opening should validate after all commercial controls are verified');

x=await call('GET','/api/inventory/config','u-vf');
ok(x.r.status===200&&Number(x.data.policy?.recount_qty_threshold)===2&&Number(x.data.policy?.incident_qty_threshold)===5,'inventory config failed');
x=await call('POST','/api/stores/val-fleuri/inventory','u-emp-vf',{type:'CYCLE',zone:'Interdit'});
ok(x.r.status===403,'employee must not create inventory session');
x=await call('POST','/api/stores/val-fleuri/inventory','u-vf',{type:'CYCLE',zone:'Smoke inventory',comment:'CI'});
ok(x.r.status===201&&x.data.status==='COUNTING','manager inventory session create failed');const inventoryId=x.data.id;

x=await call('POST',`/api/inventory/${inventoryId}/lines`,'u-vf',{ean:'3017620422003'});
ok(x.r.status===201&&Number(x.data.theoretical_qty)===17,'inventory Nutella stock snapshot failed');const nutLineId=x.data.id;
x=await call('POST',`/api/inventory/lines/${nutLineId}/count`,'u-vf',{quantity:16});
ok(x.r.status===409,'inventory low variance reason requirement bypassed');
x=await call('POST',`/api/inventory/lines/${nutLineId}/count`,'u-vf',{quantity:16,reasonCode:'SHRINK',note:'1 unité manquante'});
ok(x.r.status===200&&x.data.lines.find(i=>i.id===nutLineId)?.status==='COUNTED','inventory direct count with reason failed');

x=await call('POST',`/api/inventory/${inventoryId}/lines`,'u-vf',{ean:'6111040001111'});
ok(x.r.status===201&&Number(x.data.theoretical_qty)===24,'inventory milk stock snapshot failed');const milkLineId=x.data.id;
x=await call('POST',`/api/inventory/lines/${milkLineId}/count`,'u-vf',{quantity:18,reasonCode:'SHRINK',note:'écart important'});
ok(x.r.status===200&&x.data.lines.find(i=>i.id===milkLineId)?.status==='RECOUNT','inventory recount threshold failed');
x=await call('POST',`/api/inventory/lines/${milkLineId}/count`,'u-vf',{quantity:18,recount:true});
ok(x.r.status===200&&Number(x.data.lines.find(i=>i.id===milkLineId)?.final_variance)===-6&&x.data.lines.find(i=>i.id===milkLineId)?.reason_code==='SHRINK','inventory recount/final variance failed');

x=await call('POST',`/api/inventory/${inventoryId}/finalize`,'u-vf',{});
ok(x.r.status===200&&x.data.session.status==='READY_TO_POST'&&x.data.highVarianceLines.some(i=>i.id===milkLineId),'inventory finalize/high variance failed');
x=await call('GET','/api/stores/val-fleuri/incidents?status=OPEN','u-vf');
const stockIncident=x.data.items?.find(i=>i.source_type==='INVENTORY_LINE'&&i.source_id===milkLineId);
ok(x.r.status===200&&stockIncident&&stockIncident.category==='STOCK'&&Number(stockIncident.requires_evidence)===1,'inventory stock incident escalation failed');
x=await call('POST',`/api/inventory/${inventoryId}/post`,'u-vf',{});
ok(x.r.status===200&&x.data.dynamics?.simulated===true&&x.data.session?.status==='POSTED','inventory simulated posting failed');

x=await call('PUT','/api/inventory/policy','u-vf',{recountThreshold:3,incidentThreshold:6});
ok(x.r.status===403,'store manager must not change inventory policy');
x=await call('PUT','/api/inventory/policy','u-ops',{recountThreshold:3,incidentThreshold:6});
ok(x.r.status===200&&Number(x.data.recount_qty_threshold)===3&&Number(x.data.incident_qty_threshold)===6,'director inventory policy update failed');
x=await call('PUT','/api/inventory/policy','u-ops',{recountThreshold:2,incidentThreshold:5});
ok(x.r.status===200,'inventory policy reset failed');

x=await call('GET','/api/dlc/config','u-vf');
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

console.log('StoreOps V1.8 price & promotion smoke tests passed');
