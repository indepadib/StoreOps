// Selection and bulk reads share the same limit and in-flight request per store.
export class NetworkSalesQueue{
 constructor(read,{limit=3,isActive=()=>true}={}){this.read=read;this.limit=limit;this.isActive=isActive;this.pending=[];this.jobs=new Map();this.running=0;this.disposed=false}
 get(id,{force=false}={}){
  if(this.disposed||!this.isActive())return Promise.resolve(null);
  if(this.jobs.has(id))return this.jobs.get(id).promise;
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
  const job={id,force,promise,resolve,reject,controller:new AbortController()};
  this.jobs.set(id,job);this.pending.push(job);this.drain();return promise;
 }
 drain(){
  if(this.disposed||!this.isActive()){this.dispose();return}
  while(this.running<this.limit&&this.pending.length){
   const job=this.pending.shift();this.running++;
   Promise.resolve().then(()=>{if(this.disposed||!this.isActive())return null;return this.read(job.id,{force:job.force,signal:job.controller.signal})}).then(value=>job.resolve(this.disposed||!this.isActive()?null:value),error=>this.disposed||!this.isActive()?job.resolve(null):job.reject(error)).finally(()=>{this.running--;this.jobs.delete(job.id);this.drain()});
  }
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;
  for(const job of this.jobs.values()){job.controller.abort();job.resolve(null)}
  this.pending=[];this.jobs.clear();
 }
}
