import {api,health} from '/js/api.js';
import {ensureAccessToken,ensureLocalSession,startAuthKeepAlive,startLocalLogin,startLogin} from '/js/auth.js';
import {app,isDirector} from '/js/state.js';
import {renderBuyingGroup} from '/js/pages/buying-group.js';

const $=selector=>document.querySelector(selector);
const returnPath='/centrale-achat';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function gate(title,description,{canLogin=false}={}){
  const root=$('#buyingGate'),local=app.authMode==='local',entra=app.authMode==='entra';
  root.hidden=false;
  $('#buyingGroupContent').hidden=true;
  const action=canLogin&&local
    ?'<form id="buyingLocalLogin" class="buying-local-form"><label>Email professionnel<input id="buyingEmail" type="email" autocomplete="username" required></label><label>Mot de passe<input id="buyingPassword" type="password" autocomplete="current-password" required></label><button id="buyingLoginSubmit" type="submit">Se connecter à la Centrale</button></form>'
    :canLogin&&entra
      ?'<button type="button" id="buyingMicrosoftLogin" class="buying-login-btn">Se connecter avec Microsoft</button>'
      :'<a href="/">Retour à StoreOps ↗</a>';
  root.innerHTML='<section class="buying-shell-gate"><span aria-hidden="true" style="font-size:32px">◈</span><h1>'+escapeHtml(title)+'</h1><p>'+escapeHtml(description)+'</p>'+action+'</section>';
  $('#buyingSession').textContent='Accès sécurisé';
  if(!canLogin)return;
  sessionStorage.setItem('storeops_return_path',returnPath);
  root.querySelector('#buyingLocalLogin')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=root.querySelector('#buyingLoginSubmit');
    const email=root.querySelector('#buyingEmail')?.value||'',password=root.querySelector('#buyingPassword')?.value||'';
    button.disabled=true;button.textContent='Connexion…';
    try{
      await startLocalLogin(email,password);
      sessionStorage.removeItem('storeops_return_path');
      await start();
    }catch(error){
      gate('Connexion refusée',error?.message||'Identifiants invalides. Vérifiez votre compte professionnel.',{canLogin:true});
    }
  });
  root.querySelector('#buyingMicrosoftLogin')?.addEventListener('click',async()=>{
    const button=root.querySelector('#buyingMicrosoftLogin');
    button.disabled=true;button.textContent='Redirection vers Microsoft…';
    try{await startLogin()}
    catch(error){gate('Connexion Microsoft impossible',error?.message||'Impossible de démarrer la connexion.',{canLogin:true})}
  });
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
  let session=null;
  if(app.authMode==='local'){
    session=await ensureLocalSession();
    if(!session){
      gate('Connexion requise','Connectez-vous directement ici avec votre compte StoreOps Direction ou Administrateur.',{canLogin:true});
      return;
    }
  }else if(app.authMode==='entra'){
    let token=await ensureAccessToken();
    if(!token){
      gate('Connexion Microsoft requise','Connectez-vous avec votre compte professionnel pour accéder à la centrale d’achat.',{canLogin:true});
      return;
    }
    try{session=await api('/api/session',{noRetry:true})}
    catch(error){
      if(error?.status===401){
        // A local expiry timestamp does not guarantee that D365/StoreOps accepts the token.
        // Refresh it once, then revalidate the user with the backend.
        sessionStorage.removeItem('storeops_access_token');
        token=await ensureAccessToken();
        if(token)session=await api('/api/session',{noRetry:true}).catch(()=>null);
      }
    }
    if(!session){
      gate('Reconnexion nécessaire','Votre session Microsoft n’est plus validée par StoreOps. Reconnectez-vous pour continuer.',{canLogin:true});
      return;
    }
    startAuthKeepAlive();
  }else{
    gate('Mode d’authentification inconnu','Le mode de connexion StoreOps ne permet pas encore l’accès à cette application.');
    return;
  }
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
