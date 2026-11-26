const known=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const divide=(a,b)=>known(a)!=null&&known(b)!=null&&b!==0?a/b:null;
// Compute after the whole period is merged, never average chunk averages.
export function salesComparatives(data,scope,{currentReady=false,comparisonReady=false}={}){
 const cur=data?.summary?.current||{},prev=data?.summary?.previous||{};
 const row=(label,value,previous,unit='number',extra={})=>({label,value:currentReady?known(value):null,previous:comparisonReady?known(previous):null,unit,...extra});
 const identified=(s)=>divide(s.identifiedSales,s.identifiedTickets);
 const anonymous=(s)=>known(s.sales)!=null&&known(s.identifiedSales)!=null&&known(s.tickets)!=null&&known(s.identifiedTickets)!=null&&s.tickets>s.identifiedTickets?(s.sales-s.identifiedSales)/(s.tickets-s.identifiedTickets):null;
 return[
  row('CA non identifié',known(cur.sales)!=null&&known(cur.identifiedSales)!=null?cur.sales-cur.identifiedSales:null,known(prev.sales)!=null&&known(prev.identifiedSales)!=null?prev.sales-prev.identifiedSales:null,'money',{note:'Tickets sans identification client'}),
  row('Tickets identifiés · nombre',cur.identifiedTickets,prev.identifiedTickets,'number'),
  row('Tickets identifiés',divide(cur.identifiedTickets,cur.tickets)==null?null:100*cur.identifiedTickets/cur.tickets,divide(prev.identifiedTickets,prev.tickets)==null?null:100*prev.identifiedTickets/prev.tickets,'percent',{changeMode:'points'}),
  row('Poids du CA identifié',divide(cur.identifiedSales,cur.sales)==null?null:100*cur.identifiedSales/cur.sales,divide(prev.identifiedSales,prev.sales)==null?null:100*prev.identifiedSales/prev.sales,'percent',{changeMode:'points'}),
  row('Panier identifié',identified(cur),identified(prev),'money'),
  row('Panier non identifié',anonymous(cur),anonymous(prev),'money'),
  row('Remises enregistrées',cur.discountAmount,prev.discountAmount,'money',{note:'Montants observés · ne mesure pas l’uplift promotionnel'}),
  row('Poids du CA sous remise périodique',divide(cur.promotionSales,cur.sales)==null?null:100*cur.promotionSales/cur.sales,divide(prev.promotionSales,prev.sales)==null?null:100*prev.promotionSales/prev.sales,'percent',{changeMode:'points',note:'Lignes à remise périodique observée · pas CA incrémental'}),
  row('Tickets avec remise périodique',divide(cur.promotionTickets,cur.tickets)==null?null:100*cur.promotionTickets/cur.tickets,divide(prev.promotionTickets,prev.tickets)==null?null:100*prev.promotionTickets/prev.tickets,'percent',{changeMode:'points',note:'Au moins une ligne avec remise périodique'})
 ];
}
