const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
async function call(path,user,{method='GET'}={}){const r=await fetch(BASE+path,{method,headers:{'content-type':'application/json','x-demo-user':user}});let data={};try{data=await r.json()}catch{}return{r,data}}
function ok(v,m){if(!v)throw new Error(m)}

let x=await call('/api/stores/val-fleuri/assortment','u-vf');
ok(x.r.status===200,'manager own-store assortment endpoint failed');
ok(['UNKNOWN','STALE','READY'].includes(x.data.status),'assortment state missing');

x=await call('/api/stores/trefle/assortment','u-vf');ok(x.r.status===403,'manager accessed another store assortment');
x=await call('/api/stores/val-fleuri/products/HS-1/merchandising','u-vf');ok(x.r.status===200&&x.data.productNumber==='HS-1','product merchandising context failed');
x=await call('/api/stores/val-fleuri/item-assistant/3017620422003','u-vf');ok(x.r.status===200&&x.data.item?.productNumber==='NUT750'&&x.data.primaryAction&&Array.isArray(x.data.actions),'universal item assistant failed');ok(x.data.merchandising?.assortment?.status==='UNKNOWN','item assistant must not invent assortment in demo');
x=await call('/api/stores/trefle/item-assistant/3017620422003','u-vf');ok(x.r.status===403,'manager accessed another store item assistant');
x=await call('/api/merchandising/readiness?storeId=val-fleuri','u-vf');ok(x.r.status===403,'manager accessed integration readiness');
x=await call('/api/merchandising/readiness?storeId=val-fleuri','u-ops');ok(x.r.status===200&&x.data.source==='D365'&&x.data.capabilities?.assortment,'director merchandising readiness failed');
x=await call('/api/merchandising/taxonomy/sync','u-ops',{method:'POST'});ok(x.r.status===409&&x.data.code==='D365_MERCH_NOT_LIVE','simulated taxonomy sync must fail safely');

console.log('StoreOps merchandising + item assistant API contract OK');
