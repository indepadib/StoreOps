import {dataDestinations,rankDestinations} from '../../frontend/analytics/data-destinations.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const dir=new URL('../../frontend/analytics/',import.meta.url);
const get=name=>readFileSync(new URL(name,dir),'utf8');
const html=get('index.html'),css=get('experience-navigation.css'),js=get('experience-navigation.js'),boot=get('bootstrap.js');
const source=fileURLToPath(new URL('experience-navigation.js',dir));
const check=spawnSync(process.execPath,['--check',source],{encoding:'utf8'});
assert.equal(check.status,0,'Experience navigation JS must pass native syntax check: '+check.stderr);
assert.match(html,/id="riExperience"/);
assert.match(html,/id="riFinderDialog"/);
assert.match(html,/id="riTools"/);
assert.match(html,/id="riToolsMenu"/);
assert.match(js,/function setupTools\(/);
assert.match(js,/menu\.append\(button\)/,'Mobile tools must move original controls with their handlers');
assert.match(js,/bar\.insertBefore\(button,details\)/,'Desktop must restore the originals');
assert.match(js,/function syncLensIndicator\(/);
assert.match(css,/\.ri-lens-indicator/);
assert.match(html,/id="riFinderInput"[^>]*type="search"|type="search"[^>]*id="riFinderInput"/);
assert.match(html,/id="riFilterMore"[^>]*aria-expanded="false"/);
for(const mode of ['focus','explore','full']){
 assert.match(html,new RegExp('data-ri-mode-choice="'+mode+'"'));
 assert.match(js,new RegExp("id:'"+mode+"'"));
}
assert.match(html,/id="riExperienceModeHelp" aria-live="polite"/);
assert.match(js,/new CustomEvent|retail-intelligence:section/);
assert.match(js,/getSelectedStores|navigate\?\./,'Navigation must reuse current authorized app navigation');
assert.match(js,/localStorage\.setItem/);
assert.match(js,/event\.metaKey\|\|event\.ctrlKey/,'Search finder must support cmd/ctrl K');
assert.match(js,/typeof dialog\.showModal==='function'/);
assert.match(js,/if\(panel\.hidden\)trigger\.click\(\)/,'Companion actions must use existing opener');
assert.match(js,/replaceChildren/,'Finder results should not inject untrusted HTML');
assert.doesNotMatch(js,/\.innerHTML\s*=/,'Navigation content must use text nodes only');
assert.match(css,/prefers-reduced-motion:reduce/);
assert.match(css,/prefers-reduced-transparency:reduce/);
assert.match(css,/prefers-contrast:more/);
assert.match(css,/\.ri-experience/);
assert.match(css,/#analyticsAssistant\.analytics-assistant/);
assert.match(css,/body\[data-ri-mode="focus"\]/);
assert.match(css,/body\[data-ri-mode="explore"\]/);
assert.match(css,/#customerResearchContent/);
assert.match(css,/\.decision-table-wrap/);
assert.doesNotMatch(css,/animation:\s*[^;]*infinite/,'No gratuitous infinite dashboard animation');
assert.match(boot,/experience-navigation\.js/);
assert.match(html,/experience-navigation\.css/);
// All existing widgets and report loading remain in the original shell.
for(const id of ['analyticsContent','filterbar','crmIntelligence','customerResearch','salesDiagnostic','businessStory','executiveOnePager','analyticsAssistant','fullExportBtn','exportBtn']){
 assert.match(html,new RegExp('id="'+id+'"'),'Core UI contract must be preserved: '+id)
}
// Existing section switches and data exports must remain independent of UI modes.
assert.doesNotMatch(js,/api\/analytics|fetch\(|\.reload\(/,'Experience layer must not change data access or trigger extra D365 requests');
assert.match(js,/getState\?\./);
console.log('Analytics Experience V1: progressive disclosure, accessibility, keyboard search, intact data and reduced-motion contracts passed.');

for(const [query,id] of [
 ['taux de service fournisseur','service'],['panier moyen ca','turnover'],['clients non revus','retention'],
 ['réceptions historiques','historical-range'],['code interne ean','catalog'],['transfert entrepôt','purchase'],
]){
 assert.equal(rankDestinations(dataDestinations,query)[0]?.id,id,query);
}
for(const item of dataDestinations){
 assert.match(html,new RegExp('data-section="'+item.section+'"'));
 if(item.target==='detentionViews')assert.match(get('detention-views.js'),/host.id='detentionViews'/);
 else assert.match(html,new RegExp('id="'+item.target+'"'));
}
assert.match(js,/navigate\?\.\(destination.section\)/);

const analytics=get('analytics.js');
for(const [,section] of html.matchAll(/data-section="(\w+)"/g)){
 assert.match(js,new RegExp('^ '+section+':\\[','m'),section+' must have its own page actions');
 assert.match(analytics,new RegExp('^    '+section+': \\[','m'),section+' must support direct links');
}
assert.match(analytics,/addEventListener\('popstate', \(\) => navigateSection\(sectionFromUrl\(\)/);
assert.match(js,/entries.filter\(item=>item.kind==='section'\)/,'Finder must list all pages before typing');
