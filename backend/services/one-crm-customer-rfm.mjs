// Provisional business thresholds, not cohort percentiles or a trained model.
export const RFM_POLICY='FRANPRIX_PILOT_RULES_V1';
const thresholds=Object.freeze({recency:[7,14,30,60],frequency:[1,3,6,12],monetary:[150,500,1000,2500]});
const money=v=>Math.round(v*100)/100;
export function scoreObservedRfm({recencyDays,tickets90,positiveTtc90}){
 if(!Number.isSafeInteger(tickets90)||tickets90<0||!Number.isFinite(positiveTtc90)||positiveTtc90<0||!(recencyDays===null||Number.isSafeInteger(recencyDays)&&recencyDays>=0)||tickets90===0&&positiveTtc90!==0||tickets90>0&&(recencyDays===null||recencyDays>=90)||tickets90===0&&recencyDays!==null&&recencyDays<90)throw Error('Invalid RFM inputs');
 const base={policy:RFM_POLICY,windowDays:90,recencyDays,tickets90,positiveTtc90:money(positiveTtc90),thresholds,activationEnabled:false};
 if(recencyDays===null)return {...base,segment:'NO_OBSERVED_PURCHASE',scores:null};
 const r=5-thresholds.recency.filter(n=>recencyDays>n).length;
 const f=1+thresholds.frequency.filter(n=>tickets90>=n).length;
 const m=1+thresholds.monetary.filter(n=>positiveTtc90>=n).length;
 const segment=tickets90===0?'NO_RECENT_PURCHASE':recencyDays<=14&&tickets90>=6&&positiveTtc90>=1000?'HIGH_VALUE_ACTIVE':recencyDays<=14&&tickets90>=3?'REGULAR_ACTIVE':recencyDays<=14&&tickets90===1?'RECENT_SINGLE_TICKET':recencyDays>30?'INACTIVE_30_PLUS':'OTHER_OBSERVED';
 return {...base,segment,scores:{r,f,m}};
}
