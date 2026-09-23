import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dlc=readFileSync(new URL('../../frontend/js/pages/dlc.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../../frontend/mobile-barcode.css',import.meta.url),'utf8');

assert.match(dlc,/class="row dlc-lookup-row"/);
assert.match(dlc,/id="dlcEan"/);
assert.match(css,/\.dlc-entry \.dlc-lookup-row\{display:grid/);
assert.match(css,/grid-template-columns:minmax\(280px,1fr\) auto auto/);
assert.match(css,/#dlcEan\{width:100%;min-width:0;min-height:56px/);
assert.match(css,/\.scan-manual-hint\{grid-column:1\/-1/);
assert.match(css,/caret-color:var\(--brand\)/);
assert.doesNotMatch(dlc,/id="dlcEan"[^>]*style="flex:1/);

console.log('V2.30.1 DLC input visibility contract: OK');
