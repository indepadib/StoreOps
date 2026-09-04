const mem=new Map();
globalThis.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
globalThis.window={STOREOPS_CONFIG:{mode:'showcase',apiBase:''}};
const {mockApi}=await import('../../frontend/js/mock-api.js');
const {mockLossApi,lossShowcaseSummary,resetLossShowcase}=await import('../../frontend/js/mock-loss.js');
function ok(v,m){if(!v)throw new Error(m)}
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';

resetLossShowcase();
localStorage.setItem('storeops_user','u-vf');
let x=await mockLossApi('/api/stores/val-fleuri/losses',{method:'POST',body:JSON.stringify({ean:'3017620422003',reasonCode:'BREAKAGE',quantity:1,unit:'pièce'})},mockApi);
ok(x.status==='READY_TO_POST'&&Number(x.requires_evidence)===0,'showcase small loss create failed');
x=await mockLossApi(`/api/losses/${x.id}/post`,{method:'POST'},mockApi);ok(x.record.status==='POSTED','showcase small loss post failed');

x=await mockLossApi('/api/stores/val-fleuri/losses',{method:'POST',body:JSON.stringify({ean:'3017620422003',reasonCode:'DAMAGED',quantity:2,unit:'pièce',note:'détérioré'})},mockApi);
ok(x.requires_evidence===1&&x.incident?.status==='OPEN','showcase loss incident create failed');const medium=x;
let blocked=false;try{await mockLossApi(`/api/losses/${medium.id}/post`,{method:'POST'},mockApi)}catch(e){blocked=e.status===409}ok(blocked,'showcase evidence loss must block posting');
let inc=await mockApi(`/api/incidents/${medium.incident_id}`),action=inc.actions.find(a=>a.status==='OPEN');ok(action,'showcase corrective action missing');
await mockApi(`/api/incidents/${inc.id}/actions/${action.id}/complete`,{method:'POST',body:JSON.stringify({note:'sortie contrôlée'})});
await mockApi(`/api/incidents/${inc.id}/evidence`,{method:'POST',body:JSON.stringify({dataUrl:PNG,fileName:'preuve.png',caption:'preuve démarque'})});
inc=await mockApi(`/api/incidents/${inc.id}/resolve`,{method:'POST',body:JSON.stringify({resolutionNote:'documentée'})});ok(inc.status==='RESOLVED','showcase loss incident resolve failed');
x=await mockLossApi(`/api/losses/${medium.id}/post`,{method:'POST'},mockApi);ok(x.record.status==='POSTED','showcase evidence loss post failed');

x=await mockLossApi('/api/stores/val-fleuri/losses',{method:'POST',body:JSON.stringify({ean:'3017620422003',reasonCode:'UNKNOWN_SHRINK',quantity:8,unit:'pièce'})},mockApi);ok(x.status==='APPROVAL_REQUIRED','showcase approval threshold failed');const high=x;
localStorage.setItem('storeops_user','u-vf');let approveBlocked=false;try{await mockLossApi(`/api/losses/${high.id}/approve`,{method:'POST'},mockApi)}catch(e){approveBlocked=e.status===403}ok(approveBlocked,'showcase manager approval must fail');
localStorage.setItem('storeops_user','u-ops');x=await mockLossApi(`/api/losses/${high.id}/approve`,{method:'POST'},mockApi);ok(x.status==='APPROVED','showcase director approval failed');
ok(lossShowcaseSummary('val-fleuri').blocking===1,'showcase loss blocker summary failed');

console.log('StoreOps V1.10 showcase loss tests passed');
