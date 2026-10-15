import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../services/decision-intelligence.mjs',import.meta.url),'utf8');

assert.doesNotMatch(
  source,
  /p\?\.marginValue!==null\?round2\(x\.marginValue-p\.marginValue\)/,
  'comparison rows must not dereference marginValue when an SKU is absent from the comparison period'
);
assert.match(
  source,
  /x\.marginValue!=null&&p\?\.marginValue!=null/,
  'margin delta must require both current and previous product margins'
);

console.log('Decision comparison safety contract passed.');
