import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scanner=readFileSync(new URL('../../frontend/js/mobile-barcode.js',import.meta.url),'utf8');
const pwa=readFileSync(new URL('../../frontend/js/pwa.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../../frontend/sw.js',import.meta.url),'utf8');
const inventory=readFileSync(new URL('../../frontend/js/pages/inventory.js',import.meta.url),'utf8');
const commercial=readFileSync(new URL('../../frontend/js/pages/commercial.js',import.meta.url),'utf8');
const quality=readFileSync(new URL('../../frontend/js/pages/quality.js',import.meta.url),'utf8');
const dlc=readFileSync(new URL('../../frontend/js/pages/dlc.js',import.meta.url),'utf8');
const losses=readFileSync(new URL('../../frontend/js/pages/losses.js',import.meta.url),'utf8');

for(const selector of ['#priceCheckEan','#qualityEan','#dlcEan','#lossEan'])assert.ok(scanner.includes(selector),`scanner target missing: ${selector}`);
assert.ok(scanner.includes('[data-inv-ean]'),'inventory scanner enhancement missing');
assert.ok(scanner.includes('receiptMobileFinder'),'receiving scan/manual finder missing');
assert.ok(scanner.includes('getUserMedia'),'camera scanning must use the phone camera');
assert.ok(scanner.includes('BarcodeDetector'),'native barcode detection engine missing');
assert.ok(scanner.includes('html5-qrcode@2.3.8'),'iOS/Safari fallback scanner must be pinned to a fixed version');
assert.ok(scanner.includes('unpkg.com/html5-qrcode@2.3.8'),'scanner must keep a second CDN source if the primary CDN is unavailable');
assert.ok(scanner.includes('isAppleMobile'),'Apple mobile devices must use the hardened retail barcode path');
assert.ok(scanner.includes("Caméra arrière automatique")&&scanner.includes("virtual:true"),'iPhone live scan must try the OS-managed rear camera before forcing a physical lens');
assert.ok(scanner.includes('native-timeout'),'native decoding must automatically fall back instead of leaving the camera open forever');
assert.ok(scanner.includes('/ultra|0\\.5|0,5|tele|telephoto|zoom/')&&scanner.includes('/front|avant|frontal|user|selfie/'),'rear-camera selection must de-prioritize ultra-wide/zoom and front cameras');
assert.ok(scanner.includes('Html5Qrcode'),'iOS/Safari fallback implementation missing');
assert.ok(scanner.includes('EAN_13')&&scanner.includes('CODE_128'),'fallback must support retail 1D barcodes');
assert.ok(scanner.includes('saisie manuelle'),'manual fallback must remain explicit');
assert.ok(scanner.includes("facingMode:'environment'")||scanner.includes("facingMode:{ideal:'environment'}"),'rear camera must be preferred');
assert.ok(pwa.includes("import './mobile-barcode.js?v=2400'"),'mobile scan layer must load with a cache-busted StoreOps runtime');
assert.ok(sw.includes("'/js/mobile-barcode.js'"),'scanner JS must be available in the PWA shell');
assert.ok(sw.includes("'/mobile-barcode.css'"),'scanner CSS must be available in the PWA shell');

assert.ok(inventory.includes('data-inv-ean'),'inventory must keep manual EAN entry');
assert.ok(commercial.includes('id="priceCheckEan"'),'price check must keep manual EAN entry');
assert.ok(quality.includes('id="qualityEan"'),'quality must keep manual EAN entry');
assert.ok(dlc.includes('id="dlcEan"'),'DLC must keep manual EAN entry');
assert.ok(losses.includes('id="lossEan"'),'losses must keep manual EAN entry');

console.log('Mobile dual scan/manual coverage OK');
