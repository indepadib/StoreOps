const numeric=value=>value==null||value===''?NaN:Number(value);
const precision=value=>Math.round(value*1000)/1000;

export function calculateMinMax(input){
 const usage=numeric(input.usage),lead=numeric(input.leadDays),safety=numeric(input.safetyDays),review=numeric(input.reviewDays);
 const available=numeric(input.available),inbound=numeric(input.inbound),pack=numeric(input.pack),minimum=numeric(input.minimumOrder??0);
 if(!['PO','TO'].includes(input.mode)||![usage,lead,safety,review,available,inbound,minimum].every(n=>Number.isFinite(n)&&n>=0)||!Number.isFinite(pack)||pack<=0){
  throw new Error('Renseigne la consommation, les délais, le stock, les arrivages et le colisage dans la même unité.');
 }
 const min=input.min==null||input.min===''?precision(usage*(lead+safety)):numeric(input.min);
 const max=input.max==null||input.max===''?precision(min+usage*review):numeric(input.max);
 if(!Number.isFinite(min)||!Number.isFinite(max)||min<0||max<min)throw new Error('Le maximum doit être supérieur ou égal au minimum.');
 const position=precision(available+inbound);
 const need=position<=min?precision(Math.max(0,max-position)):0;
 const requested=need>0?precision(Math.ceil(Math.max(need,minimum)/pack-1e-9)*pack):0;
 const supply=numeric(input.sourceAvailable);
 if(input.mode==='TO'&&(!Number.isFinite(supply)||supply<0))throw new Error('Renseigne le stock disponible dans l’entrepôt source.');
 const shippable=input.mode==='TO'?precision(Math.floor(supply/pack+1e-9)*pack):requested;
 const capped=Math.min(requested,shippable);
 const quantity=capped>=minimum?capped:0;
 return {min,max,position,need,requested,quantity,shortfall:precision(Math.max(0,need-quantity)),after:precision(position+quantity),aboveMax:precision(Math.max(0,position+quantity-max))};
}

export function mountMinMax(host,number){
 const form=host.querySelector('form'),output=host.querySelector('output');
 const mode=form.elements.namedItem('mode'),supply=form.elements.namedItem('sourceAvailable');
 function update(){
  const transfer=mode.value==='TO';
  supply.disabled=!transfer;supply.required=transfer;
  host.querySelector('[data-warehouse-source]').hidden=!transfer;
  host.querySelector('[data-destination]').textContent=transfer?'Stock disponible au magasin':'Stock disponible à l’entrepôt';
  host.querySelector('[data-usage]').textContent=transfer?'Consommation moyenne du magasin par jour':'Sorties moyennes de l’entrepôt par jour';
  host.querySelector('[data-lead]').textContent=transfer?'Délai du transfert en jours':'Délai fournisseur en jours';
  output.textContent='';
 }
 form.addEventListener('input',update);
 form.addEventListener('submit',event=>{
  event.preventDefault();
  try{
   const input=Object.fromEntries(new FormData(form)),r=calculateMinMax(input);
   const action=input.mode==='PO'?'PO fournisseur → entrepôt':'TO entrepôt → magasin';
   const recommendation=r.quantity>0?`${action} : ${number(r.quantity)} ${input.unit.trim()}.`:r.need>0?'Besoin à couvrir. Stock source ou colisage insuffisant.':'Stock suffisant selon les seuils saisis.';
   const exception=r.shortfall>0?` Reste à couvrir : ${number(r.shortfall)}.`:r.aboveMax>0&&r.quantity>0?` Dépassement du maximum lié au minimum de commande ou au colisage : ${number(r.aboveMax)}.`:'';
   output.textContent=`${recommendation} Min ${number(r.min)} · Max ${number(r.max)} · Stock avec arrivages ${number(r.position)} · Stock après proposition ${number(r.after)}.${exception}`;
  }catch(error){output.textContent=error.message;}
 });
 update();
}
