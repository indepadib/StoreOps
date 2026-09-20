const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
async function call(path,user,{method='GET'}={}){const r=await fetch(BASE+path,{method,headers:{'content-type':'application/json','x-demo-user':user}});let data={};try{data=await r.json()}catch{}return{r,data}}
function ok(v,m){if(!v)throw new Error(m)}

let x=await call('/api/network/business-pulse','u-ops');
ok(x.r.status===200,'director network pulse failed');
ok(Array.isArray(x.data.items),'network pulse items missing');
const ids=new Set(x.data.items.map(i=>i.storeId));
ok(ids.has('val-fleuri'),'Val Fleuri missing from network pulse');
ok(ids.has('trefle'),'Trèfle missing from network pulse');
ok(x.data.items.find(i=>i.storeId==='trefle')?.d365?.storeNumber==='FRP0002','Trèfle store number must be FRP0002');
ok(x.data.items.find(i=>i.storeId==='trefle')?.d365?.retailChannelId===null,'simulated Trèfle must not invent a retail channel');

x=await call('/api/network/business-pulse','u-vf');
ok(x.r.status===403,'store manager accessed network pulse');

x=await call('/api/network','u-ops');
ok(x.r.status===200&&Array.isArray(x.data),'network snapshot failed');
const vf=x.data.find(i=>i.id==='val-fleuri');
ok(vf&&vf.staffing&&vf.coldChain&&vf.cashOpening&&vf.loss,'network snapshot must embed local operational summaries');

x=await call('/api/network/business-pulse/auto-connect','u-ops',{method:'POST'});
ok(x.r.status===200,'network auto-connect must degrade safely when D365 is simulated');
ok(x.data.items.some(i=>i.storeId==='trefle'),'Trèfle disappeared after auto-connect attempt');

console.log('V2.18 network Business Pulse API contract OK');
