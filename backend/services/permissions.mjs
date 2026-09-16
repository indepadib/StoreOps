import { hasCapability } from './access-capabilities.mjs';

export function isQualityAudit(user){return !!user&&user.permissions_profile==='quality_audit'}
export function isPlatformAdmin(user){return !!user&&(user.permissions_profile==='platform_admin'||user.id==='u-admin')}
export function isDevelopment(user){return !!user&&user.permissions_profile==='development'}
export function canAccessDevelopment(user){return !!user&&hasCapability(user,'development.view')}
export function canAccessStore(user, storeId){
  if(!user) return false;
  if(user.role==='ops_director'||isQualityAudit(user)) return true;
  return user.store_id===storeId;
}
export function canManageStore(user, storeId){return !!user && (user.role==='ops_director' || (user.role==='store_manager' && user.store_id===storeId))}
export function canViewQuality(user,storeId){return canAccessStore(user,storeId)&&hasCapability(user,'quality.view')}
export function canManageQuality(user,storeId){return canAccessStore(user,storeId)&&hasCapability(user,'quality.manage')}
export function canViewDlc(user,storeId){return canAccessStore(user,storeId)&&hasCapability(user,'dlc.view')}
export function canManageDlc(user,storeId){return canAccessStore(user,storeId)&&hasCapability(user,'dlc.manage')}
export function canViewReceiving(user,storeId){return canAccessStore(user,storeId)&&hasCapability(user,'receiving.view')}
export function canControlReceivingQuality(user,storeId){return canAccessStore(user,storeId)&&hasCapability(user,'receiving.quality')}
export function canViewIncidents(user,storeId){return canAccessStore(user,storeId)&&hasCapability(user,'incidents.view')}
export function canRespondIncidents(user,storeId){return canAccessStore(user,storeId)&&hasCapability(user,'incidents.respond')}
export function canViewNetwork(user){return !!user&&hasCapability(user,'network.view')}
export function canAccessAdminStudio(user){return !!user&&hasCapability(user,'admin.studio')}
export function canViewSystem(user){return !!user&&hasCapability(user,'system.view')}
export function canGovernQuality(user){return !!user&&(hasCapability(user,'quality.manage')||user.role==='ops_director')}
