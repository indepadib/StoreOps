const priorityBase={P0:400,P1:300,P2:200,P3:100};
const severityBonus={CRITICAL:60,HIGH:30,NORMAL:10,LOW:0};
const categoryBonus={STOCK:26,COMMERCIAL:24,QUALITY:22,DLC:20,OPENING:18,RECEIPT:14,INVENTORY:12,LOSS:10,OTHER:0};

export function priorityFromContext({category,type,severity,blocking,promo=false,overdue=false,mismatch=false}={}){
  if(blocking&&severity==='CRITICAL')return 'P0';
  if(category==='STOCK'&&type==='NEGATIVE')return 'P0';
  if(category==='STOCK'&&type==='OUT'&&promo)return 'P0';
  if(category==='COMMERCIAL'&&mismatch)return 'P0';
  if(category==='QUALITY'&&severity==='CRITICAL')return 'P0';
  if(category==='DLC'&&severity==='CRITICAL')return 'P0';
  if(category==='STOCK'&&type==='OUT')return 'P1';
  if(blocking)return 'P1';
  if(overdue)return 'P1';
  if(severity==='CRITICAL'||severity==='HIGH')return 'P1';
  return 'P2';
}

export function scoreManagerAction(item={}){
  const p=priorityBase[item.priority]??priorityBase.P2;
  const s=severityBonus[item.severity]??0;
  const c=categoryBonus[item.category]??0;
  const blocker=item.blocking?35:0;
  const overdue=item.overdue?18:0;
  const promo=item.promo?16:0;
  return p+s+c+blocker+overdue+promo;
}

export function sortManagerActions(rows=[]){
  return [...rows].sort((a,b)=>scoreManagerAction(b)-scoreManagerAction(a)||String(a.title||'').localeCompare(String(b.title||''),'fr'));
}

export function priorityLabel(priority){return {P0:'Immédiat',P1:'Prioritaire',P2:'Aujourd’hui',P3:'À surveiller'}[priority]||'Aujourd’hui'}
