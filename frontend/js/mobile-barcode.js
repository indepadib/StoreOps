import { toast } from './ui.js';

const STATIC_TARGETS=[
  {selector:'#priceCheckEan',action:'#priceCheckLookup'},
  {selector:'#qualityEan',action:'#qualityLookup'},
  {selector:'#dlcEan',action:'#dlcLookup'},
  {selector:'#lossEan',action:null}
];
const HTML5_QRCODE_URL='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';

let activeStream=null,activeFrame=null,activeHtml5=null,scanBusy=false,lastDetect=0,html5Loader=null;

function ensureStyles(){if(document.querySelector('link[data-storeops-barcode-style]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='/mobile-barcode.css';l.dataset.storeopsBarcodeStyle='1';document.head.appendChild(l)}
function scannerShell(){
  let host=document.querySelector('#storeopsBarcodeScanner');
  if(host)return host;
  host=document.createElement('div');
  host.id='storeopsBarcodeScanner';
  host.className='barcode-scanner-backdrop';
  host.hidden=true;
  host.innerHTML=`<div class="barcode-scanner-sheet" role="dialog" aria-modal="true" aria-label="Scanner un code-barres">
    <div class="barcode-scanner-head"><div><strong>Scanner l’article</strong><small>Place le code-barres dans le cadre.</small></div><button class="btn ghost" type="button" data-close-barcode-scanner>Fermer</button></div>
    <div class="barcode-video-wrap"><video id="storeopsBarcodeVideo" playsinline muted></video><div id="storeopsHtml5Reader" class="barcode-html5-reader" hidden></div><div class="barcode-frame"><span></span></div></div>
    <div class="barcode-scanner-foot"><strong>Scan caméra</strong><span>Si le code ne passe pas, ferme la caméra et saisis l’EAN manuellement. Les deux modes restent toujours disponibles.</span></div>
  </div>`;
  document.body.appendChild(host);
  host.querySelector('[data-close-barcode-scanner]').addEventListener('click',stopScanner);
  host.addEventListener('click',e=>{if(e.target===host)stopScanner()});
  return host;
}

function clearHtml5(){
  const scanner=activeHtml5;activeHtml5=null;
  if(scanner){Promise.resolve(scanner.stop?.()).catch(()=>{}).finally(()=>{try{scanner.clear?.()}catch{}})}
  const reader=document.querySelector('#storeopsHtml5Reader');if(reader){reader.hidden=true;reader.innerHTML=''}
}
function stopScanner(){
  if(activeFrame)cancelAnimationFrame(activeFrame);
  activeFrame=null;scanBusy=false;lastDetect=0;
  if(activeStream){for(const track of activeStream.getTracks())track.stop();activeStream=null}
  clearHtml5();
  const host=document.querySelector('#storeopsBarcodeScanner');if(host)host.hidden=true;
  const video=document.querySelector('#storeopsBarcodeVideo');if(video){video.pause();video.srcObject=null;video.hidden=false}
}

async function supportedDetector(){
  if(!('BarcodeDetector' in window))return null;
  try{
    const supported=await window.BarcodeDetector.getSupportedFormats?.()||[];
    const wanted=['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf'];
    const formats=wanted.filter(x=>!supported.length||supported.includes(x));
    return formats.length?new window.BarcodeDetector({formats}):new window.BarcodeDetector();
  }catch{return null}
}
function loadHtml5Qrcode(){
  if(window.Html5Qrcode)return Promise.resolve(true);
  if(html5Loader)return html5Loader;
  html5Loader=new Promise(resolve=>{
    const existing=document.querySelector('script[data-storeops-html5-qrcode]');
    if(existing){existing.addEventListener('load',()=>resolve(!!window.Html5Qrcode),{once:true});existing.addEventListener('error',()=>resolve(false),{once:true});return}
    const s=document.createElement('script');s.src=HTML5_QRCODE_URL;s.async=true;s.crossOrigin='anonymous';s.dataset.storeopsHtml5Qrcode='1';s.onload=()=>resolve(!!window.Html5Qrcode);s.onerror=()=>resolve(false);document.head.appendChild(s);
  });
  return html5Loader;
}
function fillScanned(input,raw,afterScan){
  const value=String(raw||'').trim();if(!value)return;
  input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
  stopScanner();toast(`Article scanné : ${value}`);if(typeof afterScan==='function')setTimeout(()=>afterScan(value),80);
}
async function startNativeScanner(detector,input,afterScan){
  const host=scannerShell(),video=host.querySelector('#storeopsBarcodeVideo'),reader=host.querySelector('#storeopsHtml5Reader');reader.hidden=true;video.hidden=false;
  try{
    activeStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
    video.srcObject=activeStream;host.hidden=false;await video.play();
  }catch(e){stopScanner();toast(e?.name==='NotAllowedError'?'Autorise la caméra pour scanner, ou saisis le code manuellement.':'Impossible d’ouvrir la caméra. Saisis le code manuellement.');input.focus();return}
  const tick=async ts=>{
    if(!activeStream)return;
    activeFrame=requestAnimationFrame(tick);
    if(scanBusy||video.readyState<2||ts-lastDetect<180)return;
    lastDetect=ts;scanBusy=true;
    try{const rows=await detector.detect(video),raw=String(rows?.[0]?.rawValue||'').trim();if(raw)fillScanned(input,raw,afterScan)}catch{}finally{scanBusy=false}
  };
  activeFrame=requestAnimationFrame(tick);
}
async function startIosFallback(input,afterScan){
  const loaded=await loadHtml5Qrcode();if(!loaded){toast('Le moteur de scan n’a pas pu se charger. Saisis le code manuellement.');input.focus();return}
  const host=scannerShell(),video=host.querySelector('#storeopsBarcodeVideo'),reader=host.querySelector('#storeopsHtml5Reader');video.hidden=true;reader.hidden=false;host.hidden=false;
  try{
    const F=window.Html5QrcodeSupportedFormats||{},formats=['EAN_13','EAN_8','UPC_A','UPC_E','CODE_128','CODE_39','ITF'].map(k=>F[k]).filter(v=>v!==undefined);
    activeHtml5=new window.Html5Qrcode('storeopsHtml5Reader',formats.length?{formatsToSupport:formats,verbose:false}:{verbose:false});
    await activeHtml5.start({facingMode:'environment'},{fps:10,qrbox:{width:280,height:140},aspectRatio:1.333333},decoded=>fillScanned(input,decoded,afterScan),()=>{});
  }catch(e){stopScanner();toast(e?.name==='NotAllowedError'?'Autorise la caméra pour scanner, ou saisis le code manuellement.':'Scan caméra indisponible. Saisis le code manuellement.');input.focus()}
}
async function startScanner(input,afterScan){
  if(!input)return;
  if(!navigator.mediaDevices?.getUserMedia){toast('Caméra indisponible. Saisis le code manuellement.');input.focus();return}
  stopScanner();
  const detector=await supportedDetector();
  if(detector)return startNativeScanner(detector,input,afterScan);
  return startIosFallback(input,afterScan);
}

function addScanButton(input,afterScan){
  if(!input||input.dataset.storeopsScanEnhanced==='1')return;
  input.dataset.storeopsScanEnhanced='1';
  if(!input.getAttribute('inputmode'))input.setAttribute('inputmode','numeric');
  input.setAttribute('autocomplete','off');
  const btn=document.createElement('button');btn.type='button';btn.className='btn soft mobile-scan-btn';btn.innerHTML='<span aria-hidden="true">▣</span> Scanner';btn.setAttribute('aria-label','Scanner le code-barres avec la caméra');
  btn.addEventListener('click',()=>startScanner(input,afterScan));
  input.insertAdjacentElement('afterend',btn);
  const parent=input.parentElement;
  if(parent&&!parent.querySelector(':scope > .scan-manual-hint')){
    const hint=document.createElement('div');hint.className='scan-manual-hint';hint.textContent='Caméra ou saisie manuelle';parent.appendChild(hint);
  }
}

function enhanceStatic(){
  for(const cfg of STATIC_TARGETS){const input=document.querySelector(cfg.selector);if(!input)continue;addScanButton(input,()=>cfg.action&&document.querySelector(cfg.action)?.click())}
  document.querySelectorAll('[data-inv-ean]').forEach(input=>{addScanButton(input,()=>{const id=input.dataset.invEan;[...document.querySelectorAll('[data-add-inv-line]')].find(b=>b.dataset.addInvLine===id)?.click()})});
}

function normalize(v){return String(v||'').replace(/\s+/g,'').trim().toLowerCase()}
function findReceiptArticle(code){
  const q=normalize(code);if(!q){toast('Scanne ou saisis un EAN / code article.');return}
  const lines=[...document.querySelectorAll('#receiptsContent .receipt-line')],match=lines.find(x=>normalize(x.textContent).includes(q));
  document.querySelectorAll('#receiptsContent .receipt-line-focus').forEach(x=>x.classList.remove('receipt-line-focus'));
  if(!match){toast('Article non trouvé dans les réceptions affichées.');return}
  match.classList.add('receipt-line-focus');match.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>match.classList.remove('receipt-line-focus'),4500);
}
function enhanceReceipts(){
  const root=document.querySelector('#receiptsContent');if(!root||root.querySelector('#receiptMobileFinder')||!root.querySelector('.receipt-line'))return;
  const panel=document.createElement('section');panel.id='receiptMobileFinder';panel.className='card receipt-mobile-finder';panel.innerHTML=`<div><strong>Trouver un article à réceptionner</strong><div class="small muted">Scanne le produit reçu ou saisis son EAN/code article pour aller directement à sa ligne de contrôle.</div></div><div class="receipt-finder-row"><input id="receiptFinderEan" inputmode="numeric" autocomplete="off" placeholder="EAN / code article"><button class="btn brand" id="receiptFinderGo" type="button">Trouver</button></div>`;
  root.prepend(panel);
  const input=panel.querySelector('#receiptFinderEan'),go=panel.querySelector('#receiptFinderGo');go.addEventListener('click',()=>findReceiptArticle(input.value));input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();findReceiptArticle(input.value)}});addScanButton(input,raw=>findReceiptArticle(raw));
}

let queued=false;
function enhanceAll(){queued=false;enhanceStatic();enhanceReceipts()}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(enhanceAll)}

export function initMobileBarcode(){
  ensureStyles();scannerShell();enhanceAll();
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('pagehide',stopScanner);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopScanner()});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initMobileBarcode,{once:true});else initMobileBarcode();
