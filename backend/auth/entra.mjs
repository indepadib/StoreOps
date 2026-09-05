import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { config } from '../config.mjs';

const discoveryCache = new Map();
const jwksCache = new Map();

function b64urlDecode(s){
  const normalized=s.replace(/-/g,'+').replace(/_/g,'/');
  const pad='='.repeat((4-normalized.length%4)%4);
  return Buffer.from(normalized+pad,'base64');
}
function parseJwt(token){
  const parts=token.split('.');
  if(parts.length!==3) throw Object.assign(new Error('JWT invalide'),{status:401});
  return {
    header:JSON.parse(b64urlDecode(parts[0]).toString('utf8')),
    payload:JSON.parse(b64urlDecode(parts[1]).toString('utf8')),
    signingInput:Buffer.from(`${parts[0]}.${parts[1]}`),
    signature:b64urlDecode(parts[2])
  };
}
async function discovery(tenant){
  if(discoveryCache.has(tenant)) return discoveryCache.get(tenant);
  const url=`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0/.well-known/openid-configuration`;
  const r=await fetch(url,{headers:{accept:'application/json'}});
  if(!r.ok) throw new Error(`Impossible de charger la configuration Entra (${r.status})`);
  const d=await r.json(); discoveryCache.set(tenant,d); return d;
}
async function keys(jwksUri){
  const cached=jwksCache.get(jwksUri);
  if(cached && Date.now()-cached.at<60*60*1000) return cached.keys;
  const r=await fetch(jwksUri,{headers:{accept:'application/json'}});
  if(!r.ok) throw new Error(`Impossible de charger les clés Entra (${r.status})`);
  const j=await r.json(); jwksCache.set(jwksUri,{at:Date.now(),keys:j.keys||[]}); return j.keys||[];
}

export async function verifyEntraToken(token){
  const parsed=parseJwt(token);
  if(parsed.header.alg!=='RS256') throw Object.assign(new Error('Algorithme JWT non accepté'),{status:401});
  const tenant=config.entra.tenantId;
  const d=await discovery(tenant);
  const jwks=await keys(d.jwks_uri);
  const jwk=jwks.find(k=>k.kid===parsed.header.kid);
  if(!jwk) throw Object.assign(new Error('Clé de signature Entra inconnue'),{status:401});
  const publicKey=createPublicKey({key:jwk,format:'jwk'});
  const ok=verifySignature('RSA-SHA256',parsed.signingInput,publicKey,parsed.signature);
  if(!ok) throw Object.assign(new Error('Signature JWT invalide'),{status:401});

  const p=parsed.payload; const now=Math.floor(Date.now()/1000);
  if(p.exp && now>=p.exp) throw Object.assign(new Error('Session expirée'),{status:401});
  if(p.nbf && now<p.nbf) throw Object.assign(new Error('Jeton non encore valide'),{status:401});
  if(config.entra.allowedTenantId && p.tid!==config.entra.allowedTenantId) throw Object.assign(new Error('Tenant Entra non autorisé'),{status:401});
  const acceptedAudiences=new Set([config.entra.apiClientId,`api://${config.entra.apiClientId}`].filter(Boolean));
  if(acceptedAudiences.size && !acceptedAudiences.has(p.aud)) throw Object.assign(new Error('Audience JWT invalide'),{status:401});
  if(config.entra.requiredScope){const scopes=new Set(String(p.scp||'').split(/\s+/).filter(Boolean));if(!scopes.has(config.entra.requiredScope))throw Object.assign(new Error('Autorisation StoreOps manquante dans le jeton Microsoft'),{status:403,code:'ENTRA_SCOPE_REQUIRED'});}
  return p;
}
