import {editablePresentationParts} from './executive-presentation.js';
import {zip} from './xlsx-workbook.js';
const number=v=>v==null||!Number.isFinite(Number(v))?'N/D':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(v);
const money=v=>v==null||!Number.isFinite(Number(v))?'N/D':new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)+' DH';
const percent=v=>v==null||!Number.isFinite(Number(v))?'N/D':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(v)+' %';
const ratio=(a,b)=>a!=null&&b>0?a/b:null;
export const loyaltyPresentationScopeKey=scope=>[scope.start,scope.end,...scope.stores.map(s=>s.id).sort()].join('|');
export function loyaltyPresentationModel({scope,decision,loyalty,wallet=[]}){
 if(!scope.start||!scope.end||!scope.stores.length)throw Error('Sélectionnez une période et un magasin.');
 const ids=scope.stores.map(s=>s.id).sort().join('|'),actual=(decision?.stores||[]).map(s=>s.storeId).sort().join('|');
 if(decision?.period?.startDate!==scope.start||decision?.period?.endDate!==scope.end||ids!==actual)throw Error('Attendez le chargement des ventes de la période sélectionnée.');
 const complete=decision.coverage?.currentStoresReady===scope.stores.length;
 const blocked=(decision.quality?.issues||[]).some(x=>['CUSTOMER_CARDINALITY','IDENTIFIED_SALES_GT_TOTAL','IDENTIFIED_SALES_RECONCILIATION','CUSTOMER_FIELD_COVERAGE'].includes(x.code));
 const crm=complete&&!blocked?decision.crm||{}:{},current=complete&&!blocked?decision.summary?.current||{}:{};
 const burnRows=scope.stores.map(s=>wallet.find(w=>w.store?.id===s.id)),burnReady=burnRows.every(w=>w?.ok&&w.data?.status==='READY'&&w.data.burn!=null);
 const burn=burnReady?burnRows.reduce((sum,w)=>sum+Number(w.data.burn),0):null;
 const earn=loyalty?.earnStatus==='READY'?loyalty.earn:null;
 const days=Math.round((Date.parse(scope.end)-Date.parse(scope.start))/86400000)+1;
 const memberBasket=ratio(current.identifiedSales,current.identifiedTickets),nonMemberBasket=ratio(current.sales!=null&&current.identifiedSales!=null?current.sales-current.identifiedSales:null,current.tickets!=null&&current.identifiedTickets!=null?current.tickets-current.identifiedTickets:null);
 const accounts=['READY','PARTIAL'].includes(loyalty?.accountCreationStatus)?loyalty.accountCreations:null;
 const quality=[!complete?'Couverture ventes incomplète':null,blocked?'Contrôles CRM non validés':null,accounts==null?'Créations de comptes indisponibles':null,earn==null?'Earn indisponible':null,burn==null?'Burn indisponible':null].filter(Boolean);
 const e=loyalty?.accountCreationEvidence;
 if(e?.scope==='NETWORK'&&e.unattributed>0)quality.push(number(e.unattributed)+' comptes sans affectation magasin');
 if(loyalty?.accountCreationStatus==='PARTIAL')quality.push('Créations attribuées uniquement, affectation magasin incomplète');
 return{period:`Du ${scope.start} au ${scope.end}`,scope:scope.stores.map(s=>s.name||s.code||s.id).join(', '),
  kpis:[['CA identifié',money(current.identifiedSales),'Achats des clients identifiés'],['Part du CA identifié',percent(current.identifiedSalesShare),'Sur le CA total'],['Clients actifs identifiés',number(crm.identifiedCustomers),'Distincts sur la période'],['Comptes créés',number(accounts),'Date réelle de création du compte'],['Panier identifié',money(memberBasket),'CA identifié / tickets identifiés'],['Clients avec ≥ 2 tickets',percent(crm.repeatRate),'Fréquence observée sur la période']],
  daily:money(ratio(current.identifiedSales,days)),identifiedTickets:number(current.identifiedTickets),ticketRate:percent(current.identifiedTicketRate),
  earn:money(earn),burn:money(burn),burnEarn:percent(ratio(burn,earn)==null?null:burn/earn*100),
  visits:crm.averageVisitsPerCustomer==null?'N/D':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(crm.averageVisitsPerCustomer),
  frequent:number(crm.frequentCustomers),nonMemberBasket:money(nonMemberBasket),
  segments:(crm.segments||[]).slice().sort((a,b)=>b.count-a.count).slice(0,4).map(s=>({label:({SINGLE_VISIT:'Une visite',REPEAT:'Deux ou trois tickets',FREQUENT:'Fréquents',HIGH_VALUE:'Forte valeur',HIGH_VALUE_FREQUENT:'Forte valeur et fréquents'})[s.segment]||'Autre segment',count:number(s.count),share:percent(s.sharePct)})),
  stores:scope.stores.map(s=>{const l=loyalty?.stores?.find(x=>x.storeId===s.id),w=wallet.find(x=>x.store?.id===s.id);return [s.name||s.code||s.id,number(l?.accountCreations),money(l?.earnStatus==='READY'?l.earn:null),money(w?.ok&&w.data?.status==='READY'?w.data.burn:null)];}),
  quality:quality.length?quality.join('. ')+'.':'Périmètre complet pour les indicateurs présentés.',
  actions:[accounts==null||e?.unattributed>0||loyalty?.accountCreationStatus==='PARTIAL'?'Fiabiliser l’affectation des comptes aux magasins avant de comparer le recrutement.':'Comparer les créations de comptes par magasin sur une période de même durée.',crm.repeatRate!=null?'Suivre les clients à une seule visite et mesurer leur retour après une action ciblée.':'Consolider les visites identifiées pour mesurer le retour des clients.',earn!=null&&burn!=null?'Suivre les crédits et les dépenses Wallet dans le temps avant d’ajuster le programme.':'Compléter les sources Wallet avant de piloter le programme.']};
}
const panel=(x,y,w,h,lines,fill='FFFFFF')=>({x,y,w,h,lines,fill});
const header=(title,m)=>panel(0,0,13.333,1.15,[[title,27,true,'FFFFFF'],[m.period+' — '+m.scope,12,false,'E1EAFB']],'152946');
const footer=m=>panel(.35,6.77,12.63,.45,[[m.quality,10,false,'51627C']],'EDF3FC');
export function loyaltyPresentationParts(m){
 const first=[header('Fidélité & CRM · Synthèse d’activité',m)];
 m.kpis.forEach(([label,value,note],i)=>first.push(panel(.35+i%3*4.25,1.4+Math.floor(i/3)*1.65,4.08,1.45,[[label,14,true],[value,25,true,'D10B58'],[note,11]])));
 first.push(panel(.35,4.95,12.63,1.5,[['Le rythme de la période',18,true],[`${m.daily} de CA identifié par jour calendaire`,17],[`${m.identifiedTickets} tickets identifiés, soit ${m.ticketRate} des tickets`,15]]),footer(m));
 const second=[header('Wallet et contribution des magasins',m),panel(.35,1.4,4.08,1.4,[['Cashback crédité · Earn net',14,true],[m.earn,25,true,'D10B58'],['Journal des gains monétaires D365',11]]),panel(4.6,1.4,4.08,1.4,[['Wallet consommé · Burn',14,true],[m.burn,25,true,'D10B58'],['Paiements Wallet sur la période',11]]),panel(8.85,1.4,4.13,1.4,[['Burn / Earn de la période',14,true],[m.burnEarn,25,true],['Ce ratio ne suit pas une même cohorte',11]])];
 const visible=m.stores.slice(0,7);
 second.push({x:.35,y:3.15,w:12.63,h:.37*(visible.length+1),rows:[['Magasin','Comptes attribués','Earn net','Burn'],...visible]});
 second.push(panel(.35,6.22,12.63,.45,[[m.stores.length>7?'7 magasins affichés sur '+m.stores.length+'. Total réseau dans les indicateurs.':'Affectation des comptes par le magasin de la première carte. Les comptes non attribués restent dans le total réseau.',10]]),footer(m));
 const third=[header('Comportements clients et points à suivre',m),panel(.35,1.4,4.08,1.25,[['Visites par client identifié',14,true],[m.visits,25,true,'D10B58']]),panel(4.6,1.4,4.08,1.25,[['Clients fréquents',14,true],[m.frequent,25,true,'D10B58'],['Au moins quatre tickets sur la période',11]]),panel(8.85,1.4,4.13,1.25,[['Panier non identifié',14,true],[m.nonMemberBasket,25,true],['Comparaison descriptive, sans causalité',11]]),panel(.35,2.95,5.35,3.5,[['Profils de visite',19,true],...(m.segments.length?m.segments.map(s=>[`${s.label} : ${s.count} (${s.share})`,14]):[['Segmentation indisponible',14]]),['Fréquence de la période, pas rétention historique.',11]]),panel(5.9,2.95,7.08,3.5,[['Trois points à suivre',19,true],...m.actions.map((t,i)=>[`${i+1}. ${t}`,14])]),footer(m)];
 return editablePresentationParts([first,second,third]);
}
export function loyaltyPresentation(model){return zip(loyaltyPresentationParts(model),'application/vnd.openxmlformats-officedocument.presentationml.presentation');}
