const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
async function call(method,path,user='u-vf',payload){const r=await fetch(BASE+path,{method,headers:{'content-type':'application/json','x-demo-user':user},body:payload===undefined?undefined:JSON.stringify(payload)});let data={};try{data=await r.json()}catch{}return{r,data}}
function ok(v,m){if(!v)throw new Error(m)}

let x=await call('GET','/api/cash-opening/config','u-vf');
ok(x.r.status===200&&Number(x.data.policy?.float_tolerance_dh)===0.01,'cash opening config failed');
x=await call('GET','/api/stores/val-fleuri/cash-opening','u-vf');
ok(x.r.status===200&&x.data.opening?.lines?.length===2&&x.data.summary?.blocking===2,'Val Fleuri real cash opening sync/list failed');
const [l1,l2]=x.data.opening.lines;
ok(x.data.opening.lines.every(l=>Number(l.expected_float)===1000),'Val Fleuri real float must be 1000 DH on each till');

x=await call('POST',`/api/cash-opening/lines/${l1.id}/check`,'u-tr',{cashierName:'Interdit',declaredFloat:1000,posOk:true,tpeOk:true,printerOk:true,shiftOpened:true});
ok(x.r.status===403,'manager from another store must not validate Val Fleuri cash opening');
x=await call('POST',`/api/cash-opening/lines/${l1.id}/check`,'u-vf',{cashierName:'Caisse 1',declaredFloat:950,posOk:true,tpeOk:true,printerOk:true,shiftOpened:true,note:'écart fond'});
ok(x.r.status===409&&x.data.line?.status==='MISMATCH'&&x.data.issues?.length===1,'cash opening float mismatch API failed');
x=await call('POST',`/api/cash-opening/lines/${l1.id}/check`,'u-vf',{cashierName:'Caisse 1',declaredFloat:1000,posOk:true,tpeOk:true,printerOk:true,shiftOpened:true});
ok(x.r.status===200&&x.data.line?.status==='READY','cash opening correction API failed');
x=await call('POST',`/api/cash-opening/lines/${l2.id}/check`,'u-vf',{cashierName:'Caisse 2',declaredFloat:1000,posOk:true,tpeOk:true,printerOk:true,shiftOpened:true});
ok(x.r.status===200,'cash opening second till readiness API failed');
ok(x.data.opening?.status==='READY'&&x.data.opening?.metrics?.ready===2,'cash opening aggregate readiness API failed');

x=await call('PUT','/api/cash-opening/policy','u-vf',{floatTolerance:0.5});
ok(x.r.status===403,'store manager must not change cash opening policy');
x=await call('PUT','/api/cash-opening/policy','u-ops',{floatTolerance:0.5});
ok(x.r.status===200&&Number(x.data.float_tolerance_dh)===0.5,'director cash opening policy update failed');
x=await call('PUT','/api/cash-opening/policy','u-ops',{floatTolerance:0.01});
ok(x.r.status===200,'cash opening policy reset failed');
console.log('StoreOps Val Fleuri real cash opening API integration tests passed');
