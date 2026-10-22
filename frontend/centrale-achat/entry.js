import {api,health} from '/js/api.js?v=2404';
import {ensureAccessToken,ensureLocalSession,startAuthKeepAlive} from '/js/auth.js?v=2404';
import {app,isDirector} from '/js/state.js?v=2404';
import {renderBuyingGroup} from '/js/pages/buying-group.js?v=2';

const $=selector=>document.querySelector(selector);
const returnPath='/centrale-achat';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function gate(title,description,{canLogin=false}={}){
  $('#buyingGate').hidden=false;
  $('#buyingGroupContent').hidden=true;
  $('#buyingGate').innerHTML='<section class="buying-shell-gate"><span aria-hidden="true" style="font-size:32px">◈</span><h1>'+escapeHtml(title)+'</h1><p>'+escapeHtml(description)+'</p><a href="/"> '+(canLogin?'Se connecter à StoreOps':'Revenir à StoreOps')+' ↗</a></section>';
  if(canLogin)sessionStorage.setItem('storeops_return_path',returnPath);
}
async function start(){
  let h;
  try{h=await health()}catch(error){gate('Connexion indisponible',error?.message||'Le backend StoreOps ne répond pas.');return}
  app.authMode=h.authMode||'demo';
  app.showcase=!!h.showcase||app.authMode==='demo';
  if(app.showcase||app.authMode==='demo'){
    gate('Connexion professionnelle requise','La centrale d’achat n’est pas accessible en mode démonstration. Utilisez une session StoreOps authentifiée.');
    return;
  }
  if(app.authMode==='local'){
    const local=await ensureLocalSession();
    if(!local){gate('Connexion requise','Connectez-vous sur StoreOps avec un compte Direction ou Administrateur. Vous reviendrez automatiquement sur la centrale d’achat.',{canLogin:true});return}
  }else if(app.authMode==='entra'){
    const token=await ensureAccessToken();
    if(!token){gate('Connexion Microsoft requise','Connectez-vous avec votre compte professionnel depuis StoreOps. La même session sera réutilisée ici.',{canLogin:true});return}
    startAuthKeepAlive();
  }else{
    gate('Mode d’authentification inconnu','Le mode de connexion de StoreOps ne permet pas encore l’accès à cette application.');
    return;
  }
  let session;
  try{session=await api('/api/session',{noRetry:true})}
  catch(error){gate('Session expirée','Nous ne parvenons pas à vérifier votre profil. Reconnectez-vous à StoreOps.',{canLogin:true});return}
  app.user=session?.user||null;
  if(!isDirector()){
    $('#buyingSession').textContent='Accès restreint';
    gate('Accès réservé','Seuls les profils Direction ou Administrateur peuvent accéder à la centrale d’achat.');
    return;
  }
  $('#buyingSession').textContent=(app.user?.name||'Direction')+' · Accès Direction';
  let stores;
  try{stores=await api('/api/stores',{noRetry:true})}
  catch(error){stores=[]}
  app.stores=Array.isArray(stores)?stores:[];
  const saved=sessionStorage.getItem('storeops_buying_store');
  app.storeId=app.stores.some(s=>s.id===saved)?saved:(app.stores[0]?.id||null);
  const header=$('.buying-shell-head');
  if(app.stores.length){
    const control=document.createElement('div');control.className='buying-store';
    const label=document.createElement('label');label.htmlFor='buyingStore';label.textContent='Magasin D365';
    const select=document.createElement('select');select.id='buyingStore';
    for(const store of app.stores){
      const option=document.createElement('option');option.value=store.id;option.textContent=store.name||store.id;
      option.selected=store.id===app.storeId;select.appendChild(option)
    }
    select.addEventListener('change',()=>{
      app.storeId=select.value;sessionStorage.setItem('storeops_buying_store',app.storeId);renderBuyingGroup()
    });
    control.append(label,select);header.append(control);
  }
  $('#buyingGate').hidden=true;
  $('#buyingGroupContent').hidden=false;
  renderBuyingGroup();
}
start().catch(error=>{
  console.error('H&S Buying Group start error',error);
  gate('La centrale ne peut pas démarrer','Une erreur empêche l’ouverture du module. Réessayez depuis StoreOps.');
});
