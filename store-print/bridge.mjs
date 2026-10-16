#!/usr/bin/env node
import net from 'node:net';
import {writeFile,readFile} from 'node:fs/promises';

const base=String(process.env.STOREOPS_BASE_URL||'https://storeops.ma').replace(/\/$/,'');
const token=String(process.env.STOREOPS_PRINT_BRIDGE_TOKEN||'').trim();
const bridgeKey=String(process.env.STOREOPS_PRINTER_BRIDGE_KEY||'').trim();
const printerHost=String(process.env.STOREOPS_PRINTER_HOST||'').trim();
const printerPort=Math.max(1,Number(process.env.STOREOPS_PRINTER_PORT)||9100);
const pollMs=Math.max(2000,Number(process.env.STOREOPS_PRINT_POLL_MS)||5000);
const journal=process.env.STOREOPS_PRINT_JOURNAL||'./storeops-print-journal.json';

if(!token||!bridgeKey||!printerHost){console.error('Missing STOREOPS_PRINT_BRIDGE_TOKEN, STOREOPS_PRINTER_BRIDGE_KEY or STOREOPS_PRINTER_HOST');process.exit(2)}

const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function post(path,body){
 const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-storeops-print-token':token},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||('HTTP '+r.status));return data
}
async function sendRaw(payload){
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection({host:printerHost,port:printerPort});
  let settled=false;const done=(err)=>{if(settled)return;settled=true;socket.destroy();err?reject(err):resolve()};
  socket.setTimeout(15000);
  socket.once('connect',()=>socket.end(Buffer.from(payload,'utf8')));
  socket.once('timeout',()=>done(new Error('Printer TCP timeout')));
  socket.once('error',done);
  socket.once('close',hadError=>{if(!hadError)done()});
 })
}
async function readJournal(){try{return JSON.parse(await readFile(journal,'utf8'))}catch{return{}}}
async function saveJournal(value){await writeFile(journal,JSON.stringify(value,null,2))}
async function processJob(job){
 const state=await readJournal(),entry=state[job.id];
 if(entry?.sent===true){
  console.error('Job '+job.id+' was already sent locally but cloud confirmation is missing. Refusing automatic reprint.');
  return;
 }
 state[job.id]={claimedAt:new Date().toISOString(),sent:false};await saveJournal(state);
 try{
  await sendRaw(job.payload);
  state[job.id]={...state[job.id],sent:true,sentAt:new Date().toISOString()};await saveJournal(state);
  await post('/api/internal/store-print/complete',{jobId:job.id,bridgeKey,success:true});
  delete state[job.id];await saveJournal(state);
  console.log('Printed '+job.total_labels+' label(s), job '+job.id);
 }catch(error){
  const after=await readJournal();
  if(after[job.id]?.sent===true){
   console.error('Print was sent but confirmation failed for '+job.id+'. Manual verification required; no automatic resend.',error);
   return;
  }
  await post('/api/internal/store-print/complete',{jobId:job.id,bridgeKey,success:false,error:error?.message||String(error)}).catch(()=>{});
  delete after[job.id];await saveJournal(after);
  console.error('Print failed '+job.id,error);
 }
}
async function loop(){
 for(;;){
  try{const r=await post('/api/internal/store-print/claim',{bridgeKey}),job=r.job;if(job)await processJob(job)}
  catch(error){console.error(new Date().toISOString(),'bridge error',error?.message||error)}
  await wait(pollMs)
 }
}
console.log('StoreOps Print Bridge started for '+bridgeKey+' -> '+printerHost+':'+printerPort);
await loop();
