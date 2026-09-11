const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
async function call(path,user,{method='GET'}={}){const r=await fetch(BASE+path,{method,headers:{'content-type':'application/json','x-demo-user':user}});let data={};try{data=await r.json()}catch{}return{r,data}}
function ok(v,m){if(!v)throw new Error(m)}
let x=await call('/api/stores/val-fleuri/business-pulse','u-vf');
ok(x.r.status===200,'manager own-store business pulse failed');
ok(x.data.status==='UNAVAILABLE'&&x.data.snapshot===null,'unmapped sales must never fabricate KPI');
x=await call('/api/stores/trefle/business-pulse','u-vf');ok(x.r.status===403,'manager accessed another store business pulse');
x=await call('/api/stores/val-fleuri/business-pulse/refresh','u-vf',{method:'POST'});ok(x.r.status===200&&x.data.status==='UNAVAILABLE','business pulse refresh must degrade safely');
x=await call('/api/stores/val-fleuri/business-pulse','u-ops');ok(x.r.status===200,'director business pulse access failed');
console.log('StoreOps business pulse API contract OK');
