// Browser pilot visibility only. The session must come from the authenticated StoreOps API.
// This is not a security boundary for actual CRM records, which remain disconnected.
export function validatePilotSession(session,mode){
 if(!['entra','local'].includes(mode)||session?.authMode!==mode||typeof session.user?.id!=='string'||!session.user.id.trim())return {status:'DENIED'};
 const u=session.user;
 if(u.role!=='ops_director'&&u.permissions_profile!=='platform_admin')return {status:'DENIED'};
 return {status:'AUTHORIZED',syntheticOnly:true,activationEnabled:false};
}
export async function checkPilotAccess({health,ensureAccessToken,ensureLocalSession,readSession,setMode}){
 try{
 const h=await health(),mode=h?.authMode;
 if(!['entra','local'].includes(mode))return {status:'UNAVAILABLE'};
 setMode(mode);
 const token=mode==='entra'?await ensureAccessToken():await ensureLocalSession();
 if(!token)return {status:'LOGIN_REQUIRED'};
 return validatePilotSession(await readSession(),mode);
 }catch(e){return {status:Number(e?.status)===401?'LOGIN_REQUIRED':Number(e?.status)===403?'DENIED':'UNAVAILABLE'}}
}
