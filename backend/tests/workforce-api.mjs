const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
async function call(path,user,{method='GET',body=null}={}){const r=await fetch(BASE+path,{method,headers:{'content-type':'application/json','x-demo-user':user},body:body==null?undefined:JSON.stringify(body)});let data={};try{data=await r.json()}catch{}return{r,data}}
function ok(v,m){if(!v)throw new Error(m)}
const date='2026-09-11';

let x=await call(`/api/stores/val-fleuri/workforce?date=${date}`,'u-vf');ok(x.r.status===200,'manager workforce read failed');
x=await call(`/api/stores/trefle/workforce?date=${date}`,'u-vf');ok(x.r.status===403,'manager accessed another store workforce');

x=await call('/api/stores/val-fleuri/employees','u-vf',{method:'POST',body:{employeeCode:'VF-T001',firstName:'Sara',lastName:'Test',roleCode:'CASHIER',contractType:'CDI',contractStart:date}});ok(x.r.status===201&&x.data.id,'employee creation failed');const employeeId=x.data.id;
x=await call('/api/stores/val-fleuri/shifts','u-vf',{method:'POST',body:{employeeId,shiftDate:date,startTime:'08:00',endTime:'16:00'}});ok(x.r.status===201&&x.data.status==='DRAFT','shift creation failed');const shiftId=x.data.id;
x=await call(`/api/shifts/${shiftId}/status`,'u-vf',{method:'POST',body:{status:'PUBLISHED'}});ok(x.r.status===200&&x.data.status==='PUBLISHED','shift publish failed');
x=await call('/api/stores/val-fleuri/objectives','u-vf',{method:'POST',body:{employeeId,title:'Contrôles prix',targetValue:20,unit:'contrôles',periodStart:date,periodEnd:'2026-09-30'}});ok(x.r.status===201&&x.data.title==='Contrôles prix','objective creation failed');
x=await call(`/api/stores/val-fleuri/workforce?date=${date}`,'u-vf');ok(x.data.summary.activeEmployees===1,'active employee summary wrong');ok(x.data.summary.publishedShifts===1,'published shift summary wrong');ok(x.data.summary.activeObjectives===1,'objective summary wrong');
x=await call(`/api/employees/${employeeId}/end`,'u-vf',{method:'POST',body:{endDate:date,reason:'Fin test'}});ok(x.r.status===200&&x.data.status==='ENDED','end contract failed');
x=await call(`/api/stores/val-fleuri/workforce?date=${date}`,'u-vf');ok(x.data.summary.activeEmployees===0,'ended employee still active');

console.log('StoreOps workforce lifecycle API contract OK');
