export function loyaltyWindows(start,end){
  const out=[];let cursor=start;
  while(cursor<=end){const last=new Date(cursor+'T12:00:00Z');last.setUTCDate(last.getUTCDate()+13);const stop=last.toISOString().slice(0,10)>end?end:last.toISOString().slice(0,10);out.push({start:cursor,end:stop});last.setTime(Date.parse(stop+'T12:00:00Z'));last.setUTCDate(last.getUTCDate()+1);cursor=last.toISOString().slice(0,10);}
  return out;
}
const sum=(rows,key)=>rows.length&&rows.every(r=>r?.[key]!=null&&Number.isFinite(Number(r[key])))?Math.round(rows.reduce((s,r)=>s+Number(r[key]),0)*100)/100:null;
export function mergeLoyaltyWindows(parts,ids){
  const evidence=parts[0]?.accountCreationEvidence;
  const stores=ids.map(storeId=>{
    const rows=parts.map(p=>p.stores?.find(r=>r.storeId===storeId)),earn=sum(rows,'earn'),accountCreations=sum(rows,'accountCreations'),enrollments=sum(rows,'enrollments');
    return{...rows.find(Boolean),storeId,earn,earnStatus:earn==null?'UNAVAILABLE':'READY',accountCreations,recruitments:accountCreations,accountCreationStatus:accountCreations==null?'UNAVAILABLE':rows.some(r=>r.accountCreationStatus==='PARTIAL')?'PARTIAL':'READY',enrollments,status:enrollments==null?'UNAVAILABLE':'READY'};
  });
  const accountCreations=sum(parts,'accountCreations'),earn=sum(parts,'earn'),ready=stores.filter(r=>r.status==='READY').length;
  return{status:ready===stores.length?'READY':ready?'PARTIAL':'UNAVAILABLE',accountCreations,recruitments:accountCreations,accountCreationStatus:accountCreations==null?'UNAVAILABLE':parts.some(p=>p.accountCreationStatus==='PARTIAL')?'PARTIAL':'READY',earn,earnStatus:earn==null?'UNAVAILABLE':'READY',stores,coverage:{ready,total:ids.length},accountCreationEvidence:{...evidence,unattributed:sum(parts.map(p=>p.accountCreationEvidence),'unattributed')}};
}
export async function loadLoyaltyPeriod(start,end,ids,request,onProgress=()=>{}){
  const windows=loyaltyWindows(start,end),parts=new Array(windows.length);let cursor=0,done=0;
  const worker=async()=>{while(cursor<windows.length){const index=cursor++,window=windows[index];try{parts[index]=await request(window);}catch{parts[index]={status:'UNAVAILABLE',stores:[]};}onProgress(++done,windows.length);}};
  await Promise.all([worker(),worker()]);return mergeLoyaltyWindows(parts,ids);
}
