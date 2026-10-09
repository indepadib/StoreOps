export const NETWORK_ACTIONS=Object.freeze({today:'Ouvrir le magasin',opening:'Vérifier l’ouverture',incidents:'Traiter les incidents',coldChain:'Contrôler le froid',dlc:'Traiter les DLC',commercial:'Contrôler prix / promos',inventory:'Vérifier le stock',handover:'Traiter la passation',quality:'Vérifier la réception',staffing:'Vérifier l’équipe',cashOpening:'Vérifier les caisses',losses:'Traiter la démarque',cash:'Contrôler la clôture',managerPerformance:'Analyser l’activité'});
export function networkDestination(stores,storeId,page='today'){
 if(!Array.isArray(stores)||!stores.some(s=>s.id===storeId))return null;
 return{storeId,page:Object.hasOwn(NETWORK_ACTIONS,page)?page:'today'};
}
