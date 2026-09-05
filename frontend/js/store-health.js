const cap=(value,max)=>Math.min(max,Math.max(0,Number(value)||0));
function penalty(key,label,points,max){const value=cap(points,max);return value>0?{key,label,points:value}:null}
export function calculateStoreHealth({dashboard={},staff={},cold={},cashOpen={},receipts={},quality={},maintenance={},loss={}}={}){
 const openingPending=dashboard.day?.opening_status!=='OPENED',closingStarted=dashboard.day?.closing_status==='IN_PROGRESS';
 const otherOpen=Math.max(0,Number(dashboard.incidents||0)-Number(maintenance.openCount||0));
 const otherCritical=Math.max(0,Number(dashboard.criticalIncidents||0)-Number(maintenance.critical||0));
 const otherOverdue=Math.max(0,Number(dashboard.overdueIncidents||0)-Number(maintenance.overdue||0));
 const rows=[
  penalty('INCIDENTS','Incidents',otherOpen*3+otherCritical*5+otherOverdue*4+Number(dashboard.escalatedIncidents||0)*3,25),
  penalty('MAINTENANCE','Maintenance',Number(maintenance.openCount||0)*2+Number(maintenance.critical||0)*6+Number(maintenance.blocking||0)*5+Number(maintenance.overdue||0)*4,20),
  penalty('QUALITY','Qualité',Number(quality.nonConform||0)*3+Number(quality.temperatureNok||0)*5+(Number(quality.rejected||0)>0?2:0),15),
  penalty('RECEIVING','Réception',Number(receipts.overdue||0)*6+(Number(receipts.pendingLines||0)>0&&Number(receipts.dueToday||0)>0?3:0),12),
  penalty('DLC','DLC / DDM',Number(dashboard.dlc?.expired||0)*7+Number(dashboard.dlc?.critical||0)*4+Number(dashboard.dlc?.pendingActions||0),18),
  penalty('COMMERCIAL','Prix & promotions',Number(dashboard.commercial?.blocking||0)*5+Number(dashboard.commercial?.mismatch||0)*4+Number(dashboard.commercial?.pending||0),15),
  penalty('INVENTORY','Stock / inventaire',Number(dashboard.inventory?.pendingRecounts||0)*2+Number(dashboard.inventory?.varianceLines||0),10),
  penalty('LOSS','Démarque & pertes',Number(loss.blocking||0)*2,8),
  openingPending?penalty('STAFFING','Équipe ouverture',Number(staff.blocking||0)*3,9):null,
  openingPending?penalty('COLD','Chaîne du froid',Number(cold.mismatch||0)*5+Number(cold.blocking||0)*2,12):null,
  openingPending?penalty('CASH_OPENING','Préparation caisses',Number(cashOpen.mismatch||0)*4+Number(cashOpen.blocking||0)*2,12):null,
  openingPending?penalty('OPENING','Parcours ouverture',Number(dashboard.opening?.blockers||0)*2,10):null,
  closingStarted?penalty('CASH_CLOSING','Clôture caisses',Number(dashboard.cash?.pending||0)*2+Number(dashboard.cash?.recounts||0)*3,10):null
 ].filter(Boolean).sort((a,b)=>b.points-a.points);
 const totalPenalty=rows.reduce((s,x)=>s+x.points,0),score=Math.max(0,Math.round(100-totalPenalty));
 const state=score>=90?'EXCELLENT':score>=80?'GOOD':score>=65?'WATCH':score>=50?'RISK':'CRITICAL';
 const label={EXCELLENT:'Excellent',GOOD:'Bon',WATCH:'À surveiller',RISK:'À risque',CRITICAL:'Critique'}[state];
 return{score,state,label,totalPenalty,penalties:rows};
}
