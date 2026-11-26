// Discrete-time survival demonstration: predicts a next positive purchase within 30 days.
// Right-censored rows contribute only their observed exposure, never assumed non-purchases.
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v;
const integer=Number.isSafeInteger;
const sigmoid=x=>1/(1+Math.exp(-Math.max(-35,Math.min(35,x))));
const vector=(p,d)=>{
 if(!p||!integer(p.recencyDays)||p.recencyDays<0||p.recencyDays>90||!integer(p.purchaseTickets)||p.purchaseTickets<1||p.purchaseTickets>100000||!integer(p.netMinor)||!integer(d)||d<1||d>30)throw Error('Invalid purchase features');
 return [1,p.recencyDays/90,Math.min(20,p.purchaseTickets)/20,Math.max(-1,Math.min(1,p.netMinor/500000)),(d-1)/29];
};
function curve(weights,p){let survival=1;const cumulative=[];for(let d=1;d<=30;d++){const x=vector(p,d),hazard=sigmoid(x.reduce((s,v,i)=>s+v*weights[i],0));survival*=1-hazard;cumulative.push(1-survival)}return cumulative}
function evaluate(rows,predict){
 const horizons=[7,14,30],results=[];
 for(const h of horizons){let error=0,count=0,positives=0;for(const r of rows){
  if(r.eventDay===null&&r.observedDays<h)continue;
  const y=r.eventDay!==null&&r.eventDay<=h?1:0,p=predict(r)[h-1];error+=(p-y)**2;count++;positives+=y;
 }results.push({horizon:h,samples:count,positives,brier:count?error/count:null})}
 return results;
}
export function trainPurchaseDemo({tenantId,train,test,trainingCutoff,evaluationCutoff,syntheticOnly}){
 if(!id(tenantId)||syntheticOnly!==true||!day(trainingCutoff)||!day(evaluationCutoff)||trainingCutoff>=evaluationCutoff||!Array.isArray(train)||!Array.isArray(test)||train.length<100||test.length<50||train.length>5000||test.length>5000)throw Error('Invalid dataset');
 const seen=new Set();for(const [rows,isTrain] of [[train,true],[test,false]])for(const r of rows){
 if(r?.tenantId!==tenantId||!id(r.customerToken)||seen.has(r.customerToken)||!day(r.asOf)||!day(r.observedThrough)||!integer(r.observedDays)||r.observedDays<1||r.observedDays>30||Date.parse(r.observedThrough)-Date.parse(r.asOf)!==r.observedDays*86400000||!(r.eventDay===null||integer(r.eventDay)&&r.eventDay>=1&&r.eventDay<=r.observedDays)||r.coverageComplete!==true||(isTrain?r.observedThrough>trainingCutoff:r.asOf<=trainingCutoff||r.observedThrough>evaluationCutoff))throw Error('Invalid or leaking snapshot');
 seen.add(r.customerToken);vector(r,1);
 }
 if(!train.some(r=>r.eventDay!==null)||!train.some(r=>r.eventDay===null))throw Error('Both outcomes required');
 const exposure=[],events=train.filter(r=>r.eventDay!==null).length;
 for(const r of train)for(let d=1;d<=(r.eventDay??r.observedDays);d++)exposure.push({x:vector(r,d),y:Number(r.eventDay===d)});
 const base=events/exposure.length,weights=[Math.log(base/(1-base)),0,0,0,0];
 for(let epoch=0;epoch<220;epoch++){const g=[0,0,0,0,0];for(const {x,y} of exposure){const p=sigmoid(x.reduce((s,v,i)=>s+v*weights[i],0));for(let i=0;i<5;i++)g[i]+=(p-y)*x[i]}for(let i=0;i<5;i++)weights[i]-=1.2*(g[i]/exposure.length+(i?.001*weights[i]:0))}
 const baseline=Array.from({length:30},(_,i)=>1-(1-base)**(i+1)),predict=r=>curve(weights,r);
 return {mode:'SYNTHETIC_ONLY',tenantId,method:'discrete-time-logistic-survival-v1',trainSamples:train.length,testSamples:test.length,trainingCutoff,evaluationCutoff,weights,baselineHazard:base,testMetrics:evaluate(test,predict),baselineMetrics:evaluate(test,()=>baseline),activationEnabled:false};
}
export function scorePurchaseDemo(model,profile){
 if(model?.mode!=='SYNTHETIC_ONLY'||model.tenantId!==profile?.tenantId||profile.coverageComplete!==true||!Array.isArray(model.weights)||model.weights.length!==5||model.weights.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Invalid scoring context');
 const cumulative=curve(model.weights,profile),median=cumulative.findIndex(v=>v>=.5);
 return {probability7d:cumulative[6],probability14d:cumulative[13],probability30d:cumulative[29],medianDay:median<0?null:median+1,cumulative,mode:'SYNTHETIC_ONLY',activationEnabled:false};
}
