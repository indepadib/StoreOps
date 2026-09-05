const K={access:'storeops_access_token',refresh:'storeops_refresh_token',expires:'storeops_access_expires',verifier:'storeops_pkce_verifier',state:'storeops_auth_state',local:'storeops_local_authorization'};
const enc=new TextEncoder();
const cfg=()=>window.STOREOPS_CONFIG?.entra||{};
const apiBase=()=>String(window.STOREOPS_CONFIG?.apiBase||'').replace(/\/$/,'');
const redirectUri=()=>`${location.origin}/`;
const bytes=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return a};
const b64url=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=()=>b64url(bytes(32));
const challenge=async v=>b64url(await crypto.subtle.digest('SHA-256',enc.encode(v)));
const authBase=tenant=>`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;
function clearCallbackUrl(){history.replaceState({},document.title,location.pathname+location.hash)}
export function authConfigured(){const c=cfg();return !!(c.tenantId&&c.spaClientId&&c.apiScope)}
export function clearAuth(){for(const k of Object.values(K))sessionStorage.removeItem(k)}
function saveTokens(j){if(!j?.access_token)throw new Error('Microsoft Entra n’a pas renvoyé de jeton d’accès.');sessionStorage.setItem(K.access,j.access_token);sessionStorage.setItem(K.expires,String(Date.now()+Number(j.expires_in||3600)*1000));if(j.refresh_token)sessionStorage.setItem(K.refresh,j.refresh_token)}
async function tokenRequest(params){const c=cfg(),r=await fetch(`${authBase(c.tenantId)}/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error_description||j.error||`Connexion Microsoft refusée (${r.status}).`);saveTokens(j);return j}
export async function startLogin(){const c=cfg();if(!authConfigured())throw new Error('Connexion Microsoft non configurée pour ce déploiement.');const verifier=random(),state=random();sessionStorage.setItem(K.verifier,verifier);sessionStorage.setItem(K.state,state);const q=new URLSearchParams({client_id:c.spaClientId,response_type:'code',redirect_uri:redirectUri(),response_mode:'query',scope:`openid profile email offline_access ${c.apiScope}`,state,code_challenge:await challenge(verifier),code_challenge_method:'S256',prompt:'select_account'});location.assign(`${authBase(c.tenantId)}/authorize?${q}`)}
async function exchangeCallback(){const q=new URLSearchParams(location.search),code=q.get('code'),err=q.get('error');if(err){const msg=q.get('error_description')||err;clearCallbackUrl();throw new Error(msg)}if(!code)return false;const state=q.get('state'),expected=sessionStorage.getItem(K.state),verifier=sessionStorage.getItem(K.verifier);if(!state||!expected||state!==expected||!verifier){clearAuth();clearCallbackUrl();throw new Error('Retour de connexion Microsoft invalide. Recommence la connexion.')}const c=cfg();await tokenRequest({client_id:c.spaClientId,grant_type:'authorization_code',code,redirect_uri:redirectUri(),code_verifier:verifier,scope:`openid profile email offline_access ${c.apiScope}`});sessionStorage.removeItem(K.verifier);sessionStorage.removeItem(K.state);clearCallbackUrl();return true}
async function refresh(){const c=cfg(),rt=sessionStorage.getItem(K.refresh);if(!rt||!authConfigured())return false;try{await tokenRequest({client_id:c.spaClientId,grant_type:'refresh_token',refresh_token:rt,scope:`openid profile email offline_access ${c.apiScope}`});return true}catch{clearAuth();return false}}
export async function ensureAccessToken(){await exchangeCallback();const token=sessionStorage.getItem(K.access),exp=Number(sessionStorage.getItem(K.expires)||0);if(token&&exp>Date.now()+90_000)return token;if(await refresh())return sessionStorage.getItem(K.access);return null}
export function currentAccessToken(){return sessionStorage.getItem(K.access)||null}
export function startAuthKeepAlive(){let busy=false;const renew=async()=>{if(busy||document.hidden)return;const exp=Number(sessionStorage.getItem(K.expires)||0);if(!sessionStorage.getItem(K.access)||exp>Date.now()+5*60_000)return;busy=true;try{const token=await ensureAccessToken();if(!token)renderLoginScreen({message:'Votre session a expiré. Reconnectez-vous pour continuer.',mode:'entra'})}finally{busy=false}};const timer=setInterval(renew,4*60_000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)renew()});window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});return timer}

function basicAuthorization(email,password){
  const raw=`${String(email||'').trim().toLowerCase()}:${String(password||'')}`,bytes=enc.encode(raw);
  let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  return`Basic ${btoa(binary)}`;
}
export function currentLocalAuthorization(){return sessionStorage.getItem(K.local)||null}
async function localSession(auth){
  const r=await fetch(`${apiBase()}/api/session`,{headers:{authorization:auth},cache:'no-store'}),j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||'Email ou mot de passe incorrect.');
  return j;
}
export async function startLocalLogin(email,password){
  if(!String(email||'').trim()||!String(password||''))throw new Error('Renseigne ton email et ton mot de passe.');
  const auth=basicAuthorization(email,password),session=await localSession(auth);sessionStorage.setItem(K.local,auth);return session;
}
export async function ensureLocalSession(){const auth=currentLocalAuthorization();if(!auth)return null;try{return await localSession(auth)}catch{sessionStorage.removeItem(K.local);return null}}

export function renderLoginScreen({message='',mode='entra'}={}){
  let host=document.querySelector('#storeopsAuthGate');if(!host){host=document.createElement('div');host.id='storeopsAuthGate';host.className='auth-gate';document.body.appendChild(host)}
  const local=mode==='local',configured=authConfigured();
  host.innerHTML=`<div class="auth-card"><div class="auth-brand"><div class="brand-mark">f</div><div><strong>franprix <span>StoreOps</span></strong><small>${local?'Val Fleuri · accès pilote':'Application opérationnelle magasin'}</small></div></div><div class="auth-copy"><span class="manager-eyebrow">${local?'Bienvenue':'Accès professionnel'}</span><h1>${local?'Votre magasin. Simplement.':'Votre journée magasin, sur votre téléphone.'}</h1><p>${local?'Connectez-vous et StoreOps vous indiquera directement la prochaine chose à faire.':'Connectez-vous avec votre compte professionnel. StoreOps vous guidera ensuite étape par étape.'}</p></div>${message?`<div class="banner ban-danger auth-error">${escapeHtml(message)}</div>`:''}${local?`<form id="storeopsLocalLogin" class="auth-local-form"><label>Email professionnel<input id="storeopsLoginEmail" type="email" inputmode="email" autocomplete="username" placeholder="prenom.nom@oneretail.ma" required></label><label>Mot de passe<input id="storeopsLoginPassword" type="password" autocomplete="current-password" placeholder="Votre mot de passe" required></label><button class="btn brand auth-login" id="storeopsLoginBtn" type="submit">Continuer</button></form><div class="auth-note">Accès réservé aux personnes autorisées. Le mot de passe n’est jamais enregistré en clair sur le serveur.</div>`:configured?'<button class="btn brand auth-login" id="storeopsLoginBtn">Se connecter avec Microsoft</button>':'<div class="banner ban-info"><strong>Configuration IT à finaliser</strong><div class="small">Le pilote est prêt. Il reste à renseigner les identifiants publics de l’application Microsoft Entra dans le déploiement.</div></div>'}${!local?'<div class="auth-note">Aucun mot de passe Microsoft n’est saisi ni stocké par StoreOps.</div>':''}</div>`;
  document.querySelector('.app-shell')?.setAttribute('hidden','');host.hidden=false;
  if(local){
    document.querySelector('#storeopsLocalLogin')?.addEventListener('submit',async e=>{e.preventDefault();const b=document.querySelector('#storeopsLoginBtn'),email=document.querySelector('#storeopsLoginEmail')?.value||'',password=document.querySelector('#storeopsLoginPassword')?.value||'';b.disabled=true;b.textContent='Connexion…';try{await startLocalLogin(email,password);location.reload()}catch(err){b.disabled=false;b.textContent='Continuer';renderLoginScreen({message:err.message,mode:'local'});setTimeout(()=>document.querySelector('#storeopsLoginEmail')?.focus(),0)}});
    setTimeout(()=>document.querySelector('#storeopsLoginEmail')?.focus(),0);
  }else document.querySelector('#storeopsLoginBtn')?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Ouverture de Microsoft…';try{await startLogin()}catch(err){b.disabled=false;b.textContent='Se connecter avec Microsoft';renderLoginScreen({message:err.message,mode:'entra'})}})
}
export function hideLoginScreen(){document.querySelector('#storeopsAuthGate')?.setAttribute('hidden','');document.querySelector('.app-shell')?.removeAttribute('hidden')}
export function addLogoutControl(){const host=document.querySelector('.top-controls');if(!host||document.querySelector('#logoutBtn'))return;const b=document.createElement('button');b.id='logoutBtn';b.className='btn ghost';b.textContent='Déconnexion';b.onclick=()=>logout();host.appendChild(b)}
export function logout(){const c=cfg(),local=!!currentLocalAuthorization();clearAuth();if(local)return location.reload();if(c.tenantId&&c.spaClientId){const q=new URLSearchParams({post_logout_redirect_uri:redirectUri()});location.assign(`${authBase(c.tenantId)}/logout?${q}`)}else location.reload()}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
