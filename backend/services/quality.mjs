import { db } from '../db.mjs';

export function qualityProfileFor(category){
  return db.prepare(`SELECT * FROM quality_profiles WHERE category=? AND active=1`).get(category)
    || db.prepare(`SELECT * FROM quality_profiles WHERE category='Autre' AND active=1`).get();
}

export function evaluateQuality({product,temperature,packagingStatus,appearanceStatus,expiryDate}){
  const profile=qualityProfileFor(product.category||'Autre'); const issues=[];
  let temperatureStatus='NA';
  if(profile.temperature_required){
    if(temperature===null || temperature===undefined || temperature==='') issues.push('Température obligatoire.');
    else {
      const t=Number(temperature); temperatureStatus=(profile.temp_min!=null&&t<profile.temp_min)||(profile.temp_max!=null&&t>profile.temp_max)?'NOK':'OK';
      if(temperatureStatus==='NOK') issues.push(`Température hors tolérance (${profile.temp_min??'—'} à ${profile.temp_max??'—'} °C).`);
    }
  }
  if(profile.packaging_required && packagingStatus!=='OK') issues.push('Conditionnement non conforme.');
  if(profile.appearance_required && appearanceStatus!=='OK') issues.push('Aspect / fraîcheur non conforme.');
  if(profile.expiry_required && !expiryDate) issues.push('DLC obligatoire pour cette famille.');
  return {profile,issues,temperatureStatus};
}
