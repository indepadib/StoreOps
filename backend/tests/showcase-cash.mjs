const mem=new Map();
globalThis.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
const {mockCashApi,cashShowcaseSummary,resetCashShowcase}=await import('../../frontend/js/mock-cash.js');
function ok(v,m){if(!v)throw new Error(m)}

resetCashShowcase();
localStorage.setItem('storeops_user','u-vf');
let x=await mockCashApi('/api/stores/val-fleuri/cash-closing');
ok(x.closing.lines.length===3&&x.closing.metrics.expectedSales===10500,'showcase cash snapshot failed');
const closingId=x.closing.id,[l1,l2,l3]=x.closing.lines;

localStorage.setItem('storeops_user','u-emp-vf');
let employeeBlocked=false;try{await mockCashApi(`/api/cash/lines/${l1.id}/count`,{method:'POST',body:JSON.stringify({declaredCash:l1.expected_cash,cardSettlement:l1.expected_card,statementOk:true})})}catch(e){employeeBlocked=e.status===403}
ok(employeeBlocked,'showcase employee cash permission failed');

localStorage.setItem('storeops_user','u-vf');
x=await mockCashApi(`/api/cash/lines/${l1.id}/count`,{method:'POST',body:JSON.stringify({declaredCash:l1.expected_cash,cardSettlement:l1.expected_card,statementOk:true})});
ok(x.lines.find(i=>i.id===l1.id).status==='COUNTED','showcase conform cash count failed');
x=await mockCashApi(`/api/cash/lines/${l2.id}/count`,{method:'POST',body:JSON.stringify({declaredCash:l2.expected_cash,cardSettlement:l2.expected_card,statementOk:false})});
ok(x.lines.find(i=>i.id===l2.id).status==='RECOUNT','showcase statement recount failed');
x=await mockCashApi(`/api/cash/lines/${l2.id}/count`,{method:'POST',body:JSON.stringify({declaredCash:l2.expected_cash,cardSettlement:l2.expected_card,statementOk:true,recount:true})});
ok(x.lines.find(i=>i.id===l2.id).status==='COUNTED','showcase cash recount failed');
x=await mockCashApi(`/api/cash/lines/${l3.id}/count`,{method:'POST',body:JSON.stringify({declaredCash:l3.expected_cash,cardSettlement:l3.expected_card,statementOk:true})});
ok(x.lines.find(i=>i.id===l3.id).status==='COUNTED','showcase third cash shift failed');

x=await mockCashApi(`/api/cash/${closingId}/finalize`,{method:'POST'});
ok(x.closing.status==='READY'&&x.varianceLines.length===0,'showcase cash finalize failed');
ok(cashShowcaseSummary('val-fleuri').blocking===0,'showcase READY must clear cash blocker');
x=await mockCashApi(`/api/cash/${closingId}/close`,{method:'POST'});
ok(x.status==='CLOSED'&&cashShowcaseSummary('val-fleuri').status==='CLOSED','showcase cash close failed');

localStorage.setItem('storeops_user','u-vf');
let policyBlocked=false;try{await mockCashApi('/api/cash/policy',{method:'PUT',body:JSON.stringify({tolerance:2,recountThreshold:6,evidenceThreshold:25})})}catch(e){policyBlocked=e.status===403}
ok(policyBlocked,'showcase store manager must not change cash policy');
localStorage.setItem('storeops_user','u-ops');
x=await mockCashApi('/api/cash/policy',{method:'PUT',body:JSON.stringify({tolerance:2,recountThreshold:6,evidenceThreshold:25})});
ok(Number(x.tolerance_dh)===2,'showcase director cash policy failed');
console.log('StoreOps V1.9.2 showcase cash tests passed');
