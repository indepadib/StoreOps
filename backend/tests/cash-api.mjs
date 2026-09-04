const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
async function call(method,path,user='u-si',payload){
  const r=await fetch(BASE+path,{method,headers:{'content-type':'application/json','x-demo-user':user},body:payload===undefined?undefined:JSON.stringify(payload)});
  let data={};try{data=await r.json()}catch{}
  return{r,data};
}
function ok(v,m){if(!v)throw new Error(m)}

let x=await call('GET','/api/cash/config','u-si');
ok(x.r.status===200&&Number(x.data.policy?.tolerance_dh)===1,'cash API config failed');

x=await call('GET','/api/stores/sindibad/cash-closing','u-si');
ok(x.r.status===200&&x.data.sync?.ok===true,'cash Dynamics sync failed');
ok(x.data.closing?.lines?.length===3,'cash closing must expose 3 shifts');
ok(Number(x.data.closing.metrics?.expectedSales)===10500,'cash expected sales aggregate failed');
const closingId=x.data.closing.id;
const [l1,l2,l3]=x.data.closing.lines;

x=await call('POST',`/api/cash/lines/${l1.id}/count`,'u-emp-vf',{declaredCash:l1.expected_cash,cardSettlement:l1.expected_card,statementOk:true});
ok(x.r.status===403,'employee from another store must not count cash');

x=await call('POST',`/api/cash/lines/${l1.id}/count`,'u-si',{declaredCash:l1.expected_cash-2,cardSettlement:l1.expected_card,statementOk:true});
ok(x.r.status===409,'cash variance without reason must be blocked');
x=await call('POST',`/api/cash/lines/${l1.id}/count`,'u-si',{declaredCash:l1.expected_cash,cardSettlement:l1.expected_card,statementOk:true});
ok(x.r.status===200&&x.data.lines.find(i=>i.id===l1.id)?.status==='COUNTED','cash conform count failed');

x=await call('POST',`/api/cash/lines/${l2.id}/count`,'u-si',{declaredCash:l2.expected_cash,cardSettlement:l2.expected_card,statementOk:false});
ok(x.r.status===200&&x.data.lines.find(i=>i.id===l2.id)?.status==='RECOUNT','statement NOK must force recount');
x=await call('POST',`/api/cash/lines/${l2.id}/count`,'u-si',{declaredCash:l2.expected_cash,cardSettlement:l2.expected_card,statementOk:true,recount:true});
ok(x.r.status===200&&x.data.lines.find(i=>i.id===l2.id)?.status==='COUNTED','cash recount failed');

x=await call('POST',`/api/cash/lines/${l3.id}/count`,'u-si',{declaredCash:l3.expected_cash,cardSettlement:l3.expected_card,statementOk:true});
ok(x.r.status===200&&x.data.lines.find(i=>i.id===l3.id)?.status==='COUNTED','third cash shift count failed');

x=await call('POST',`/api/cash/${closingId}/finalize`,'u-si',{});
ok(x.r.status===200&&x.data.closing?.status==='READY'&&x.data.varianceLines?.length===0,'cash finalize READY failed');
x=await call('GET','/api/stores/sindibad/tasks?group=closing','u-si');
const cashTask=x.data.tasks?.find(t=>t.step_order===3);
ok(x.r.status===200&&cashTask?.status==='COMPLETED','cash module must auto-complete closing cash task through API');

x=await call('POST',`/api/cash/${closingId}/close`,'u-si',{});
ok(x.r.status===200&&x.data.status==='CLOSED','cash close failed');
x=await call('GET','/api/stores/sindibad/cash-closing','u-si');
ok(x.r.status===200&&x.data.summary?.status==='CLOSED'&&x.data.summary?.blocking===0,'cash closing summary after close failed');

x=await call('PUT','/api/cash/policy','u-si',{tolerance:2,recountThreshold:6,evidenceThreshold:25});
ok(x.r.status===403,'store manager must not change cash policy');
x=await call('PUT','/api/cash/policy','u-ops',{tolerance:2,recountThreshold:6,evidenceThreshold:25});
ok(x.r.status===200&&Number(x.data.tolerance_dh)===2,'director cash policy update failed');
x=await call('PUT','/api/cash/policy','u-ops',{tolerance:1,recountThreshold:5,evidenceThreshold:20});
ok(x.r.status===200,'cash policy reset failed');

console.log('StoreOps V1.9.1 cash API tests passed');
