const num=(v,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback};
const positive=(v,fallback=0)=>Math.max(0,num(v,fallback));
const round3=v=>Math.round((num(v)+Number.EPSILON)*1000)/1000;

export function weightedDailyVelocity({dailySales7=null,dailySales28=null,fallbackDailySales=null}={}){
 const s7=dailySales7===null||dailySales7===undefined?null:positive(dailySales7),s28=dailySales28===null||dailySales28===undefined?null:positive(dailySales28),fallback=fallbackDailySales===null||fallbackDailySales===undefined?null:positive(fallbackDailySales);
 if(s7!==null&&s28!==null)return round3(s7*.65+s28*.35);
 if(s7!==null)return round3(s7);
 if(s28!==null)return round3(s28);
 return fallback===null?null:round3(fallback)
}

export function recommendReplenishment(input={}){
 const storeAvailable=num(input.storeAvailable,0),supplyAvailable=Math.max(0,num(input.supplyAvailable,0)),confirmedInbound=Math.max(0,num(input.confirmedInbound,0));
 const velocity=weightedDailyVelocity(input),leadTimeDays=Math.max(0,num(input.leadTimeDays,1)),safetyDays=Math.max(0,num(input.safetyDays,1));
 const promoFactor=Math.max(.1,num(input.promoFactor,1)),dayFactor=Math.max(.1,num(input.dayOfWeekFactor,1)),packSize=Math.max(.001,positive(input.packSize,1)||1),minOrderQty=Math.max(0,positive(input.minOrderQty,0));
 const adjustedVelocity=velocity===null?null:round3(velocity*promoFactor*dayFactor),coverDays=adjustedVelocity&&adjustedVelocity>0?round3(Math.max(0,storeAvailable)/adjustedVelocity):null;
 const targetDays=round3(leadTimeDays+safetyDays),targetDemand=adjustedVelocity===null?null:round3(adjustedVelocity*targetDays),rawNeed=targetDemand===null?null:round3(targetDemand-storeAvailable-confirmedInbound);
 let recommendedQty=rawNeed===null?null:Math.max(0,Math.ceil(Math.max(rawNeed,minOrderQty)/packSize)*packSize);recommendedQty=recommendedQty===null?null:round3(recommendedQty);
 let decision='OK',actionQty=0,reason='Stock suffisant pour la couverture cible.';
 if(storeAvailable<0){decision='CHECK_STOCK';actionQty=0;reason='Stock négatif ou incohérent : contrôler le stock avant de commander.'}
 else if(velocity===null){decision='NEED_SALES_DATA';actionQty=0;reason='Historique de ventes insuffisant pour calculer une recommandation fiable.'}
 else if(recommendedQty>0&&supplyAvailable<=0){decision='WAREHOUSE_OUT';actionQty=0;reason='Réapprovisionnement nécessaire mais entrepôt sans stock disponible.'}
 else if(recommendedQty>0&&supplyAvailable<recommendedQty){decision='PARTIAL';const packs=Math.floor(supplyAvailable/packSize);actionQty=round3(packs>0?packs*packSize:supplyAvailable);reason=`Besoin supérieur au stock entrepôt disponible : transfert partiel recommandé.`}
 else if(recommendedQty>0){decision='REPLENISH';actionQty=recommendedQty;reason='Le magasin est sous la couverture cible et l’entrepôt peut couvrir le besoin.'}
 const remainingSupply=round3(Math.max(0,supplyAvailable-actionQty));
 return{
  decision,
  recommendedQty:recommendedQty??null,
  actionQty,
  reason,
  inputs:{storeAvailable:round3(storeAvailable),supplyAvailable:round3(supplyAvailable),confirmedInbound:round3(confirmedInbound),dailySales7:input.dailySales7??null,dailySales28:input.dailySales28??null,leadTimeDays,safetyDays,promoFactor,dayOfWeekFactor:dayFactor,packSize,minOrderQty},
  metrics:{dailyVelocity:velocity,adjustedDailyVelocity:adjustedVelocity,coverDays,targetDays,targetDemand,rawNeed,remainingSupply},
  explanation:[
   velocity===null?'Ventes moyennes indisponibles':`Ventes pondérées ≈ ${velocity}/jour`,
   adjustedVelocity===null?null:`Prévision ajustée ≈ ${adjustedVelocity}/jour`,
   coverDays===null?'Couverture inconnue':`Couverture magasin ≈ ${coverDays} jour(s)`,
   `Objectif de couverture ${targetDays} jour(s)`,
   confirmedInbound?`${round3(confirmedInbound)} déjà en arrivée`:null,
   `Entrepôt disponible ${round3(supplyAvailable)}`
  ].filter(Boolean)
 }
}

export function decisionPresentation(result={}){
 const map={
  OK:{tone:'ok',title:'Stock suffisant',cta:null},
  REPLENISH:{tone:'warn',title:'Réapprovisionnement recommandé',cta:'Commander'},
  PARTIAL:{tone:'warn',title:'Stock entrepôt insuffisant',cta:'Commander le disponible'},
  WAREHOUSE_OUT:{tone:'danger',title:'Entrepôt en rupture',cta:'Signaler la rupture'},
  CHECK_STOCK:{tone:'danger',title:'Stock à contrôler',cta:'Lancer un contrôle stock'},
  NEED_SALES_DATA:{tone:'neutral',title:'Recommandation à confirmer',cta:'Commander manuellement'}
 };
 return map[result.decision]||map.NEED_SALES_DATA
}
