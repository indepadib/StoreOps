const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
async function call(method,path,user='u-vf',payload){const r=await fetch(BASE+path,{method,headers:{'content-type':'application/json','x-demo-user':user},body:payload===undefined?undefined:JSON.stringify(payload)});let data={};try{data=await r.json()}catch{}return{r,data}}
function ok(v,m){if(!v)throw new Error(m)}
let x=await call('GET','/api/staffing/config','u-vf');ok(x.r.status===200&&Number(x.data.policy.required_cashiers)===1,'staffing config failed');
x=await call('GET','/api/stores/val-fleuri/staffing','u-vf');ok(x.r.status===200&&x.data.day.lines.length===4,'staffing sync/list failed');const lines=x.data.day.lines,mgr=lines.find(i=>i.role_code==='MANAGER'),floor=lines.find(i=>i.role_code==='FLOOR'),cash=lines.filter(i=>i.role_code==='CASHIER');
x=await call('POST',`/api/staffing/lines/${mgr.id}/attendance`,'u-emp-vf',{status:'PRESENT'});ok(x.r.status===403,'employee must not set attendance');
for(const [line,payload] of [[mgr,{status:'PRESENT'}],[cash[0],{status:'ABSENT',note:'absence'}],[cash[1],{status:'PRESENT'}],[floor,{status:'PRESENT'}]]){x=await call('POST',`/api/staffing/lines/${line.id}/attendance`,'u-vf',payload);ok(x.r.status===200,'manager attendance failed')}
ok(x.data.day.status==='READY'&&x.data.day.metrics.coverageOk===true,'staffing readiness failed');
x=await call('PUT','/api/staffing/policy','u-vf',{requiredManagers:1,requiredCashiers:2,requiredFloor:1});ok(x.r.status===403,'manager must not change staffing policy');
x=await call('PUT','/api/staffing/policy','u-ops',{requiredManagers:1,requiredCashiers:2,requiredFloor:1});ok(x.r.status===200&&Number(x.data.required_cashiers)===2,'director staffing policy update failed');
x=await call('PUT','/api/staffing/policy','u-ops',{requiredManagers:1,requiredCashiers:1,requiredFloor:1});ok(x.r.status===200,'staffing policy reset failed');
console.log('StoreOps V1.13 staffing readiness API tests passed');
