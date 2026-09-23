export const app={user:null,users:[],stores:[],storeId:null,page:'today',authMode:'demo',version:'1.10',showcase:false,developmentAccess:false};
export function currentStore(){return app.stores.find(s=>s.id===app.storeId)||null}
export function isQualityAudit(){return app.user?.id==='u-quality-audit'||app.user?.permissions_profile==='quality_audit'}
export function canManage(){return !!app.user&&(['store_manager','ops_director'].includes(app.user.role)||(isQualityAudit()&&['quality','dlc'].includes(app.page)))}
export function canManageQuality(){return !!app.user&&(['store_manager','ops_director'].includes(app.user.role)||isQualityAudit())}
export function canGovernQuality(){return app.user?.role==='ops_director'||isQualityAudit()}
export function isPlatformAdmin(){return !!app.user&&(app.user?.permissions_profile==='platform_admin'||app.user?.id==='u-admin')}
export function isDirector(){return app.user?.role==='ops_director'||isPlatformAdmin()}
export function accessProfileLabel(){if(isPlatformAdmin())return'Administrateur StoreOps';if(isQualityAudit())return'Qualité & audit';if(app.user?.permissions_profile==='development')return'Développement réseau';if(app.user?.role==='ops_director')return'Direction d’exploitation';if(app.user?.role==='store_manager')return'Responsable magasin';return'Utilisateur magasin'}
