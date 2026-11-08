import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const analyticsIndex=read('frontend/analytics/index.html');
const analyticsCss=read('frontend/analytics/polish.css');
const analyticsJs=read('frontend/analytics/analytics.js');
const network=read('frontend/js/pages/network.js');
const scanner=read('frontend/js/mobile-barcode.js');

assert.match(analyticsIndex,/class="icon-btn mobile-only mobile-menu-btn"/,'Analytics mobile must expose a visible Menu button.');
assert.match(analyticsIndex,/aria-expanded="false"/,'Analytics Menu must expose its open state accessibly.');
for(const section of ['overview','sales','network','inventory','loyalty']){
  assert.match(analyticsIndex,new RegExp(`data-mobile-section="${section}"`),`Analytics quick mobile navigation must expose ${section}.`);
}
assert.match(analyticsCss,/\.mobile-quick-nav\{display:none\}/);
assert.match(analyticsCss,/@media\(max-width:860px\)[\s\S]*\.mobile-quick-nav\{display:flex/,'Quick navigation must become visible on mobile.');
assert.match(analyticsJs,/function setMobileNavOpen\(open\)/);
assert.match(analyticsJs,/\$\$\('\[data-mobile-section\]'\)\.forEach/,'Mobile quick navigation must be wired.');
assert.match(analyticsJs,/btn\.dataset\.mobileSection === state\.section/,'Mobile navigation active state must track the current section.');

assert.match(network,/function safeAssessNetworkStore\(row\)/,'A malformed store must not blank the whole Network page.');
assert.match(network,/localNetworkBase/,'Network page must keep an offline/fallback base.');
assert.match(scanner,/SCANNER_DOM_VERSION='2420'/);
assert.match(scanner,/rotatedPhotoCandidates/);
assert.match(scanner,/for\(const angle of \[90,-90\]\)/,'Photo scanner must retry rotated retail barcodes.');

console.log('v2.42 mobile operability contract: OK');
