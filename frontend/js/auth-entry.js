import { health } from './api.js';
import { ensureAccessToken,renderLoginScreen,hideLoginScreen,addLogoutControl,startAuthKeepAlive } from './auth.js';

async function start(){
  let h;
  try{h=await health()}catch(e){
    // Keep the existing app error handling for non-auth/API deployment failures.
    await import('./app.js');return;
  }
  if(h.authMode!=='entra'){
    await import('./app.js');return;
  }
  try{
    const token=await ensureAccessToken();
    if(!token){renderLoginScreen();return}
    hideLoginScreen();
    startAuthKeepAlive();
    await import('./app.js');
    addLogoutControl();
  }catch(e){
    console.error(e);
    renderLoginScreen({message:e.message});
  }
}
start();
