const num=v=>v===''||v==null?null:Number(v);
export function validateQualityDraft(draft,profile={}){
 const issues=[];
 const delivered=num(draft.deliveredQty),accepted=num(draft.acceptedQty),rejected=num(draft.rejectedQty);
 if(!Number.isFinite(delivered)||delivered<=0)issues.push('Quantité contrôlée obligatoire et supérieure à 0.');
 if(!Number.isFinite(accepted)||accepted<0||!Number.isFinite(rejected)||rejected<0)issues.push('Quantités acceptée/refusée invalides.');
 if(Number.isFinite(delivered)&&Number.isFinite(accepted)&&Number.isFinite(rejected)&&Math.abs(accepted+rejected-delivered)>0.0001)issues.push('Accepté + refusé doit être égal à la quantité contrôlée.');
 if(profile?.temperature_required){const t=num(draft.temperature);if(!Number.isFinite(t))issues.push('Température obligatoire pour cette famille.');}
 if(profile?.packaging_required&&(!draft.packagingStatus||draft.packagingStatus==='NA'))issues.push('Conditionnement obligatoire.');
 if(profile?.appearance_required&&(!draft.appearanceStatus||draft.appearanceStatus==='NA'))issues.push('Aspect / fraîcheur obligatoire.');
 if(profile?.expiry_required&&!draft.expiryDate)issues.push('DLC/DDM obligatoire.');
 if(profile?.lot_required&&!String(draft.lotRef||'').trim())issues.push('Lot obligatoire.');
 if(!String(draft.context||'').trim())issues.push('Contexte du contrôle obligatoire.');
 return issues;
}
export function temperatureAssessment(value,profile={}){
 if(value===''||value==null)return null;
 const t=Number(value);if(!Number.isFinite(t))return null;
 if(!profile?.temperature_required||profile.temp_min==null||profile.temp_max==null)return{ok:true,value:t};
 return{ok:t>=Number(profile.temp_min)&&t<=Number(profile.temp_max),value:t,min:Number(profile.temp_min),max:Number(profile.temp_max)};
}
