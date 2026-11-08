import {buildBusinessStory} from './business-story-model.js';
const $=id=>document.getElementById(id);
const money=new Intl.NumberFormat('fr-MA',{minimumFractionDigits:0,maximumFractionDigits:2});
const percent=new Intl.NumberFormat('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:2});
const value=(n,unit)=>n==null||!Number.isFinite(Number(n))?'N/D':
 unit==='money'?money.format(n)+' DH':unit==='percent'?percent.format(n)+' %':percent.format(n);
const signed=(n,unit='percent')=>n==null?'Non comparable':(n>0?'+':'')+percent.format(n)+(unit==='points'?' pts':' %');
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
function storyHeader(model){
 const head=el('div','business-story-heading'),left=el('div','business-story-title');
 left.append(el('span','business-eyebrow','LA LECTURE BUSINESS'),el('h3',null,'Comprendre le mois en 30 secondes'));
 left.append(el('p',null,model.period.startDate+' → '+model.period.endDate+' · comparaison '+model.comparison.startDate+' → '+model.comparison.endDate));
 const badge=el('span','business-proof '+(model.ready?'is-ready':'is-warning'),model.ready?'Sources rapprochées':'Qualité à contrôler');
 badge.title='Magasins avec ventes prêtes : '+model.quality.coverage;
 head.append(left,badge);return head
}
function metricCard(metric){
 const card=el('article','business-metric'),upper=el('div','business-metric-head');
 upper.append(el('span',null,metric.label));
 const explain=el('button','business-define','?');explain.type='button';explain.title='Comprendre : '+metric.label;explain.setAttribute('aria-label','Définition : '+metric.label);explain.dataset.semanticKpi=metric.id;
 upper.append(explain);card.append(upper);
 card.append(el('strong','business-metric-value',value(metric.value,metric.unit)));
 const bottom=el('div','business-metric-compare'),prev=el('span',null,'Avant : '+value(metric.previous,metric.unit));
 const change=el('span','business-trend '+(metric.change>0?'positive':metric.change<0?'negative':'neutral'),signed(metric.change,metric.changeUnit));
 bottom.append(prev,change);card.append(bottom);
 card.append(el('small','business-source',metric.source));return card
}
function actionCard(a,i){
 const card=el('article','business-action'),mark=el('span','business-action-index','0'+(i+1)),top=el('div','business-action-top');
 top.append(mark,el('strong',null,a.title));card.append(top);
 card.append(el('p',null,a.detail),el('small',null,a.evidence));
 const button=el('button','business-ask','Analyser avec le compagnon →');button.type='button';button.dataset.assistantQuestion=a.question;
 card.append(button);return card
}
function render(){
 const host=$('businessStory');if(!host)return;
 const core=window.RETAIL_INTELLIGENCE,decision=window.RETAIL_DECISION_INTELLIGENCE?.getData?.(),s=core?.getState?.();
 if(!decision||!s||s.section!=='sales'){host.hidden=true;return}
 // The decision object is already scoped to the selected period; never
 // mix it with a newer date/store selection during an in-flight request.
 if(decision.period?.startDate!==s.periodStart||decision.period?.endDate!==s.periodEnd||
  decision.comparison?.startDate!==s.compareStart||decision.comparison?.endDate!==s.compareEnd){host.hidden=true;return}
 const model=buildBusinessStory(decision);if(!model){host.hidden=true;return}
 host.replaceChildren(storyHeader(model));
 const metrics=el('div','business-metrics-grid');
 for(const metric of model.metrics)metrics.append(metricCard(metric));
 host.append(metrics);
 const middle=el('div','business-story-columns');
 const movement=el('section','business-story-panel');
 movement.append(el('h4',null,'Ce qui fait bouger le CA'));
 if(model.bridge){
  const total=el('p','business-bridge-total','Écart de CA : '+value(model.bridge.delta,'money'));
  const bits=el('div','business-bridge');
  for(const [title,n] of [['Effet tickets',model.bridge.trafficEffect],['Effet panier',model.bridge.basketEffect]]){
   const item=el('div','business-bridge-item');item.append(el('span',null,title),el('strong',null,(n>0?'+':'')+value(n,'money')));bits.append(item)
  }
  movement.append(total,bits);
 }else movement.append(el('p','business-story-muted','La décomposition tickets / panier nécessite deux périodes complètes et rapprochées.'));
 const explanation=el('small',null,'Décomposition arithmétique, non causale · même périmètre des ventes.');movement.append(explanation);
 const priorities=el('section','business-story-panel');
 priorities.append(el('h4',null,'Les 3 vérifications prioritaires'));
 const actions=el('div','business-action-grid');for(const [i,a] of model.actions.entries())actions.append(actionCard(a,i));
 priorities.append(actions);middle.append(movement,priorities);host.append(middle);
 const note=el('div','business-data-notes');
 note.append(el('strong',null,'Qualité & interprétation'));
 for(const warning of model.warnings)note.append(el('p',null,warning));
 for(const issue of model.quality.issues.slice(0,2))note.append(el('p',null,'Source : '+issue));
 if(!model.warnings.length&&!model.quality.issues.length)note.append(el('p',null,'Lectures calculées à partir des mêmes sources et dates que le tableau Ventes.'));
 host.append(note);host.hidden=false
}
document.addEventListener('retail-intelligence:decision',render);
document.addEventListener('retail-intelligence:section',render);
document.addEventListener('retail-intelligence:data',()=>{if(!window.RETAIL_DECISION_INTELLIGENCE?.getData?.())return;render()});
render();
