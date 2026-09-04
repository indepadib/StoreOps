const mem=new Map();
globalThis.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
globalThis.sessionStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
globalThis.window={STOREOPS_CONFIG:{mode:'showcase',apiBase:''}};
const {api}=await import('../../frontend/js/api.js');
const {resetShowcase}=await import('../../frontend/js/mock-api.js');
const {resetLossShowcase}=await import('../../frontend/js/mock-loss.js');
function ok(v,m){if(!v)throw new Error(m)}
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const today=new Date().toISOString().slice(0,10);
resetShowcase();resetLossShowcase();localStorage.setItem('storeops_user','u-vf');

let dlc=await api('/api/stores/val-fleuri/dlc',{method:'POST',body:JSON.stringify({ean:'3017620422003',expiryType:'DLC',expiryDate:today,quantity:2,unit:'pièce',department:'Épicerie sucrée',family:'Chocolat et confiserie',zone:'Rayon',lotRef:'SHOW-AUTO-1'})});
let treated=await api(`/api/dlc/${dlc.id}/treatments`,{method:'POST',body:JSON.stringify({actionType:'DESTROY',quantity:2,note:'DLC détruite',dataUrl:PNG,fileName:'pv.png',caption:'PV destruction'})});
ok(treated.generated_loss?.reason_code==='EXPIRED','showcase DLC destroy must auto-create loss');
ok(Number(treated.generated_loss?.evidence_satisfied)===1&&!treated.generated_loss?.incident_id,'showcase DLC proof must be reused without loss incident');
let losses=await api('/api/stores/val-fleuri/losses');
ok(losses.items.length===1&&losses.items[0].source_type==='DLC_TREATMENT','showcase generated loss registry failed');
ok(losses.items[0].external_evidence?.source==='DLC','showcase external DLC proof marker missing');
await api(`/api/losses/${losses.items[0].id}/post`,{method:'POST'});
losses=await api('/api/stores/val-fleuri/losses');ok(losses.summary.posted===1&&losses.summary.blocking===0,'showcase generated DLC loss posting failed');

// A commercial markdown changes sellability but not stock: no loss record.
dlc=await api('/api/stores/val-fleuri/dlc',{method:'POST',body:JSON.stringify({ean:'3017620422003',expiryType:'DLC',expiryDate:today,quantity:3,unit:'pièce',department:'Épicerie sucrée',family:'Chocolat et confiserie',zone:'Rayon',lotRef:'SHOW-AUTO-2'})});
treated=await api(`/api/dlc/${dlc.id}/treatments`,{method:'POST',body:JSON.stringify({actionType:'MARKDOWN',quantity:0,note:'Démarque courte'})});
ok(treated.generated_loss==null,'showcase MARKDOWN must not create stock loss');
losses=await api('/api/stores/val-fleuri/losses');ok(losses.items.length===1,'showcase non-stock DLC action created duplicate loss');

// High-value destruction reuses proof but still requires Direction approval.
dlc=await api('/api/stores/val-fleuri/dlc',{method:'POST',body:JSON.stringify({ean:'3017620422003',expiryType:'DLC',expiryDate:today,quantity:8,unit:'pièce',department:'Épicerie sucrée',family:'Chocolat et confiserie',zone:'Rayon',lotRef:'SHOW-AUTO-3'})});
treated=await api(`/api/dlc/${dlc.id}/treatments`,{method:'POST',body:JSON.stringify({actionType:'DESTROY',quantity:8,dataUrl:PNG,fileName:'pv-high.png'})});
ok(treated.generated_loss?.status==='APPROVAL_REQUIRED'&&Number(treated.generated_loss?.evidence_satisfied)===1,'showcase high DLC loss approval/proof rule failed');
localStorage.setItem('storeops_user','u-ops');
let approved=await api(`/api/losses/${treated.generated_loss.id}/approve`,{method:'POST'});ok(approved.status==='APPROVED','showcase director approval of auto DLC loss failed');

console.log('StoreOps V1.10.2 Showcase DLC → loss automation tests passed');
