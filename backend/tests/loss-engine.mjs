process.env.STOREOPS_DB=process.env.STOREOPS_DB||'/tmp/storeops-loss-engine.db';
process.env.STOREOPS_MEDIA_DIR=process.env.STOREOPS_MEDIA_DIR||'/tmp/storeops-loss-media';
const {db}=await import('../db.mjs');
const {createLossRecord,lossSummary,blockingLossCount,approveLossRecord,markLossPosted,lossConfig}=await import('../services/loss.mjs');
const {addEvidence,completeAction,resolveIncident}=await import('../services/incidents.mjs');
function ok(v,m){if(!v)throw new Error(m)}
const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get(),director=db.prepare(`SELECT * FROM users WHERE id='u-ops'`).get();
const product={ean:'6111040001111',productNumber:'LAIT1L',name:'Lait frais entier 1L',category:'Frais',price:12.9};
const cfg=lossConfig();ok(Number(cfg.policy.evidence_threshold_dh)===100&&Number(cfg.policy.approval_threshold_dh)===500,'loss policy defaults failed');

let low=createLossRecord({storeId:'val-fleuri',user:manager,product,reasonCode:'BREAKAGE',quantity:1,unit:'pièce',note:'Bouteille cassée'});
ok(low.status==='READY_TO_POST'&&low.requires_evidence===0&&low.total_retail_value===12.9,'low loss classification failed');
low=markLossPosted({id:low.id,user:manager});ok(low.status==='POSTED','low loss posting failed');

let medium=createLossRecord({storeId:'val-fleuri',user:manager,product,reasonCode:'DAMAGED',quantity:10,unit:'pièce',note:'Carton détérioré'});
ok(medium.status==='READY_TO_POST'&&medium.requires_evidence===1&&medium.incident?.status==='OPEN','medium loss evidence rule failed');
let blocked=false;try{markLossPosted({id:medium.id,user:manager})}catch(e){blocked=e.status===409}ok(blocked,'loss posting must require resolved evidence incident');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl7lK0AAAAASUVORK5CYII=';
let inc=medium.incident;addEvidence({incidentId:inc.id,user:manager,dataUrl:png,fileName:'preuve-perte.png',caption:'Produit détérioré'});completeAction({incidentId:inc.id,actionId:inc.actions[0].id,user:manager,note:'Produit isolé et preuve jointe'});resolveIncident({incidentId:inc.id,user:manager,resolutionNote:'Perte documentée'});
medium=markLossPosted({id:medium.id,user:manager});ok(medium.status==='POSTED','medium loss posting after evidence failed');

let high=createLossRecord({storeId:'val-fleuri',user:manager,product,reasonCode:'UNKNOWN_SHRINK',quantity:50,unit:'pièce',note:'Écart important'});
ok(high.status==='APPROVAL_REQUIRED'&&high.requires_evidence===1,'high loss approval rule failed');
let approvalBlocked=false;try{approveLossRecord({id:high.id,user:manager})}catch(e){approvalBlocked=e.status===403}ok(approvalBlocked,'manager must not approve high loss');
high=approveLossRecord({id:high.id,user:director});ok(high.status==='APPROVED','director loss approval failed');
inc=high.incident;addEvidence({incidentId:inc.id,user:manager,dataUrl:png,fileName:'preuve-demarque.png',caption:'Investigation démarque'});completeAction({incidentId:inc.id,actionId:inc.actions[0].id,user:manager,note:'Investigation terminée'});resolveIncident({incidentId:inc.id,user:manager,resolutionNote:'Écart documenté et approuvé'});
high=markLossPosted({id:high.id,user:manager});ok(high.status==='POSTED','approved high loss posting failed');

const sum=lossSummary('val-fleuri');ok(sum.records===3&&sum.posted===3&&sum.blocking===0&&sum.retailValue===786.9,'loss summary failed');ok(blockingLossCount('val-fleuri')===0,'loss blocking count failed');
console.log('StoreOps V1.10 loss & waste engine tests passed');
