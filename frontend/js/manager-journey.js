export function managerPhase(dashboard={}){
  const opening=dashboard.day?.opening_status||'NOT_STARTED';
  const closing=dashboard.day?.closing_status||'NOT_STARTED';
  if(opening!=='OPENED')return 'OPENING';
  if(closing==='CLOSED')return 'CLOSED';
  if(closing==='IN_PROGRESS')return 'CLOSING';
  return 'DAY';
}

export function chooseManagerNextAction({dashboard={},staff={},cold={},cashOpen={},maintenance={},receipts={},quality={},loss={},incidents=[]}={}){
  const phase=managerPhase(dashboard);
  const action=(level,title,detail,page,cta='Traiter maintenant')=>({level,title,detail,page,cta});

  if(phase==='OPENING'){
    if(Number(dashboard.handover?.blocking||0)>0)return action('CRITICAL','Traiter la passation bloquante',`${dashboard.handover.blocking} sujet(s) empêchent l’ouverture.`,'handover');
    if(Number(staff.blocking||0)>0)return action('CRITICAL','Compléter l’équipe d’ouverture',`${staff.pending||0} personne(s) restent à pointer.`,'staffing');
    if(Number(cold.blocking||0)>0)return action('CRITICAL','Sécuriser la chaîne du froid',`${cold.blocking} zone(s) doivent être contrôlées.`,'coldChain');
    if(Number(cashOpen.blocking||0)>0)return action('CRITICAL','Préparer les caisses',`${cashOpen.blocking} caisse(s) empêchent une ouverture sereine.`,'cashOpening');
    if(Number(dashboard.commercial?.blocking||0)>0)return action('HIGH','Finaliser prix & promotions',`${dashboard.commercial.blocking} contrôle(s) restent bloquants.`,'commercial');
    return action('NORMAL','Continuer le parcours d’ouverture',`${dashboard.opening?.done||0}/${dashboard.opening?.total||0} étapes validées.`,'opening','Continuer l’ouverture');
  }

  if(Number(maintenance.critical||0)>0||Number(maintenance.blocking||0)>0)return action('CRITICAL','Traiter une panne bloquante',`${maintenance.openCount||0} panne(s) ouverte(s), dont ${maintenance.blocking||0} bloquante(s).`,'maintenance');
  if(Number(receipts.overdue||0)>0&&Number(receipts.pendingLines||0)>0)return action('CRITICAL','Finaliser une réception en retard',`${receipts.pendingLines} ligne(s) restent à contrôler.`,'receipts');
  if(Number(quality.temperatureNok||0)>0)return action('CRITICAL','Traiter un écart de température',`${quality.temperatureNok} contrôle(s) qualité hors tolérance.`,'quality');
  const criticalIncidents=(incidents||[]).filter(x=>x.status==='OPEN'&&x.criticality==='CRITICAL').length;
  if(criticalIncidents>0)return action('CRITICAL','Résoudre les incidents critiques',`${criticalIncidents} incident(s) nécessitent une action immédiate.`,'incidents');
  if(Number(dashboard.dlc?.expired||0)+Number(dashboard.dlc?.critical||0)>0)return action('HIGH','Traiter les DLC prioritaires',`${Number(dashboard.dlc?.expired||0)+Number(dashboard.dlc?.critical||0)} lot(s) critiques/périmés.`,'dlc');
  if(Number(dashboard.inventory?.pendingRecounts||0)>0)return action('HIGH','Faire les recomptages stock',`${dashboard.inventory.pendingRecounts} recomptage(s) en attente.`,'inventory');
  if(Number(loss.blocking||0)>0)return action('HIGH','Finaliser la démarque',`${loss.blocking} enregistrement(s) restent bloquants.`,'losses');

  if(phase==='CLOSING'){
    if(!dashboard.cycle?.handoverReviewed)return action('HIGH','Revoir la passation de fin de journée','Confirme les sujets à transmettre à l’équipe suivante.','handover');
    if(dashboard.cash?.status!=='CLOSED'&&(Number(dashboard.cash?.pending||0)>0||Number(dashboard.cash?.recounts||0)>0))return action('CRITICAL','Finaliser la clôture des caisses',`${dashboard.cash?.pending||0} shift(s) et ${dashboard.cash?.recounts||0} recomptage(s) restent à traiter.`,'cash');
    return action('NORMAL','Terminer la fermeture magasin',`${dashboard.closing?.done||0}/${dashboard.closing?.total||0} étapes validées.`,'closing','Continuer la fermeture');
  }

  if(phase==='CLOSED')return action('NORMAL','Journée terminée','Le magasin est fermé et les contrôles du jour sont archivés.','managerJourney','Voir le résumé');
  return action('NORMAL','Faire le tour des contrôles du jour','Aucun blocage critique. Vérifie les contrôles terrain qui restent à faire.','managerControls','Voir mes contrôles');
}

export function managerPhaseLabel(phase){
  return {OPENING:'Ouverture',DAY:'Exploitation',CLOSING:'Fermeture',CLOSED:'Terminé'}[phase]||'Journée';
}
