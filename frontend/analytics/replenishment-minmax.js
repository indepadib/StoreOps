const numeric=value=>value==null||value===''?NaN:Number(value);
const precision=value=>Math.round(value*1000)/1000;

export function calculateMinMax(input){
 const usage=numeric(input.usage),lead=numeric(input.leadDays),safety=numeric(input.safetyDays),review=numeric(input.reviewDays);
 const available=numeric(input.available),inbound=numeric(input.inbound),pack=numeric(input.pack),minimum=numeric(input.minimumOrder??0);
 if(!['PO','TO'].includes(input.mode)||![usage,lead,safety,review,available,inbound,minimum].every(n=>Number.isFinite(n)&&n>=0)||!Number.isFinite(pack)||pack<=0){
  throw new Error('Renseigne la consommation, les délais, le stock, les arrivages et le colisage dans la même unité.');
 }
 const min=input.min==null||input.min===''?precision(usage*(lead+safety)):numeric(input.min);
 const max=input.max==null||input.max===''?precision(min+usage*review):numeric(input.max);
 if(!Number.isFinite(min)||!Number.isFinite(max)||min<0||max<min)throw new Error('Le maximum doit être supérieur ou égal au minimum.');
 const position=precision(available+inbound);
 const need=position<=min?precision(Math.max(0,max-position)):0;
 const requested=need>0?precision(Math.ceil(Math.max(need,minimum)/pack-1e-9)*pack):0;
 const supply=numeric(input.sourceAvailable);
 if(input.mode==='TO'&&(!Number.isFinite(supply)||supply<0))throw new Error('Renseigne le stock disponible dans l’entrepôt source.');
 const shippable=input.mode==='TO'?precision(Math.floor(supply/pack+1e-9)*pack):requested;
 const capped=Math.min(requested,shippable);
 const quantity=capped>=minimum?capped:0;
 return {min,max,position,need,requested,quantity,shortfall:precision(Math.max(0,need-quantity)),after:precision(position+quantity),aboveMax:precision(Math.max(0,position+quantity-max))};
}
