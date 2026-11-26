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
