const KEY='storeops_showcase_price_checks_v1';
const now=()=>new Date().toISOString().replace('Z','');
const today=()=>new Date().toISOString().slice(0,10);
const uid=p=>`${p}_${Math.random().toString(36).slice(2,10)}`;
const clone=v=>JSON.parse(JSON.stringify(v));

const PRODUCTS={
  '5449000206770':{
    ean:'5449000206770',productNumber:'HS-004873',name:'Ciel Pet 5L',category:'FPXMPX - Dépannage',unit:'PC',stock:31,availableStock:31,
    basePrice:12.75,expectedUnitPrice:12.75,
    promoLabel:'Buy 2 get the last one 50 % · 2 article(s) pour 18.50 DH',
    promotion:{offerId:'5001-00001',name:'Buy 2 get the last one 50 %',periodicDiscountType:'MixAndMatch',status:'ACTIVE',enabled:true,processingStatus:'Processed',validFrom:'1900-01-01T12:00:00Z',validTo:'2027-07-31T12:00:00Z',currencyCode:'MAD',concurrencyMode:'Exclusive',pricingPriorityNumber:0,priceGroups:['Franprix'],priceGroupEligible:true,itemLine:{lineNum:1,itemId:'HS-004873',name:'Ciel Pet 5L',unit:'PC',lineType:'Include',mixAndMatchLineGroup:'A'},mechanic:{type:'MIX_AND_MATCH',mechanic:'DEAL_PRICE',requiredQuantity:2,discountedLineCount:null,discountPercent:null,dealPrice:18.5},activeForRequestedContext:true,rawLineCount:1}
  },
  '6111040001111':{ean:'6111040001111',productNumber:'LAIT1L',name:'Lait frais entier 1L',category:'Frais',unit:'PC',stock:24,availableStock:24,basePrice:12.90,expectedUnitPrice:12.90,promoLabel:null,promotion:null},
  '3274080005003':{ean:'3274080005003',productNumber:'YAOURT4',name:'Yaourt nature 4x110g',category:'Frais',unit:'PC',stock:36,availableStock:36,basePrice:18.50,expectedUnitPrice:18.50,promoLabel:null,promotion:null},
  '3017620422003':{ean:'3017620422003',productNumber:'NUT750',name:'Nutella 750g',category:'Épicerie',unit:'PC',stock:17,availableStock:17,basePrice:64.90,expectedUnitPrice:59.90,promoLabel:'Promo lancement · 59,90 DH',promotion:null}
};

function load(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}
function save(rows){localStorage.setItem(KEY,JSON.stringify(rows))}
function err(message,status=400,details=null){const e=new Error(message);e.status=status;e.details=details;return e}
function body(options){try{return options?.body?JSON.parse(options.body):{}}catch{throw err('JSON invalide.',400)}}
function money(v){return `${Number(v).toFixed(2)} DH`}

async function openIncidentFor(mockApi,storeId,ean){
  const data=await mockApi(`/api/stores/${storeId}/incidents?status=OPEN`);
  return (data.items||[]).find(i=>i.source_type==='PRICE_CHECK'&&String(i.description||'').includes(`EAN ${ean}`))||null;
}
function contextFor(product,storeId,businessDate,openIncident){
  const promo=product.promotion?[clone(product.promotion)]:[];
  return{
    storeId,businessDate,ean:product.ean,
    product:{ean:product.ean,productNumber:product.productNumber,name:product.name,category:product.category,unit:product.unit,stock:product.stock,availableStock:product.availableStock},
    basePrice:{price:product.basePrice,unit:product.unit,priceQuantity:1,priceDate:'2026-07-05T12:00:00Z',source:'Showcase'},
    expectedUnitPrice:product.expectedUnitPrice,
    promotions:{rowCount:promo.length,activeCount:promo.length,items:promo,coverage:{directItem:true,category:false}},
    conditionalPromotions:promo.filter(x=>x.mechanic?.type==='MIX_AND_MATCH'),
    promoLabel:product.promoLabel,
    pricingNote:promo.some(x=>x.mechanic?.type==='MIX_AND_MATCH')?'Le prix unitaire n’est pas artificiellement recalculé pour les offres Mix & Match. La mécanique du lot reste séparée.':null,
    openIncident:openIncident?{id:openIncident.id,title:openIncident.title,criticality:openIncident.criticality,requiresEvidence:!!openIncident.requires_evidence}:null,
    source:'SHOWCASE'
  };
}

export async function mockPriceCheckApi(path,options={},mockApi){
  const clean=path.split('?')[0],method=String(options.method||'GET').toUpperCase();
  let m=clean.match(/^\/api\/stores\/([^/]+)\/price-check\/context\/([^/]+)$/);
  if(m&&method==='GET'){
    const storeId=m[1],ean=decodeURIComponent(m[2]),product=PRODUCTS[ean];
    if(!product)throw err('Article introuvable dans le Showcase.',404);
    const q=new URL(path,'https://showcase.local').searchParams,businessDate=q.get('date')||today(),openIncident=await openIncidentFor(mockApi,storeId,ean);
    return contextFor(product,storeId,businessDate,openIncident);
  }
  m=clean.match(/^\/api\/stores\/([^/]+)\/price-checks$/);
  if(m&&method==='GET'){
    const storeId=m[1],q=new URL(path,'https://showcase.local').searchParams,businessDate=q.get('date')||today(),limit=Math.max(1,Math.min(200,Number(q.get('limit'))||50));
    return{items:clone(load().filter(x=>x.store_id===storeId&&x.business_date===businessDate).sort((a,b)=>String(b.checked_at).localeCompare(String(a.checked_at))).slice(0,limit))};
  }
  m=clean.match(/^\/api\/stores\/([^/]+)\/price-check$/);
  if(m&&method==='POST'){
    const storeId=m[1],b=body(options),ean=String(b.ean||'').trim(),product=PRODUCTS[ean];
    if(!product)throw err('Article introuvable dans le Showcase.',404);
    const businessDate=b.businessDate||today(),expected=Number(product.expectedUnitPrice),observed=Number(b.observedPrice),tol=Number.isFinite(Number(b.tolerance))?Number(b.tolerance):0.01,issues=[];
    if(!Number.isFinite(observed)||Math.abs(observed-expected)>tol)issues.push(`Prix rayon ${Number.isFinite(observed)?money(observed):'non renseigné'} ≠ prix attendu ${money(expected)}.`);
    if(product.promoLabel&&b.signageOk!==true)issues.push('Signalétique promotionnelle non conforme.');
    if(b.executionOk!==true)issues.push('Exécution rayon non confirmée.');
    const check={id:uid('pc'),store_id:storeId,business_date:businessDate,ean,product_number:product.productNumber,product_name:product.name,expected_price:expected,observed_price:Number.isFinite(observed)?observed:null,promo_label:product.promoLabel,signage_ok:b.signageOk===true?1:0,execution_ok:b.executionOk===true?1:0,status:issues.length?'MISMATCH':'CONFORM',issues_json:issues.length?JSON.stringify(issues):null,checked_by:localStorage.getItem('storeops_user')||'u-vf',checked_at:now(),checked_by_name:'Showcase',issues};
    const rows=load();rows.unshift(check);save(rows.slice(0,200));
    let incident=await openIncidentFor(mockApi,storeId,ean);
    if(issues.length){
      if(!incident){
        incident=await mockApi(`/api/stores/${storeId}/incidents`,{method:'POST',body:JSON.stringify({title:`Écart prix/promo · ${product.name}`,description:`EAN ${ean} · ${issues.join(' · ')}`,category:'PRICE_PROMO',criticality:'HIGH',blockingLevel:'NONE',sourceType:'PRICE_CHECK',sourceId:check.id,requiresEvidence:true})});
        await mockApi(`/api/incidents/${incident.id}/actions`,{method:'POST',body:JSON.stringify({title:'Corriger prix / signalétique puis effectuer un nouveau scan de contrôle',note:`EAN ${ean} · prix attendu ${money(expected)}`})});
      }
      const e=err('Contrôle prix/promo non conforme.',409,issues);e.incident=incident;throw e;
    }
    let incidentResolved=null;
    if(incident){
      const evidenceProvided=!!(b.evidenceFileName||b.evidenceDataUrl);
      if(!evidenceProvided)throw err('Une photo de preuve est obligatoire pour clôturer cet incident.',409);
      // Showcase: persist metadata only. Never write the image base64 into localStorage.
      await mockApi(`/api/incidents/${incident.id}/evidence`,{method:'POST',body:JSON.stringify({fileName:b.evidenceFileName||'preuve-correction.jpg',caption:b.evidenceCaption||'Preuve après correction prix/promo',showcase:true})});
      const current=await mockApi(`/api/incidents/${incident.id}`);
      for(const action of current.actions||[])if(action.status==='OPEN')await mockApi(`/api/incidents/${incident.id}/actions/${action.id}/complete`,{method:'POST',body:JSON.stringify({note:`Recontrôle conforme ${money(observed)} · EAN ${ean}`})});
      incidentResolved=await mockApi(`/api/incidents/${incident.id}/resolve`,{method:'POST',body:JSON.stringify({resolutionNote:`Correction validée par nouveau scan conforme · EAN ${ean} · prix ${money(observed)} · signalétique et exécution conformes.`})});
    }
    return{check:{id:check.id,status:'CONFORM',issues:[],expectedPrice:expected,observedPrice:observed},context:contextFor(product,storeId,businessDate,null),incidentResolved};
  }
  throw err(`Route Showcase Price Check non implémentée : ${clean}`,404);
}
