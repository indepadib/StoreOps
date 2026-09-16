export const app={user:null,users:[],stores:[],storeId:null,page:'today',authMode:'demo',version:'1.10',showcase:false,developmentAccess:false,accessProfile:null,capabilities:{}};
export function currentStore(){return app.stores.find(s=>s.id===app.storeId)||null}
export function hasCapability(code){return !!app.capabilities?.[code]}
export function isQualityAudit(){return app.accessProfile==='QUALITY_AUDIT'||app.user?.id==='u-quality-audit'||app.user?.permissions_profile==='quality_audit'}
export function canManage(){return !!app.user&&(['store_manager','ops_director'].includes(app.user.role)||hasCapability('quality.manage')||hasCapability('dlc.manage')||hasCapability('incidents.respond'))}
export function canManageQuality(){return !!app.user&&(['store_manager','ops_director'].includes(app.user.role)||hasCapability('quality.manage'))}
export function canGovernQuality(){return app.user?.role==='ops_director'||hasCapability('quality.manage')}
export function isDirector(){return app.user?.role==='ops_director'}
