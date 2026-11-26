// Churn = no observed purchase in next 30 days, not permanent loss.
// Logistic model trained only on synthetic labeled snapshots. No activation.
const id=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=200;
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
const sigmoid=x=>1/(1+Math.exp(-Math.max(-35,Math.min(35,x))));
const features=['recencyDays','purchaseTickets','netMinor'];
const vector=p=>{
 if(!p||!Number.isSafeInteger(p.recencyDays)||p.recencyDays<0||p.recencyDays>90||!Number.isSafeInteger(p.purchaseTickets)||p.purchaseTickets<1||p.purchaseTickets>100000||!Number.isSafeInteger(p.netMinor))throw Error('Invalid feature snapshot');
 return [1,p.recencyDays/90,Math.min(20,p.purchaseTickets)/20,Math.max(-1,Math.min(1,p.netMinor/500000))];
};
function metrics(rows,score){
 let brier=0,loss=0,positives=0,tp=0,fp=0;const ranked=[];
 for(const r of rows){const p=Math.max(1e-12,Math.min(1-1e-12,score(r))),y=r.noPurchase30d?1:0;positives+=y;brier+=(p-y)**2;loss-=y*Math.log(p)+(1-y)*Math.log(1-p);if(p>=.5){tp+=y;fp+=1-y}ranked.push({p,y})}
 ranked.sort((a,b)=>a.p-b.p);let rankSum=0;
 for(let i=0;i<ranked.length;){let j=i+1;while(j<ranked.length&&ranked[j].p===ranked[i].p)j++;const rank=(i+1+j)/2;for(let k=i;k<j;k++)rankSum+=ranked[k].y*rank;i=j}
 const negatives=rows.length-positives;
 return {samples:rows.length,positives,brier:brier/rows.length,logLoss:loss/rows.length,auc:positives&&negatives?(rankSum-positives*(positives+1)/2)/(positives*negatives):null,precision:tp+fp?tp/(tp+fp):null,recall:positives?tp/positives:null};
}
export function trainChurnDemo({tenantId,train,test,trainingCutoff,evaluationCutoff,syntheticOnly}){
 if(!id(tenantId)||syntheticOnly!==true||!day(trainingCutoff)||!day(evaluationCutoff)||trainingCutoff>=evaluationCutoff||!Array.isArray(train)||!Array.isArray(test)||train.length<100||test.length<50||train.length>20000||test.length>20000)throw Error('Invalid model dataset');
 const seen=new Set();
 const check=(r,isTrain)=>{
  if(r?.tenantId!==tenantId||!id(r.customerToken)||seen.has(r.customerToken)||!day(r.asOf)||!day(r.labelThrough)||Date.parse(r.labelThrough)-Date.parse(r.asOf)!==30*86400000||r.coverageComplete!==true||typeof r.noPurchase30d!=='boolean'||(isTrain?r.labelThrough>trainingCutoff:r.asOf<=trainingCutoff||r.labelThrough>evaluationCutoff))throw Error('Invalid or leaking snapshot');
  seen.add(r.customerToken);vector(r);
 };
 train.forEach(r=>check(r,true));test.forEach(r=>check(r,false));
 const rate=train.filter(r=>r.noPurchase30d).length/train.length;if(rate===0||rate===1||test.every(r=>r.noPurchase30d===test[0].noPurchase30d))throw Error('Both outcome classes required');
 const rows=train.map(r=>({x:vector(r),y:Number(r.noPurchase30d)})),weights=[Math.log(rate/(1-rate)),0,0,0];
 for(let epoch=0;epoch<350;epoch++){
  const grad=[0,0,0,0];for(const {x,y} of rows){const p=sigmoid(x.reduce((s,v,i)=>s+v*weights[i],0));for(let i=0;i<4;i++)grad[i]+=(p-y)*x[i]}
  for(let i=0;i<4;i++)weights[i]-=.8*(grad[i]/rows.length+(i?.005*weights[i]:0));
 }
 const score=r=>sigmoid(vector(r).reduce((s,v,i)=>s+v*weights[i],0));
 return {mode:'SYNTHETIC_ONLY',tenantId,method:'logistic-regression-l2-v1',target:'no-purchase-in-next-30-days',trainingCutoff,evaluationCutoff,features:[...features],weights,trainSamples:train.length,testMetrics:metrics(test,score),baselineMetrics:metrics(test,()=>rate),activationEnabled:false};
}
export function scoreChurnDemo(model,profile){
 if(model?.mode!=='SYNTHETIC_ONLY'||model.tenantId!==profile?.tenantId||!Array.isArray(model.weights)||model.weights.length!==4||model.weights.some(x=>typeof x!=='number'||!Number.isFinite(x))||profile.coverageComplete!==true)throw Error('Invalid score context');
 const x=vector(profile),logit=x.reduce((s,v,i)=>s+v*model.weights[i],0),probability=sigmoid(logit);
 return {probability,band:probability>=.7?'high':probability>=.4?'watch':'low',contributions:features.map((field,i)=>({field,logOddsContribution:x[i+1]*model.weights[i+1]})),mode:'SYNTHETIC_ONLY',activationEnabled:false};
}
