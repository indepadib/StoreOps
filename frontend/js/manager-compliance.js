function row(id,label,page,applicable,done,detail,level='NORMAL'){return{ id,label,page,applicable:!!applicable,done:!!done,detail,level }}
const ready=s=>['READY','OPENED','CLOSED'].includes(String(s||'').toUpperCase());
const severity={CRITICAL:0,HIGH:1,NORMAL:2};
export function managerDayCompliance({dashboard:d={},staff={},cold={},cashOpen={},receipts={},quality={},maintenance={},loss={}}={}){
  const day=d.day||{},openingDone=day.opening_status==='OPENED',closingStarted=day.closing_status==='IN_PROGRESS'||day.closing_status==='CLOSED',closingDone=day.closing_status==='CLOSED';
  const rows=[
    row('opening','Ouverture magasin','opening',true,openingDone,'Parcours d’ouverture validé','CRITICAL'),
    row('staffing','Équipe d’ouverture','staffing',!openingDone,ready(staff.status)&&Number(staff.blocking||0)===0,`${staff.present||0} présent(s) · ${staff.pending||0} à pointer`,'CRITICAL'),
    row('cold','Chaîne du froid','coldChain',!openingDone,ready(cold.status)&&Number(cold.blocking||0)===0,`${cold.ready||0}/${cold.lines||0} zone(s) conformes`,'CRITICAL'),
    row('cash-open','Préparation caisses','cashOpening',!openingDone,ready(cashOpen.status)&&Number(cashOpen.blocking||0)===0,`${cashOpen.ready||0}/${cashOpen.lines||0} caisse(s) prêtes`,'CRITICAL'),
    row('commercial','Prix & promotions','commercial',Number(d.commercial?.total||0)>0,Number(d.commercial?.blocking||0)===0&&Number(d.commercial?.verified||0)>=Number(d.commercial?.total||0),`${d.commercial?.verified||0}/${d.commercial?.total||0} vérifié(s)`,'HIGH'),
    row('receipts','Réceptions','receipts',Number(receipts.activeReceipts||0)>0||Number(receipts.pendingLines||0)>0,Number(receipts.pendingLines||0)===0,`${receipts.pendingLines||0} ligne(s) à contrôler`,'HIGH'),
    row('quality','Qualité','quality',Number(quality.nonConform||0)>0||Number(quality.controls||0)>0,Number(quality.nonConform||0)===0,`${quality.controls||0} contrôle(s) · ${quality.nonConform||0} NC`,'HIGH'),
    row('maintenance','Maintenance','maintenance',Number(maintenance.openCount||0)>0,Number(maintenance.critical||0)===0&&Number(maintenance.blocking||0)===0&&Number(maintenance.overdue||0)===0,`${maintenance.openCount||0} panne(s) ouverte(s)`,'HIGH'),
    row('dlc','DLC / DDM','dlc',Number(d.dlcAtRisk||0)>0,Number(d.dlc?.pendingActions||0)===0&&Number(d.dlc?.overdueControls||0)===0,`${d.dlcAtRisk||0} lot(s) à risque · ${d.dlc?.pendingActions||0} action(s)`,'HIGH'),
    row('inventory','Stock / inventaire','inventory',Number(d.inventory?.pendingRecounts||0)>0||Number(d.inventory?.openSessions||0)>0,Number(d.inventory?.pendingRecounts||0)===0,`${d.inventory?.pendingRecounts||0} recomptage(s)`,'HIGH'),
    row('losses','Démarque & pertes','losses',Number(loss.records||0)>0||Number(loss.blocking||0)>0,Number(loss.blocking||0)===0,`${loss.blocking||0} sortie(s) bloquante(s)`,'HIGH'),
    row('handover','Passation de fermeture','handover',closingStarted,!!d.cycle?.handoverReviewed,'Revue de passation de fin de journée','HIGH'),
    row('cash-close','Clôture caisses','cash',closingStarted,d.cash?.status==='CLOSED',`${d.cash?.pending||0} shift(s) restant(s)`,'CRITICAL'),
    row('closing','Fermeture magasin','closing',closingStarted,closingDone,'Parcours de fermeture validé','CRITICAL')
  ];
  const applicable=rows.filter(x=>x.applicable),done=applicable.filter(x=>x.done),pending=applicable.filter(x=>!x.done),percent=applicable.length?Math.round(done.length*100/applicable.length):100;
  const next=[...pending].sort((a,b)=>(severity[a.level]??9)-(severity[b.level]??9))[0]||null;
  return{percent,done:done.length,total:applicable.length,pending,next,rows:applicable,state:pending.some(x=>x.level==='CRITICAL')?'BLOCKED':pending.length?'PENDING':'COMPLETE'};
}
