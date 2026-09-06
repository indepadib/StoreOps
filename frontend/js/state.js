export const app={user:null,users:[],stores:[],storeId:null,page:'today',authMode:'demo',version:'1.10',showcase:false};
export function currentStore(){return app.stores.find(s=>s.id===app.storeId)||null}
export function isQualityAudit(){return app.user?.id==='u-quality-audit'||app.user?.permissions_profile==='quality_audit'}
export function canManage(){return !!app.user&&(['store_manager','ops_director'].includes(app.user.role)||(isQualityAudit()&&app.page==='quality'))}
export function canManageQuality(){return !!app.user&&(['store_manager','ops_director'].includes(app.user.role)||isQualityAudit())}
export function canGovernQuality(){return app.user?.role==='ops_director'||isQualityAudit()}
export function isDirector(){return app.user?.role==='ops_director'}
