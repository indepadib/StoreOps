const mem=new Map();
globalThis.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
const {mockCashOpeningApi,cashOpeningShowcaseSummary,markCashOpeningShowcaseOpened,resetCashOpeningShowcase}=await import('../../frontend/js/mock-cash-opening.js');
function ok(v,m){if(!v)throw new Error(m)}
let taskCompleted=false;
const users={
 'u-vf':{id:'u-vf',name:'Ayoub Nachiti',role:'store_manager',store_id:'val-fleuri'},
 'u-emp-vf':{id:'u-emp-vf',name:'Employé Val Fleuri',role:'employee',store_id:'val-fleuri'},
 'u-ops':{id:'u-ops',name:'Directeur Exploitation',role:'ops_director',store_id:null}
};
async function core(path,options={}){
 const u=users[localStorage.getItem('storeops_user')||'u-vf'];
 if(path==='/api/session')return{user:u};
 if(path==='/api/stores/val-fleuri/tasks?group=opening')return{tasks:[{id:'task7',step_order:7,status:taskCompleted?'COMPLETED':'OPEN'}]};
 if(path==='/api/tasks/task7/submit'&&options.method==='POST'){taskCompleted=true;return{ok:true}};
 throw new Error('Core Showcase route inattendue: '+path);
}
resetCashOpeningShowcase();localStorage.setItem('storeops_user','u-vf');
let x=await mockCashOpeningApi('/api/stores/val-fleuri/cash-opening',{},core);ok(x.opening.lines.length===2&&x.summary.blocking===2,'showcase Val Fleuri must expose exactly two tills');const [l1,l2]=x.opening.lines;
ok(l1.tpe_mode==='INTEGRATED'&&l2.tpe_mode==='MANUAL','Val Fleuri TPE topology mismatch');
localStorage.setItem('storeops_user','u-emp-vf');let denied=false;try{await mockCashOpeningApi(`/api/cash-opening/lines/${l1.id}/check`,{method:'POST',body:JSON.stringify({cashierName:'Employé',declaredFloat:500,posOk:true,tpeOk:true,printerOk:true,shiftOpened:true})},core)}catch(e){denied=e.status===403}ok(denied,'showcase employee cash opening permission failed');
localStorage.setItem('storeops_user','u-vf');let mismatch=false;try{await mockCashOpeningApi(`/api/cash-opening/lines/${l1.id}/check`,{method:'POST',body:JSON.stringify({cashierName:'Sara',declaredFloat:450,posOk:true,tpeOk:true,printerOk:true,shiftOpened:true})},core)}catch(e){mismatch=e.status===409}ok(mismatch&&cashOpeningShowcaseSummary('val-fleuri').mismatch===1,'showcase cash opening mismatch failed');
for(const [line,name] of [[l1,'Sara'],[l2,'Yassine']])await mockCashOpeningApi(`/api/cash-opening/lines/${line.id}/check`,{method:'POST',body:JSON.stringify({cashierName:name,declaredFloat:500,posOk:true,tpeOk:true,printerOk:true,shiftOpened:true})},core);
ok(cashOpeningShowcaseSummary('val-fleuri').status==='READY'&&cashOpeningShowcaseSummary('val-fleuri').blocking===0&&taskCompleted,'showcase cash opening READY / task automation failed');
markCashOpeningShowcaseOpened('val-fleuri');ok(cashOpeningShowcaseSummary('val-fleuri').status==='OPENED','showcase cash opening OPENED transition failed');
let locked=false;try{await mockCashOpeningApi(`/api/cash-opening/lines/${l1.id}/check`,{method:'POST',body:JSON.stringify({cashierName:'Sara',declaredFloat:500,posOk:true,tpeOk:true,printerOk:true,shiftOpened:true})},core)}catch(e){locked=e.status===409}ok(locked,'showcase cash opening must lock after opening');
localStorage.setItem('storeops_user','u-vf');let policyDenied=false;try{await mockCashOpeningApi('/api/cash-opening/policy',{method:'PUT',body:JSON.stringify({floatTolerance:.5})},core)}catch(e){policyDenied=e.status===403}ok(policyDenied,'showcase manager must not change cash opening policy');
localStorage.setItem('storeops_user','u-ops');x=await mockCashOpeningApi('/api/cash-opening/policy',{method:'PUT',body:JSON.stringify({floatTolerance:.5})},core);ok(Number(x.float_tolerance_dh)===.5,'showcase director cash opening policy failed');
console.log('StoreOps Val Fleuri showcase cash opening tests passed');
