const TZ='Africa/Casablanca';

export function businessDayToday(timeZone=TZ,now=new Date()){
 try{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=t=>parts.find(p=>p.type===t)?.value;
  const y=get('year'),m=get('month'),d=get('day');
  if(y&&m&&d)return `${y}-${m}-${d}`;
 }catch{}
 return now.toISOString().slice(0,10)
}

let installed=false,lastDay=businessDayToday();
export function installBusinessDayRollover(){
 if(installed)return;installed=true;
 const check=()=>{
  const day=businessDayToday();
  if(day===lastDay)return;
  lastDay=day;
  try{
   Object.keys(sessionStorage).filter(k=>k.startsWith('storeops:commercial-sync:')).forEach(k=>sessionStorage.removeItem(k));
  }catch{}
  window.dispatchEvent(new CustomEvent('storeops:business-day-changed',{detail:{businessDate:day}}));
  location.reload()
 };
 window.addEventListener('focus',check);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
 setInterval(check,60000)
}
