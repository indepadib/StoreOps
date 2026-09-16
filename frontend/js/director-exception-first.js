const MOBILE='(max-width: 820px)';

function install(root=document.getElementById('todayContent')){
  if(!root||!document.body.classList.contains('director-experience'))return;
  const grid=root.querySelector('.today-metrics-grid');
  const head=root.querySelector('.today-section-head');
  if(!grid||!head)return;

  const mobile=window.matchMedia(MOBILE).matches;
  let toggle=root.querySelector('#directorMetricToggle');
  if(!toggle){
    toggle=document.createElement('button');
    toggle.id='directorMetricToggle';
    toggle.className='director-metric-toggle';
    toggle.type='button';
    head.after(toggle);
    toggle.addEventListener('click',()=>{
      const collapsed=grid.classList.toggle('director-metrics-collapsed');
      toggle.setAttribute('aria-expanded',String(!collapsed));
      syncToggle(toggle,grid);
    });
  }

  if(mobile&&!grid.dataset.directorChoice){
    grid.classList.add('director-metrics-collapsed');
    toggle.setAttribute('aria-expanded','false');
  }else if(!mobile){
    grid.classList.remove('director-metrics-collapsed');
    toggle.setAttribute('aria-expanded','true');
  }
  syncToggle(toggle,grid);
}

function syncToggle(toggle,grid){
  const count=grid.querySelectorAll('.today-metric-card').length;
  const collapsed=grid.classList.contains('director-metrics-collapsed');
  toggle.innerHTML=collapsed
    ? `<span><strong>Voir tous les indicateurs</strong><small>${count} indicateur${count>1?'s':''} détaillé${count>1?'s':''}</small></span><b>⌄</b>`
    : `<span><strong>Masquer les indicateurs détaillés</strong><small>Revenir au focus décisions</small></span><b>⌃</b>`;
}

let scheduled=false;
function schedule(){
  if(scheduled)return;scheduled=true;
  queueMicrotask(()=>{scheduled=false;install()});
}

const observer=new MutationObserver(schedule);
const target=document.getElementById('todayContent');
if(target)observer.observe(target,{childList:true,subtree:false});
window.matchMedia(MOBILE).addEventListener?.('change',schedule);
window.addEventListener('storeops:booted',schedule,{once:true});
schedule();
