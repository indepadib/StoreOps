export const app={user:null,users:[],stores:[],storeId:null,page:'today',authMode:'demo',version:'1.7',showcase:false};
export function currentStore(){return app.stores.find(s=>s.id===app.storeId)||null}
export function canManage(){return app.user && ['store_manager','ops_director'].includes(app.user.role)}
export function isDirector(){return app.user?.role==='ops_director'}
