const SOURCE='D365/CustomersV3';
const clean=v=>String(v??'').trim();
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const safe=(v,max=160)=>typeof v==='string'&&v.trim()&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v)?v.trim():null;
const fields='CustomerAccount,dataAreaId,CustomerGroupId,PartyType,PersonFirstName,PersonLastName,OrganizationName';
const empty={firstName:null,lastName:null,organizationName:null,email:null,phone:null,partyType:null};
export async function readCustomerIdentity({accountRef,company,read}){
 const base={accountRef,source:SOURCE,scope:'LEGAL_ENTITY_RETAIL',activationEnabled:false,consentStatus:'NOT_VERIFIED'};
 const fail=reason=>({...base,status:'UNAVAILABLE',reason,...empty});
 if(!safe(accountRef)||!safe(company))return fail('IDENTITY_SCOPE_INVALID');
 const filter='dataAreaId eq '+quote(company)+' and CustomerAccount eq '+quote(accountRef)+" and CustomerGroupId eq 'Retail'";
 let result,contacts=true;
 try{
  try{result=await read('CustomersV3',{filter,select:fields+',PrimaryContactEmail,PrimaryContactPhone',top:2,extra:'cross-company=true'})}
  catch(e){if(Number(e?.details?.httpStatus)!==400)throw e;contacts=false;result=await read('CustomersV3',{filter,select:fields,top:2,extra:'cross-company=true'})}
  if(!Array.isArray(result?.value)||result.value.length!==1||result['@odata.nextLink'])return fail('IDENTITY_NOT_UNIQUE');
  const r=result.value[0];
  if(clean(r.CustomerAccount)!==accountRef||clean(r.dataAreaId)!==company||clean(r.CustomerGroupId)!=='Retail')return fail('IDENTITY_SCOPE_MISMATCH');
  const kind=clean(r.PartyType).split('.').pop().replace(/^'|'$/g,'').toLowerCase();
  if(!['person','organization'].includes(kind))return fail('IDENTITY_PARTY_TYPE_UNVERIFIED');
  const email=contacts?safe(r.PrimaryContactEmail,254):null,phone=contacts?safe(r.PrimaryContactPhone,80):null;
  return {...base,status:contacts?'READY':'PARTIAL',reason:contacts?null:'CONTACT_FIELDS_UNAVAILABLE',partyType:kind==='person'?'PERSON':'ORGANIZATION',firstName:kind==='person'?safe(r.PersonFirstName):null,lastName:kind==='person'?safe(r.PersonLastName):null,organizationName:kind==='organization'?safe(r.OrganizationName):null,email,phone};
 }catch(e){return fail(e?.code==='D365_REQUEST_TIMEOUT'?'IDENTITY_SOURCE_TIMEOUT':Number(e?.details?.httpStatus)===403?'IDENTITY_SOURCE_FORBIDDEN':'IDENTITY_SOURCE_UNAVAILABLE')}
}

/** Enrich a previously authorized master page without making directory availability depend on CustomersV3. */
export async function readCustomerNames({accounts,company,read}){
 const base={source:SOURCE,scope:'LEGAL_ENTITY_RETAIL',activationEnabled:false};
 if(!safe(company)||!Array.isArray(accounts)||accounts.length>50||accounts.some(a=>!safe(a)||a!==a.trim())||new Set(accounts).size!==accounts.length)return {...base,status:'UNAVAILABLE',rows:[]};
 const results=new Map(),groups=[];
 for(let i=0;i<accounts.length;i+=10)groups.push(accounts.slice(i,i+10));
 async function batch(ids){
  const filter='dataAreaId eq '+quote(company)+" and CustomerGroupId eq 'Retail' and ("+ids.map(a=>'CustomerAccount eq '+quote(a)).join(' or ')+')';
  try{
   const p=await read('CustomersV3',{filter,select:fields,top:ids.length+1,extra:'cross-company=true'});
   if(!Array.isArray(p?.value)||p.value.length>ids.length||p['@odata.nextLink'])throw Error('Incomplete identity page');
   const seen=new Set(),mapped=[];
   for(const r of p.value){
    const a=clean(r.CustomerAccount);
    if(!ids.includes(a)||clean(r.dataAreaId)!==company||clean(r.CustomerGroupId)!=='Retail'||seen.has(a))throw Error('Invalid identity scope');seen.add(a);
    const kind=clean(r.PartyType).split('.').pop().replace(/^'|'$/g,'').toLowerCase();
    const name=kind==='person'?[safe(r.PersonFirstName),safe(r.PersonLastName)].filter(Boolean).join(' ')||null:kind==='organization'?safe(r.OrganizationName):null;
    mapped.push({accountRef:a,displayName:name,partyType:kind==='person'?'PERSON':kind==='organization'?'ORGANIZATION':null,status:name?'READY':'NOT_VERIFIED'});
   }
   for(const r of mapped)results.set(r.accountRef,r);
   for(const a of ids)if(!results.has(a))results.set(a,{accountRef:a,displayName:null,partyType:null,status:'NOT_FOUND'});
  }catch(e){for(const a of ids)results.set(a,{accountRef:a,displayName:null,partyType:null,status:e?.code==='D365_REQUEST_TIMEOUT'?'TIMEOUT':'UNAVAILABLE'})}
 }
 // At most three concurrent source calls, no unbounded fan-out.
 for(let i=0;i<groups.length;i+=3)await Promise.all(groups.slice(i,i+3).map(batch));
 const rows=accounts.map(a=>results.get(a));return {...base,status:rows.every(r=>r.status==='READY')?'READY':'PARTIAL',rows};
}

/** Separate directory search. Query is sent in an authenticated POST body to avoid URLs containing contact data. */
export async function searchCustomerIdentity({company,query,by,page=1,read}){
 const base={source:SOURCE,scope:'LEGAL_ENTITY_RETAIL',activationEnabled:false,by,page,pageSize:50};
 const fail=reason=>({...base,status:'UNAVAILABLE',reason,rows:[],hasMore:false});
 if(!safe(company)||!safe(query,100)||!['name','phone'].includes(by)||!Number.isSafeInteger(page)||page<1||page>1000)return fail('IDENTITY_SEARCH_INVALID');
 const q=query.trim(),tokens=q.split(/\s+/);
 if(by==='name'&&(q.length<3||tokens.length>5)||by==='phone'&&(!/^[+0-9 ()-]+$/.test(q)||q.replace(/\D/g,'').length<5))return fail('IDENTITY_SEARCH_INVALID');
 const keys=by==='name'?['PersonFirstName','PersonLastName','OrganizationName']:['PrimaryContactPhone'];
 const contains=(key,t)=>'contains('+key+','+quote(t)+')';
 // Use separate words for multi-part names; phone lookup uses the stored formatting.
 const terms=by==='name'?tokens:[q];
 const filter='dataAreaId eq '+quote(company)+" and CustomerGroupId eq 'Retail' and "+terms.map(t=>'('+keys.map(k=>contains(k,t)).join(' or ')+')').join(' and ');
 try{
  const raw=await read('CustomersV3',{filter,select:fields+(by==='phone'?',PrimaryContactPhone':''),top:51,extra:'cross-company=true&$orderby=CustomerAccount%20asc&$skip='+((page-1)*50)});
  if(!Array.isArray(raw?.value)||raw.value.length>51||raw['@odata.nextLink']&&raw.value.length<50)return fail('IDENTITY_SEARCH_INCOMPLETE');
  const rows=[],seen=new Set();
  for(const r of raw.value){
   const accountRef=safe(r.CustomerAccount),kind=clean(r.PartyType).split('.').pop().replace(/^'|'$/g,'').toLowerCase();
   if(!accountRef||clean(r.dataAreaId)!==company||clean(r.CustomerGroupId)!=='Retail'||seen.has(accountRef))return fail('IDENTITY_SEARCH_SCOPE_MISMATCH');seen.add(accountRef);
   const displayName=kind==='person'?[safe(r.PersonFirstName),safe(r.PersonLastName)].filter(Boolean).join(' ')||null:kind==='organization'?safe(r.OrganizationName):null;
   if(by==='name'&&(!displayName||!terms.every(t=>displayName.toLowerCase().includes(t.toLowerCase())))||by==='phone'&&!clean(r.PrimaryContactPhone).includes(q))return fail('IDENTITY_SEARCH_SCOPE_MISMATCH');
   rows.push({accountRef,displayName,partyType:kind==='person'?'PERSON':kind==='organization'?'ORGANIZATION':null});
  }
  return {...base,status:'READY',rows:rows.slice(0,50),hasMore:rows.length>50||!!raw['@odata.nextLink']};
 }catch(e){return fail(e?.code==='D365_REQUEST_TIMEOUT'?'IDENTITY_SEARCH_TIMEOUT':'IDENTITY_SEARCH_SOURCE_UNAVAILABLE')}
}
