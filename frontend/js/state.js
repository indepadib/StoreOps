export const app={user:null,users:[],stores:[],storeId:null,page:'today',authMode:'demo',version:'1.10',showcase:false,developmentAccess:false};
export function currentStore(){return app.stores.find(s=>s.id===app.storeId)||null}
export function isQualityAudit(){return !!app.user&&app.user?.role!=='store_manager'&&(app.user?.id==='u-quality-audit'||(app.user?.role==='employee'&&app.user?.permissions_profile==='quality_audit'))}
export function isSupplyChain(){return app.user?.role==='employee'&&app.user?.permissions_profile==='supply_chain'}
export function isDevelopment(){return app.user?.role==='employee'&&app.user?.permissions_profile==='development'}
export function canManage(){return !!app.user&&['store_manager','ops_director'].includes(app.user.role)}
export function canManageQuality(){return !!app.user&&(['store_manager','ops_director'].includes(app.user.role)||isQualityAudit())}
export function canManageDlc(){return !!app.user&&(['store_manager','ops_director'].includes(app.user.role)||isQualityAudit())}
export function canGovernQuality(){return app.user?.role==='ops_director'||isQualityAudit()}
export function isPlatformAdmin(){return !!app.user&&(app.user?.permissions_profile==='platform_admin'||app.user?.id==='u-admin')}
export function isDirector(){return app.user?.role==='ops_director'||isPlatformAdmin()}
export function accessProfileLabel(){if(isPlatformAdmin())return'Administrateur StoreOps';if(app.user?.role==='store_manager')return'Responsable magasin';if(app.user?.role==='ops_director')return'Direction d’exploitation';if(isQualityAudit())return'Qualité & audit';if(isDevelopment())return'Développement réseau';if(isSupplyChain())return'Supply & entrepôt';return'Utilisateur magasin'}
