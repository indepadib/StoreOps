import {api} from '../api.js';

// Keep the user on H&S Buying Group. Only small job-status JSON crosses the browser.
// The original PDF and provider credentials remain exclusively on the server side.
const escaping=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const completed=new Set();
const busy=new Set(['QUEUED','RUNNING']);

export function mountContractReadingProgress(host,{targetType,targetId,onComplete,expectedJobId=null}={}){
 if(!host||!targetId)return;
 host.dataset.readJobTarget=targetType+':'+targetId;
 let sawActive=Boolean(expectedJobId),attempts=0;
 const render=(s)=>{if(host.isConnected)host.innerHTML=s};
 async function refresh(){
  if(!host.isConnected||host.dataset.readJobTarget!==targetType+':'+targetId)return;
  try{
   const query=new URLSearchParams({targetType,targetId}).toString();
   const data=await api('/api/buying-group/reading-jobs/latest?'+query,{noRetry:true});
   if(!host.isConnected||host.dataset.readJobTarget!==targetType+':'+targetId)return;
   attempts=0;
   const job=data.job;
   if(!job){render('');return}
   if(busy.has(job.status)){
    sawActive=true;
    render('<div class="hsq-progress" role="status" aria-live="polite">'+
      '<span class="hsq-spinner" aria-hidden="true"></span><div><strong>'+
      (job.status==='QUEUED'?'Analyse en attente de démarrage':'Lecture approfondie en cours sur le serveur')+
      '</strong><p>Tu restes sur la Centrale d’achat. Le document est analysé côté serveur ; le résultat s’affichera ici automatiquement.</p></div></div>');
    setTimeout(refresh,4000);return;
   }
   if(job.status==='FAILED'){
    render('<div class="hsq-error" role="alert"><strong>La lecture n’a pas pu aboutir.</strong><p>'+
      escaping(job.error||'Le moteur d’analyse est momentanément indisponible.')+
      '</p><small>Le document reste enregistré. Tu peux relancer la lecture depuis ce dossier.</small></div>');
    return;
   }
   if(job.status==='DONE'){
    render('<div class="hsq-complete" role="status"><strong>Lecture terminée.</strong><p>Les clauses extraites sont disponibles dans le dossier. Vérifie les preuves avant validation.</p></div>');
    if((sawActive||job.id===expectedJobId)&&!completed.has(job.id)){
     completed.add(job.id);
     void onComplete?.(job);
    }
   }
  }catch(error){
   if(!host.isConnected)return;
   attempts++;
   render('<div class="hsq-wait">Suivi momentanément indisponible : '+escaping(error.message)+
     '. La lecture en cours n’est pas annulée.</div>');
   if(attempts<7)setTimeout(refresh,Math.min(15000,3000*attempts));
  }
 }
 void refresh();
}
