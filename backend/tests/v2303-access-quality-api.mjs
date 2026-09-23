const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';

async function call(method,path,user='u-ops',payload,{doubleEncode=false}={}){
 const init={method,headers:{'content-type':'application/json','x-demo-user':user}};
 if(payload!==undefined)init.body=doubleEncode?JSON.stringify(JSON.stringify(payload)):JSON.stringify(payload);
 const r=await fetch(BASE+path,init);let data={};try{data=await r.json()}catch{}
 return{r,data}
}
function ok(v,m){if(!v)throw new Error(m)}

let x=await call('GET','/api/admin/access/config','u-ops');
ok(x.r.status===200,'access config must load for network director');
ok((x.data.profiles||[]).some(p=>p.code==='QUALITY_AUDIT'),'QUALITY_AUDIT profile missing');

x=await call('POST','/api/admin/access/accounts','u-ops',{
 name:'Amine Chibani API V2303',email:'amine.v2303.api@example.invalid',
 profileCode:'QUALITY_AUDIT',identityProvider:'ENTRA',note:'API hardening'
});
ok(x.r.status===201,'quality account creation failed: '+JSON.stringify(x.data));
const qualityId=x.data.id;
ok(x.data.scope==='NETWORK'&&x.data.profileCode==='QUALITY_AUDIT','quality account must be network-scoped');

x=await call('PUT',`/api/admin/access/accounts/${qualityId}`,'u-ops',{
 name:'Amine Chibani API V2303',email:'amine.v2303.api@example.invalid',
 profileCode:'QUALITY_AUDIT',identityProvider:'ENTRA',note:'modifié sans JSON invalide'
});
ok(x.r.status===200&&x.data.profileCode==='QUALITY_AUDIT','normal JSON account update failed');

x=await call('PUT','/api/admin/access/accounts/u-tr','u-ops',{
 name:'Responsable Trèfle',email:'',profileCode:'STORE_MANAGER',storeId:'trefle',
 linkedEmployeeId:null,identityProvider:'ENTRA',identitySubject:null,note:'legacy double JSON regression'
},{doubleEncode:true});
ok(x.r.status===200&&x.data.storeId==='trefle','legacy double-encoded account update must remain supported');

x=await call('GET','/api/stores',qualityId);
ok(x.r.status===200,'quality account cannot list stores');
const storeIds=(x.data||[]).map(s=>s.id);
ok(storeIds.includes('val-fleuri')&&storeIds.includes('trefle'),'quality account must see both pilots');

for(const storeId of ['val-fleuri','trefle']){
 const expiry='2026-10-15';
 x=await call('POST',`/api/stores/${storeId}/dlc`,qualityId,{
   reference:'3017620422003',expiryDate:expiry,quantity:1,zone:'Rayon',
   lotRef:`LOT-${storeId}`,comment:'Contrôle qualité réseau',expiryType:'DDM',unit:'pièce'
 });
 ok(x.r.status===201,`quality account cannot create DLC in ${storeId}: ${JSON.stringify(x.data)}`);

 x=await call('POST',`/api/stores/${storeId}/quality`,qualityId,{
   reference:'3017620422003',context:'Contrôle réseau',deliveredQty:1,acceptedQty:1,rejectedQty:0,
   packagingStatus:'OK',appearanceStatus:'NA',expiryDate:expiry,lotRef:`Q-${storeId}`,comment:'Qualité réseau V2303'
 });
 ok(x.r.status===201,`quality account cannot create quality control in ${storeId}: ${JSON.stringify(x.data)}`);

 x=await call('GET',`/api/stores/${storeId}/receipts/po`,qualityId);
 ok(x.r.status===200,`quality account cannot read PO in ${storeId}`);
 x=await call('GET',`/api/stores/${storeId}/receipts/to`,qualityId);
 ok(x.r.status===200,`quality account cannot read TO in ${storeId}`);
}

console.log('V2.30.3 access + Quality network API contract: OK');
