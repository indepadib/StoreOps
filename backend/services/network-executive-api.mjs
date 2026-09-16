import { db,todayISO } from '../db.mjs';
import { getManagerHomeFast } from './manager-home-fast.mjs';
import { canViewNetwork } from './permissions.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS store_presentation(
 store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
 photo_url TEXT NULL,
 short_label TEXT NULL,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const n=v=>Number(v||0);
function managerFor(storeId){return db.prepare(`SELECT id,name FROM users WHERE store_id=? AND role='store_manager' AND active=1 ORDER BY name LIMIT 1`).get(storeId)||null}
function presentationFor(storeId){return db.prepare(`SELECT photo_url,short_label FROM store_presentation WHERE store_id=?`).get(storeId)||{photo_url:null,short_label:null}}
function pushIssue(list,{code,icon,label,count=1,severity='HIGH',page,detail=''}){if(n(count)<=0)return;list.push({code,icon,label,count:n(count),severity,page,detail})}
function storeBrief(store,businessDate){
 const fast=getManagerHomeFast(store.id,businessDate),d=fast.dashboard||{},manager=managerFor(store.id),presentation=presentationFor(store.id),issues=[];
 const open=d.day?.opening_status==='OPENED',closed=d.day?.closing_status==='CLOSED';
 pushIssue(issues,{code:'OPENING_BLOCKED',icon:'door',label:'Ouverture bloquée',count:!open&&n(d.opening?.blockers)>0?1:0,severity:'CRITICAL',page:'opening',detail:`${n(d.opening?.blockers)} blocage(s)`});
 pushIssue(issues,{code:'STAFFING',icon:'users',label:'Équipe ouverture incomplète',count:!open?n(fast.staff?.blocking):0,severity:'CRITICAL',page:'staffing'});
 pushIssue(issues,{code:'COLD',icon:'thermometer',label:'Chaîne du froid',count:n(fast.cold?.blocking),severity:'CRITICAL',page:'coldChain'});
 pushIssue(issues,{code:'CASH_OPEN',icon:'cash',label:'Caisses à préparer',count:!open?n(fast.cashOpen?.blocking):0,severity:'HIGH',page:'cashOpening'});
 pushIssue(issues,{code:'DLC',icon:'calendar',label:'DLC / DDM critiques',count:n(d.dlc?.expired)+n(d.dlc?.critical),severity:'CRITICAL',page:'dlc'});
 pushIssue(issues,{code:'QUALITY',icon:'shield',label:'Non-conformités qualité',count:n(fast.quality?.nonConform),severity:n(fast.quality?.temperatureNok)>0?'CRITICAL':'HIGH',page:'quality'});
 pushIssue(issues,{code:'INCIDENT',icon:'alert',label:'Incidents critiques',count:n(d.criticalIncidents),severity:'CRITICAL',page:'incidents'});
 pushIssue(issues,{code:'SLA',icon:'clock',label:'SLA en retard',count:n(d.overdueIncidents),severity:'HIGH',page:'incidents'});
 pushIssue(issues,{code:'COMMERCIAL',icon:'tag',label:'Prix / promos à traiter',count:n(d.commercial?.blocking)+n(d.commercial?.mismatch),severity:'HIGH',page:'commercial'});
 pushIssue(issues,{code:'STOCK',icon:'box',label:'Recomptages stock',count:n(d.inventory?.pendingRecounts),severity:'MEDIUM',page:'inventory'});
 pushIssue(issues,{code:'LOSS',icon:'loss',label:'Démarque à finaliser',count:n(fast.loss?.blocking),severity:'HIGH',page:'losses'});
 pushIssue(issues,{code:'CLOSING',icon:'lock',label:'Clôture à traiter',count:!closed&&n(d.cash?.blocking)>0?1:0,severity:'HIGH',page:'cash'});
 const rank={CRITICAL:5,HIGH:3,MEDIUM:1,LOW:0};issues.sort((a,b)=>(rank[b.severity]||0)-(rank[a.severity]||0)||b.count-a.count);
 const riskScore=issues.reduce((s,x)=>s+(rank[x.severity]||0)*Math.max(1,Math.min(x.count,4)),0);
 const phase=closed?'CLOSED':open?'DAY':n(d.closing?.percent)>0?'CLOSING':'OPENING';
 return{id:store.id,name:store.name,code:store.code,managerId:manager?.id||null,managerName:manager?.name||'Responsable non affecté',photoUrl:presentation.photo_url||null,shortLabel:presentation.short_label||null,phase,health:n(d.health),riskScore,issueCount:issues.length,criticalIssueCount:issues.filter(x=>x.severity==='CRITICAL').length,openingPercent:n(d.opening?.percent),closingPercent:n(d.closing?.percent),issues,headline:issues[0]||null}
}

export function networkExecutiveBrief(businessDate=todayISO()){
 const stores=db.prepare(`SELECT id,name,code FROM stores WHERE active=1 ORDER BY name`).all().map(s=>storeBrief(s,businessDate)).sort((a,b)=>b.riskScore-a.riskScore||a.name.localeCompare(b.name));
 const priorities=stores.flatMap(s=>s.issues.map(issue=>({...issue,storeId:s.id,storeName:s.name,storeCode:s.code,managerName:s.managerName,riskScore:s.riskScore}))).sort((a,b)=>({CRITICAL:3,HIGH:2,MEDIUM:1}[b.severity]||0)-({CRITICAL:3,HIGH:2,MEDIUM:1}[a.severity]||0)||b.count-a.count).slice(0,10);
 return{status:'READY',generatedAt:new Date().toISOString(),businessDate,summary:{stores:stores.length,storesAtRisk:stores.filter(x=>x.issueCount>0).length,criticalStores:stores.filter(x=>x.criticalIssueCount>0).length,openNow:stores.filter(x=>x.phase==='DAY').length,criticalIssues:priorities.filter(x=>x.severity==='CRITICAL').reduce((s,x)=>s+x.count,0)},priorities,stores}
}

export async function handleNetworkExecutiveApi({req,url,user}){
 if(url.pathname==='/api/network/overview'&&req.method==='GET'){
  if(!canViewNetwork(user))return{status:403,data:{error:'Droit « Réseau » requis.',code:'NETWORK_VIEW_REQUIRED'}};
  return{status:200,data:networkExecutiveBrief(url.searchParams.get('date')||todayISO())}
 }
 const m=url.pathname.match(/^\/api\/admin\/stores\/([^/]+)\/presentation$/);
 if(m&&(req.method==='PUT'||req.method==='PATCH')){
  if(user.permissions_profile!=='platform_admin'&&user.id!=='u-admin'&&user.role!=='ops_director')return{status:403,data:{error:'Configuration magasin réservée à la Direction / Admin.'}};
  let raw='';for await(const c of req)raw+=c;let b={};try{b=raw?JSON.parse(raw):{}}catch{return{status:400,data:{error:'JSON invalide'}}}
  const storeId=decodeURIComponent(m[1]);if(!db.prepare(`SELECT id FROM stores WHERE id=?`).get(storeId))return{status:404,data:{error:'Magasin introuvable.'}};
  const photoUrl=String(b.photoUrl||'').trim()||null,shortLabel=String(b.shortLabel||'').trim()||null;
  db.prepare(`INSERT INTO store_presentation(store_id,photo_url,short_label,updated_by,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(store_id) DO UPDATE SET photo_url=excluded.photo_url,short_label=excluded.short_label,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).run(storeId,photoUrl,shortLabel,user.id);
  return{status:200,data:{storeId,photoUrl,shortLabel}}
 }
 return null
}
