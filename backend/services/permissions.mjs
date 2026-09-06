export function isQualityAudit(user){return !!user&&user.permissions_profile==='quality_audit'}
export function canAccessStore(user, storeId){
  if(!user) return false;
  if(user.role==='ops_director'||isQualityAudit(user)) return true;
  return user.store_id===storeId;
}
export function canManageQuality(user, storeId){
  return !!user && (user.role==='ops_director' || isQualityAudit(user) || (user.role==='store_manager' && user.store_id===storeId));
}
export function canManageStore(user, storeId){
  return !!user && (user.role==='ops_director' || (user.role==='store_manager' && user.store_id===storeId));
}
export function canGovernQuality(user){return !!user&&(user.role==='ops_director'||isQualityAudit(user))}
