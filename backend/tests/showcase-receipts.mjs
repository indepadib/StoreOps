const mem=new Map();
globalThis.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
globalThis.window={STOREOPS_CONFIG:{mode:'showcase'}};
const {mockApi,resetShowcase}=await import('../../frontend/js/mock-api.js');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const future=()=>{const d=new Date();d.setUTCDate(d.getUTCDate()+30);return d.toISOString().slice(0,10)};

resetShowcase();localStorage.setItem('storeops_user','u-vf');
let receipts=await mockApi('/api/stores/val-fleuri/receipts');
ok(Array.isArray(receipts)&&receipts.length>0,'showcase must expose at least one receipt');
const po=receipts[0];ok(po.lines.length>0,'receipt must contain lines');

localStorage.setItem('storeops_user','u-emp-vf');
let denied=false;try{const line=po.lines[0];await mockApi(`/api/receipts/${encodeURIComponent(po.po_number)}/lines/${line.id}/quality`,{method:'POST',body:JSON.stringify({deliveredQty:line.ordered_qty,acceptedQty:line.ordered_qty,rejectedQty:0,packagingStatus:'OK',appearanceStatus:'OK'})})}catch(e){denied=e.status===403}ok(denied,'employee must not validate receiving quality');

localStorage.setItem('storeops_user','u-vf');
let earlyPost=false;try{await mockApi(`/api/receipts/${encodeURIComponent(po.po_number)}/post`,{method:'POST'})}catch(e){earlyPost=e.status===409}ok(earlyPost,'receipt posting must be blocked until all lines are controlled');

for(const line of po.lines){
  const profile=await mockApi(`/api/quality-profiles/${encodeURIComponent(line.category||'Autre')}`);
  const body={deliveredQty:Number(line.ordered_qty),acceptedQty:Number(line.ordered_qty),rejectedQty:0,temperature:profile.temperature_required?(Number(profile.temp_min)+Number(profile.temp_max))/2:null,packagingStatus:profile.packaging_required?'OK':'NA',appearanceStatus:profile.appearance_required?'OK':'NA',expiryDate:profile.expiry_required?future():null,lotRef:profile.lot_required?'LOT-TEST':null,comment:'CI contrôle conforme'};
  const result=await mockApi(`/api/receipts/${encodeURIComponent(po.po_number)}/lines/${line.id}/quality`,{method:'POST',body:JSON.stringify(body)});
  ok(result.decision==='ACCEPT','conform receiving line should be accepted');
}
const posted=await mockApi(`/api/receipts/${encodeURIComponent(po.po_number)}/post`,{method:'POST'});
ok(posted.ok===true,'fully controlled receipt should be postable in Showcase');
receipts=await mockApi('/api/stores/val-fleuri/receipts');
ok(receipts.find(r=>r.po_number===po.po_number)?.status==='POSTED','receipt status must become POSTED');
console.log('StoreOps V1.24 Showcase receiving quality tests passed');
