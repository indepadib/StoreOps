const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
async function call(method,path,user='u-vf',payload){const r=await fetch(BASE+path,{method,headers:{'content-type':'application/json','x-demo-user':user},body:payload===undefined?undefined:JSON.stringify(payload)});let data={};try{data=await r.json()}catch{}return{r,data}}
function ok(v,m){if(!v)throw new Error(m)}
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';

let x=await call('GET','/api/loss/config','u-vf');
ok(x.r.status===200&&x.data.reasons?.length>=8&&Number(x.data.policy?.evidence_threshold_dh)===100,'loss config failed');

x=await call('POST','/api/stores/val-fleuri/losses','u-emp-vf',{ean:'3017620422003',reasonCode:'BREAKAGE',quantity:1,unit:'pièce'});
ok(x.r.status===403,'employee must not create loss');

x=await call('POST','/api/stores/val-fleuri/losses','u-vf',{ean:'3017620422003',reasonCode:'BREAKAGE',quantity:1,unit:'pièce',note:'pot cassé'});
ok(x.r.status===201&&x.data.status==='READY_TO_POST'&&Number(x.data.requires_evidence)===0,'small loss creation failed');const small=x.data;
x=await call('POST',`/api/losses/${small.id}/post`,'u-vf',{});
ok(x.r.status===200&&x.data.dynamics?.simulated===true&&x.data.record?.status==='POSTED','small loss posting failed');

x=await call('POST','/api/stores/val-fleuri/losses','u-vf',{ean:'3017620422003',reasonCode:'DAMAGED',quantity:2,unit:'pièce',note:'emballage détérioré'});
ok(x.r.status===201&&x.data.status==='READY_TO_POST'&&Number(x.data.requires_evidence)===1&&x.data.incident?.status==='OPEN','evidence loss creation failed');const medium=x.data;
x=await call('POST',`/api/losses/${medium.id}/post`,'u-vf',{});
ok(x.r.status===409&&x.data.details?.incidentId===medium.incident_id,'loss posting must wait for evidence incident resolution');
const action=medium.incident.actions?.find(a=>a.status==='OPEN');ok(action,'loss corrective action missing');
x=await call('POST',`/api/incidents/${medium.incident_id}/actions/${action.id}/complete`,'u-vf',{note:'produit isolé et sortie contrôlée'});ok(x.r.status===200,'loss action completion failed');
x=await call('POST',`/api/incidents/${medium.incident_id}/evidence`,'u-vf',{dataUrl:PNG,fileName:'preuve-perte.png',caption:'Produit détérioré'});ok(x.r.status===201&&x.data.evidence?.length===1,'loss evidence upload failed');
x=await call('POST',`/api/incidents/${medium.incident_id}/resolve`,'u-vf',{resolutionNote:'Perte contrôlée et documentée'});ok(x.r.status===200&&x.data.status==='RESOLVED','loss incident resolution failed');
x=await call('POST',`/api/losses/${medium.id}/post`,'u-vf',{});ok(x.r.status===200&&x.data.record?.status==='POSTED','evidence loss posting failed');

x=await call('POST','/api/stores/val-fleuri/losses','u-vf',{ean:'3017620422003',reasonCode:'UNKNOWN_SHRINK',quantity:8,unit:'pièce',note:'écart démarque'});
ok(x.r.status===201&&x.data.status==='APPROVAL_REQUIRED'&&Number(x.data.total_retail_value)>500,'approval loss threshold failed');const high=x.data;
x=await call('POST',`/api/losses/${high.id}/approve`,'u-vf',{});ok(x.r.status===403,'manager must not approve high loss');
x=await call('POST',`/api/losses/${high.id}/approve`,'u-ops',{});ok(x.r.status===200&&x.data.status==='APPROVED','director loss approval failed');

x=await call('GET','/api/stores/val-fleuri/losses','u-vf');
ok(x.r.status===200&&x.data.summary.records===3&&x.data.summary.posted===2&&x.data.summary.blocking===1&&x.data.summary.pendingEvidence===1,'loss summary failed');

x=await call('PUT','/api/loss/policy','u-vf',{evidenceThreshold:120,approvalThreshold:600});ok(x.r.status===403,'manager must not change loss policy');
x=await call('PUT','/api/loss/policy','u-ops',{evidenceThreshold:120,approvalThreshold:600});ok(x.r.status===200&&Number(x.data.evidence_threshold_dh)===120&&Number(x.data.approval_threshold_dh)===600,'director loss policy update failed');
x=await call('PUT','/api/loss/policy','u-ops',{evidenceThreshold:100,approvalThreshold:500});ok(x.r.status===200,'loss policy reset failed');

console.log('StoreOps V1.10 loss API integration tests passed');
