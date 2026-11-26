// Constrained French-language interpreter. Not a generative model, no arbitrary SQL,
// no external calls. All numerical answers use authorized, complete aggregate evidence.
const safe=Number.isSafeInteger;
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,' ').replace(/[?!.,]+$/g,'').trim().replace(/\s+/g,' ');
const group=children=>({kind:'group',match:'all',children:[{kind:'group',match:'all',children}]});
const rule=(field,op,value)=>({kind:'rule',field,op,value});
export function interpretMarketingQuestion(question){
 if(typeof question!=='string'||!question.trim()||question.length>300)return {intent:'UNSUPPORTED'};
 let q=normalize(question),store=null;
 const suffix=q.match(/ (?:a|au magasin|pour le magasin) (val fleuri|trefle)$/);
 if(suffix){store=suffix[1]==='val fleuri'?'Val Fleuri':'Trèfle';q=q.slice(0,suffix.index)}
 const scoped=children=>group([...children,...(store?[rule('stores','contains',store)]:[])]);
 if(/^(?:combien de clients|nombre de clients|taille de la base|bilan clients)$/.test(q))return {intent:'KPI',metric:'customers',store};
 if(/^(?:quel est le ca net|ca net|chiffre d affaires net)$/.test(q))return {intent:'KPI',metric:'netRevenue',store};
 if(/^(?:quel est le panier moyen|panier moyen)$/.test(q))return {intent:'KPI',metric:'basket',store};
 if(/^(?:comparer les magasins|comparaison magasins)$/.test(q)&&!store)return {intent:'COMPARE'};
 if(/^(?:combien de clients sont inactifs|clients dormants|clients a reactiver)$/.test(q))return {intent:'SEGMENT',name:'Clients à réactiver',expression:scoped([rule('recencyDays','gte',60),rule('purchaseTickets','gte',2)])};
 const s=q.match(/^(?:trouver|segmenter|combien de) (?:les )?clients inactifs depuis (\d{1,3}) jours$/);
 if(s&&Number(s[1])>=1&&Number(s[1])<=90)return {intent:'SEGMENT',name:'Inactivité ≥ '+Number(s[1])+' jours',expression:scoped([rule('recencyDays','gte',Number(s[1])),rule('purchaseTickets','gte',2)])};
 if(/^(?:clients vip|trouver les clients vip|segmenter les clients vip)$/.test(q))return {intent:'SEGMENT',name:'VIP · RFM ≥ 12',expression:scoped([rule('rfmTotal','gte',12)])};
 const c=q.match(/^preparer une campagne de reactivation (?:par|sur) (email|whatsapp|sms)$/);
 if(c)return {intent:'CAMPAIGN',name:'Réactivation · '+c[1],channel:c[1],expression:scoped([rule('recencyDays','gte',60),rule('purchaseTickets','gte',2)])};
 return {intent:'UNSUPPORTED'};
}
export function summarizeMarketingEvidence({tenantId,profiles,allowedStores,store=null,coverageComplete}){
 if(typeof tenantId!=='string'||!tenantId.trim()||!Array.isArray(profiles)||profiles.length>100000||!Array.isArray(allowedStores)||!allowedStores.length||new Set(allowedStores).size!==allowedStores.length||allowedStores.some(s=>typeof s!=='string'||!s.trim())||(store!==null&&!allowedStores.includes(store)))throw Error('Invalid scope');
 if(coverageComplete!==true)return {status:'BLOCKED',activationEnabled:false};
 const seen=new Set();let customers=0,netMinor=0,purchaseTickets=0;
 const perStore=Object.fromEntries(allowedStores.map(s=>[s,{store:s,customers:0,netMinor:0,purchaseTickets:0}]));
 for(const p of profiles){
  // Single-store-attributed profile totals only. Reject multi-store rows rather than double count.
  if(p?.tenantId!==tenantId||typeof p.customerToken!=='string'||!p.customerToken.trim()||seen.has(p.customerToken)||!Array.isArray(p.stores)||p.stores.length!==1||!allowedStores.includes(p.stores[0])||!safe(p.netMinor)||!safe(p.purchaseTickets)||p.purchaseTickets<0)throw Error('Invalid profile evidence');
  seen.add(p.customerToken);
  const a=perStore[p.stores[0]];a.customers++;a.netMinor+=p.netMinor;a.purchaseTickets+=p.purchaseTickets;
  if(!safe(a.netMinor)||!safe(a.purchaseTickets))throw Error('Overflow');
  if(store===null||p.stores[0]===store){customers++;netMinor+=p.netMinor;purchaseTickets+=p.purchaseTickets;if(!safe(netMinor)||!safe(purchaseTickets))throw Error('Overflow')}
 }
 return {status:'OBSERVED',customers,netMinor,purchaseTickets,averageNetMinor:purchaseTickets?Math.round(netMinor/purchaseTickets):null,stores:Object.values(perStore).filter(s=>store===null||s.store===store),activationEnabled:false};
}
