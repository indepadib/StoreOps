import { canAccessDevelopment } from './permissions.mjs';
import { developmentConfig,listDevelopmentProjects,developmentProject,createDevelopmentProject,updateDevelopmentProject,setDevelopmentStage,setDevelopmentMilestone,developmentUsers } from './development.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
function requireDevelopment(user){if(!canAccessDevelopment(user))throw Object.assign(new Error('Vue réservée à l’équipe Développement.'),{status:403,code:'DEVELOPMENT_ACCESS_REQUIRED'})}

export async function handleDevelopmentApi({req,url,user}){
 const path=url.pathname;if(!path.startsWith('/api/development'))return null;requireDevelopment(user);
 if(path==='/api/development/config'&&req.method==='GET')return{status:200,data:{...developmentConfig(),users:developmentUsers()}};
 if(path==='/api/development/projects'){
  if(req.method==='GET')return{status:200,data:{items:listDevelopmentProjects({includeClosed:url.searchParams.get('all')!=='0'})}};
  if(req.method==='POST'){const b=await body(req);return{status:201,data:createDevelopmentProject({user,input:b})}}
 }
 let p=route(path,'/api/development/projects/:projectId');
 if(p){if(req.method==='GET'){const item=developmentProject(p.projectId);return item?{status:200,data:item}:{status:404,data:{error:'Projet développement introuvable.'}}}if(req.method==='PUT'||req.method==='PATCH'){const b=await body(req);return{status:200,data:updateDevelopmentProject({user,id:p.projectId,input:b})}}}
 p=route(path,'/api/development/projects/:projectId/stage');if(p&&req.method==='POST'){const b=await body(req);return{status:200,data:setDevelopmentStage({user,id:p.projectId,stage:b.stage,note:b.note||'',force:b.force===true})}}
 p=route(path,'/api/development/projects/:projectId/milestones/:code');if(p&&req.method==='POST'){const b=await body(req);return{status:200,data:setDevelopmentMilestone({user,id:p.projectId,code:p.code,status:b.status||'DONE',dueDate:b.dueDate,note:b.note||''})}}
 return null
}
