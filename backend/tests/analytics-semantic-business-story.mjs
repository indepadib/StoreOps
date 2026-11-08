import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {fileURLToPath} from 'node:url';
import {semanticMetrics,semanticPublicModel,semanticDefinitionAnswer,lookupSemanticMetrics} from '../services/analytics-semantic-model.mjs';
import {buildBusinessStory} from '../../frontend/analytics/business-story-model.js';
import {parseQuery} from '../services/analytics-query-plan.mjs';
import {renderQueryAnswer} from '../services/analytics-query-executor.mjs';

assert(semanticMetrics.length>=30,'Business semantic contract must cover sales, mix, promotions, loyalty, margins, baskets, quality');
assert.equal(new Set(semanticMetrics.map(m=>m.id)).size,semanticMetrics.length,'Metric IDs must be unique');
assert(semanticMetrics.every(m=>m.label&&m.formula&&m.source&&m.unit&&m.availability&&m.domain),'All metrics need an explicit contract');
assert(semanticMetrics.find(m=>m.id==='recruitment_rate').availability==='NEEDS_SOURCE','Recruitment cannot be invented from sales');
assert.match(semanticMetrics.find(m=>m.id==='gross_margin_ht').warning,/g\/kg/,'Cost unit conversion requires guardrails');
const catalog=semanticPublicModel();
assert.equal(catalog.version,'RI-SEMANTIC-1.0');
assert(catalog.domains.includes('FIDÉLITÉ')&&catalog.domains.includes('CLIENTS'));
assert(!catalog.metrics.some(m=>'aliases'in m),'Public schema excludes language internals');
assert.equal(lookupSemanticMetrics('poids ca')[0].id,'sales_share');
assert.equal(lookupSemanticMetrics('poids du CA identifié')[0].id,'identified_sales_share');
assert.equal(lookupSemanticMetrics('taux de marge')[0].id,'gross_margin_rate');
assert.equal(lookupSemanticMetrics('poids du CA remisé')[0].id,'promotion_sales_share');
const definition=semanticDefinitionAnswer('Comment est calculé le panier moyen ?');
assert.equal(definition.engine,'QUERY_GROUNDED');assert.equal(definition.providerDataSent,false);
assert.match(definition.answer,/sans chiffres inventés/);
assert.match(definition.sections[0].headline,/CA TTC \/ nombre de tickets/);
assert.equal(semanticDefinitionAnswer('Pourquoi le CA baisse ?'),null,'A business diagnosis is not a definition');
assert.equal(semanticDefinitionAnswer('Définition de la météo'),null,'Unknown metrics must not receive fake answers');

const base={
 status:'READY',
 period:{startDate:'2026-10-01',endDate:'2026-10-10'},
 comparison:{startDate:'2026-09-21',endDate:'2026-09-30'},
 coverage:{storesRequested:2,currentStoresReady:2,comparisonStoresReady:2},
 quality:{status:'OK',issues:[]},
 summary:{current:{sales:1200,tickets:100,averageBasket:12,identifiedSalesShare:42,promotionSales:180},
 previous:{sales:1000,tickets:100,averageBasket:10,identifiedSalesShare:38,promotionSales:100},
 drivers:{trafficEffect:0,basketEffect:200,totalDelta:200}},
 margin:{available:false,reason:'COST_NOT_VALIDATED'},
 products:[{key:'HS-000012',label:'Lait',sales:70,deltaSales:-80},{key:'HS-000050',label:'Jus',sales:60,deltaSales:20}],
 stores:[{storeId:'trefle',storeName:'Trèfle',deltaSales:-160},{storeId:'val-fleuri',storeName:'Val Fleuri',deltaSales:360}]
};
const story=buildBusinessStory(base);
assert.equal(story.ready,true);assert.equal(story.metrics.length,7);
assert.equal(story.delta,200);
assert.deepEqual(story.bridge,{trafficEffect:0,basketEffect:200,delta:200});
assert.equal(story.metrics.find(m=>m.id==='sales_per_day').value,120);
assert.equal(story.metrics.find(m=>m.id==='promotion_sales_share').value,15);
assert.equal(story.metrics.find(m=>m.id==='identified_sales_share').value,42);
assert.equal(story.metrics.find(m=>m.id==='identified_sales_share').change,4);
assert.equal(story.actions[0].title,'Magasin à examiner');
assert.match(story.actions[0].detail,/Trèfle/);
assert(story.warnings.some(w=>/Marge globale masquée/.test(w)));
const incomplete=buildBusinessStory({...base,coverage:{storesRequested:2,currentStoresReady:1,comparisonStoresReady:2},summary:{...base.summary,previous:{sales:0,tickets:0}}});
assert.equal(incomplete.ready,false);assert.equal(incomplete.bridge,null);
assert.equal(incomplete.metrics.find(m=>m.id==='sales_ttc').change,null,'Zero comparison must be N/D');
assert(incomplete.warnings.some(w=>/partielle/.test(w)));
const unequal=buildBusinessStory({...base,comparison:{startDate:'2026-09-26',endDate:'2026-09-30'}});
assert(unequal.warnings.some(w=>/fenêtres comptent/.test(w)));
const badBridge=buildBusinessStory({...base,summary:{...base.summary,drivers:{trafficEffect:123,basketEffect:456}}});
assert.equal(badBridge.bridge,null,'Unreconciled drivers must not be presented as proof');

for(const [question,entity,metric] of [
 ['Quel est mon CA moyen par jour ?', 'network','salesPerDay'],
 ['Combien de tickets par jour en moyenne ?', 'network','ticketsPerDay'],
 ['Quel est le poids du CA remisé ?', 'network','promotionSalesShare'],
 ['Quel est le poids du CA identifié ?', 'network','identifiedSalesShare']
]){
 const plan=parseQuery(question);assert.equal(plan.queries[0].entity,entity,question);
 assert(plan.queries[0].metrics.includes(metric),question+': metric missing')
}
const evidence={
 facts:{
  period:{start:'2026-10-01',end:'2026-10-10',compareStart:'2026-09-21',compareEnd:'2026-09-30'},
  sales:{current:1200,previous:1000,delta:200,tickets:100,previousTickets:100,averageBasket:12,previousAverageBasket:10,
   promotionSales:180,previousPromotionSales:100},margin:{},sources:[{id:'S1',name:'D365 ventes'}],quality:[]
 },
 stores:[{id:'trefle',name:'Trèfle'}],table:{stores:[],products:[],days:[],hours:[]}
};
const answer=renderQueryAnswer(parseQuery('Quel est le poids du CA remisé ?'),evidence);
assert.match(answer.answer,/15 %/);
assert.match(answer.answer,/10 %/);
assert.match(answer.answer,/retour sur investissement/);
assert.match(answer.answer,/Écart : 5 pts/,'Percentage differences are expressed in points');
const daily=renderQueryAnswer(parseQuery('Quel est mon CA moyen par jour ?'),evidence);
assert.match(daily.answer,/120 DH/);assert.match(daily.answer,/100 DH/);
assert.match(daily.answer,/jours calendaires/);

const ui=readFileSync(new URL('../../frontend/analytics/index.html',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../../frontend/analytics/bootstrap.js',import.meta.url),'utf8');
const design=readFileSync(new URL('../../frontend/analytics/business-experience.css',import.meta.url),'utf8');
const companion=readFileSync(new URL('../../frontend/analytics/companion-dictionary.js',import.meta.url),'utf8');
assert.match(ui,/id="businessStory"/);
assert.match(ui,/id="assistantKpiDictionary"/);
assert.match(bootstrap,/business-story\.js/);
assert.match(bootstrap,/companion-dictionary\.js/);
assert.match(design,/prefers-reduced-motion:reduce/);
assert.match(design,/focus-visible/);
assert.match(companion,/\/api\/analytics\/semantic-model/);
assert.doesNotMatch(companion,/innerHTML\s*=/,'KPI definitions must be inserted as plain text');
console.log('StoreOps semantic registry, grounded question answers, business brief and Apple-style accessibility contracts passed.');
