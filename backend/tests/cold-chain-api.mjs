const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
async function call(method,path,user='u-si',payload){const r=await fetch(BASE+path,{method,headers:{'content-type':'application/json','x-demo-user':user},body:payload===undefined?undefined:JSON.stringify(payload)});let data={};try{data=await r.json()}catch{}return{r,data}}
function ok(v,m){if(!v)throw new Error(m)}

let x=await call('GET','/api/cold-chain/config','u-si');
ok(x.r.status===200&&x.data.profiles?.length===3,'cold chain config failed');
x=await call('GET','/api/stores/sindibad/cold-chain','u-si');
ok(x.r.status===200&&x.data.day?.lines?.length===3&&x.data.summary?.blocking===3,'cold chain day API failed');
const positive=x.data.day.lines.find(i=>i.profile_code==='COLD_ROOM_POS'),fresh=x.data.day.lines.find(i=>i.profile_code==='FRESH_DISPLAY'),frozen=x.data.day.lines.find(i=>i.profile_code==='FROZEN_DISPLAY');

x=await call('POST',`/api/cold-chain/lines/${positive.id}/check`,'u-emp-vf',{temperature:3.2,doorOk:true});
ok(x.r.status===403,'employee / wrong store must not validate cold chain');
x=await call('POST',`/api/cold-chain/lines/${positive.id}/check`,'u-si',{temperature:3.2,doorOk:true,note:'Conforme'});
ok(x.r.status===200&&x.data.line?.status==='READY','positive cold room API control failed');
x=await call('POST',`/api/cold-chain/lines/${fresh.id}/check`,'u-si',{temperature:2.5,doorOk:true,note:'Conforme'});
ok(x.r.status===200&&x.data.line?.status==='READY','fresh display API control failed');
x=await call('POST',`/api/cold-chain/lines/${frozen.id}/check`,'u-si',{temperature:-14,doorOk:true,note:'Surgelés trop chauds'});
ok(x.r.status===409&&x.data.line?.status==='MISMATCH'&&x.data.issues?.length===1&&x.data.line?.incident_id,'frozen mismatch API rule failed');const incidentId=x.data.line.incident_id;
x=await call('GET','/api/stores/sindibad/incidents?status=OPEN','u-si');const inc=x.data.items?.find(i=>i.id===incidentId);
ok(x.r.status===200&&inc&&inc.category==='COLD'&&inc.blocking_level==='STORE_OPENING'&&Number(inc.requires_evidence)===1&&inc.open_actions===1,'cold chain incident API linkage failed');
x=await call('POST',`/api/cold-chain/lines/${frozen.id}/recheck`,'u-si',{temperature:-20,doorOk:true,maintenanceSignaled:true,note:'Stabilisé après contrôle'});
ok(x.r.status===200&&x.data.line?.status==='READY'&&x.data.day?.status==='READY','cold chain recheck API failed');
// Incident stays open on purpose until corrective action + evidence + resolution.
x=await call('GET',`/api/incidents/${incidentId}`,'u-si');ok(x.r.status===200&&x.data.status==='OPEN','cold incident must stay open after compliant recheck');

x=await call('PUT','/api/cold-chain/profiles/COLD_ROOM_POS','u-si',{tempMin:0,tempMax:5});
ok(x.r.status===403,'store manager must not change cold profile');
x=await call('PUT','/api/cold-chain/profiles/COLD_ROOM_POS','u-ops',{tempMin:0,tempMax:5});
ok(x.r.status===200&&Number(x.data.temp_max)===5,'director cold profile update failed');
x=await call('PUT','/api/cold-chain/profiles/COLD_ROOM_POS','u-ops',{tempMin:0,tempMax:4});
ok(x.r.status===200&&Number(x.data.temp_max)===4,'cold profile reset failed');
console.log('StoreOps V1.12 cold chain API integration tests passed');
