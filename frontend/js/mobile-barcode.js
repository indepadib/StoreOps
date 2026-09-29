import { toast } from './ui.js';

const STATIC_TARGETS=[
  {selector:'#managerScanEan',action:'#managerScanGo'},
  {selector:'#priceCheckEan',action:'#priceCheckLookup'},
  {selector:'#qualityEan',action:'#qualityLookup'},
  {selector:'#dlcEan',action:'#dlcLookup'},
  {selector:'#lossEan',action:null}
];
const HTML5_QRCODE_URLS=['https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js','https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'];
const LINEAR_FORMAT_KEYS=['EAN_13','EAN_8','UPC_A','UPC_E','CODE_128','CODE_39','ITF'];

let activeStream=null,activeFrame=null,activeHtml5=null,scanBusy=false,lastDetect=0,html5Loader=null,activeFallbackTimer=null;
let activeTargetInput=null,activeAfterScan=null,activeCameraCandidates=[],activeCameraIndex=0,scanToken=0;
const isAppleMobile=()=>/iP(hone|ad|od)/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const normalizeCameraLabel=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function setScanStatus(text,tone=''){const el=document.querySelector('#storeopsBarcodeStatus');if(!el)return;el.textContent=text||'';el.dataset.tone=tone||'';}

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
    <div class="barcode-scanner-foot"><strong>Scan caméra</strong><span id="storeopsBarcodeStatus">Initialisation de la caméra…</span><span>Cadre l’EAN à 15–25 cm, évite les reflets et garde les barres nettes. Si l’iPhone ne fait pas la mise au point, utilise « Photo du code ».</span>
      <div class="barcode-scanner-actions"><label class="btn soft barcode-photo-action" for="storeopsBarcodePhoto">Photo du code</label><button class="btn ghost" type="button" data-barcode-retry>Relancer le live</button></div>
      <input id="storeopsBarcodePhoto" type="file" accept="image/*" capture="environment" hidden>
    </div>
  </div>`;
  document.body.appendChild(host);
  host.querySelector('[data-close-barcode-scanner]').addEventListener('click',stopScanner);
  host.addEventListener('click',e=>{if(e.target===host)stopScanner()});
  host.querySelector('[data-barcode-retry]').addEventListener('click',()=>{if(activeTargetInput)startScanner(activeTargetInput,activeAfterScan)});
  host.querySelector('#storeopsBarcodePhoto').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await scanPhotoFile(file)});
  return host;
}

function stopTracks(){if(activeStream){for(const track of activeStream.getTracks())track.stop();activeStream=null}}
async function shutdownHtml5(){
  const scanner=activeHtml5;activeHtml5=null;
  if(scanner){
    try{await scanner.stop?.()}catch{}
    try{scanner.clear?.()}catch{}
  }
  const reader=document.querySelector('#storeopsHtml5Reader');if(reader){reader.hidden=true;reader.innerHTML=''}
}
function clearTimers(){
  if(activeFrame)cancelAnimationFrame(activeFrame);
  if(activeFallbackTimer)clearTimeout(activeFallbackTimer);
  activeFallbackTimer=null;activeFrame=null;scanBusy=false;lastDetect=0;
}
function stopScanner(){
  scanToken+=1;clearTimers();stopTracks();void shutdownHtml5();
  activeTargetInput=null;activeAfterScan=null;activeCameraCandidates=[];activeCameraIndex=0;
  const host=document.querySelector('#storeopsBarcodeScanner');if(host)host.hidden=true;
  const video=document.querySelector('#storeopsBarcodeVideo');if(video){try{video.pause()}catch{}video.srcObject=null;video.hidden=false}
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
    const tryUrl=index=>{
      if(index>=HTML5_QRCODE_URLS.length){html5Loader=null;resolve(false);return}
      const s=document.createElement('script');s.src=HTML5_QRCODE_URLS[index];s.async=true;s.crossOrigin='anonymous';s.dataset.storeopsHtml5Qrcode='1';
      s.onload=()=>window.Html5Qrcode?resolve(true):(s.remove(),tryUrl(index+1));
      s.onerror=()=>{s.remove();tryUrl(index+1)};
      document.head.appendChild(s);
    };
    tryUrl(0);
  });
  return html5Loader;
}
function formatConfig(){
  const F=window.Html5QrcodeSupportedFormats||{};
  const formats=LINEAR_FORMAT_KEYS.map(k=>F[k]).filter(v=>v!==undefined);
  return formats.length?{formatsToSupport:formats,verbose:false}:{verbose:false};
}
function fillScanned(input,raw,afterScan){
  const value=String(raw||'').trim();if(!value)return;
  input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
  stopScanner();toast(`Article scanné : ${value}`);if(typeof afterScan==='function')setTimeout(()=>afterScan(value),80);
}
function cameraScore(camera,index){
  const label=normalizeCameraLabel(camera?.label);
  let score=0;
  if(/back|rear|arriere|trasera|posterior|ruck|hinten/.test(label))score+=80;
  if(/front|avant|frontal|user|selfie/.test(label))score-=160;
  if(/main|standard|wide camera|camera 1x|1x/.test(label))score+=24;
  if(/ultra|0\.5|0,5|tele|telephoto|zoom/.test(label))score-=70;
  if(/dual|triple/.test(label))score+=8;
  if(isAppleMobile()&&index===1)score+=32;
  return score;
}
function cameraCandidates(cameras){
  const rows=(cameras||[]).map((camera,index)=>({...camera,_index:index,_score:cameraScore(camera,index)}));
  const nonFront=rows.filter(x=>!/front|avant|frontal|user|selfie/.test(normalizeCameraLabel(x.label)));
  const pool=nonFront.length?nonFront:rows;
  return pool.sort((a,b)=>b._score-a._score).filter((x,i,a)=>x.id&&a.findIndex(y=>y.id===x.id)===i);
}
async function startNativeScanner(detector,input,afterScan,token){
  const host=scannerShell(),video=host.querySelector('#storeopsBarcodeVideo'),reader=host.querySelector('#storeopsHtml5Reader');reader.hidden=true;video.hidden=false;
  try{
    activeStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
    if(token!==scanToken){stopTracks();return}
    video.srcObject=activeStream;host.hidden=false;await video.play();setScanStatus('Recherche automatique de l’EAN…');
    const track=activeStream.getVideoTracks?.()[0];try{const caps=track?.getCapabilities?.();if(caps?.focusMode?.includes?.('continuous'))await track.applyConstraints({advanced:[{focusMode:'continuous'}]})}catch{}
  }catch(e){if(token!==scanToken)return;stopScanner();toast(e?.name==='NotAllowedError'?'Autorise la caméra pour scanner, ou saisis le code manuellement.':'Impossible d’ouvrir la caméra. Saisis le code manuellement.');input.focus();return}
  activeFallbackTimer=setTimeout(()=>{if(activeStream&&token===scanToken){setScanStatus('Le premier moteur n’a rien lu. Passage au décodeur EAN renforcé…','switching');stopTracks();if(activeFrame)cancelAnimationFrame(activeFrame);activeFrame=null;startIosFallback(input,afterScan,{reason:'native-timeout',token})}},2600);
  const tick=async ts=>{
    if(!activeStream||token!==scanToken)return;
    activeFrame=requestAnimationFrame(tick);
    if(scanBusy||video.readyState<2||ts-lastDetect<160)return;
    lastDetect=ts;scanBusy=true;
    try{const rows=await detector.detect(video),raw=String(rows?.[0]?.rawValue||'').trim();if(raw){if(activeFallbackTimer)clearTimeout(activeFallbackTimer);activeFallbackTimer=null;fillScanned(input,raw,afterScan)}}catch{}finally{scanBusy=false}
  };
  activeFrame=requestAnimationFrame(tick);
}
async function startHtml5Candidate(input,afterScan,token){
  if(token!==scanToken)return;
  if(activeFallbackTimer)clearTimeout(activeFallbackTimer);
  activeFallbackTimer=null;
  await shutdownHtml5();
  if(token!==scanToken)return;
  const host=scannerShell(),video=host.querySelector('#storeopsBarcodeVideo'),reader=host.querySelector('#storeopsHtml5Reader');video.hidden=true;reader.hidden=false;host.hidden=false;
  const candidate=activeCameraCandidates[activeCameraIndex]||null;
  const camera=candidate?.id||{facingMode:'environment'};
  try{
    activeHtml5=new window.Html5Qrcode('storeopsHtml5Reader',formatConfig());
    await activeHtml5.start(camera,{
      fps:12,
      aspectRatio:4/3,
      qrbox:(w,h)=>({width:Math.max(120,Math.min(520,Math.round(w*.94))),height:Math.max(90,Math.min(240,Math.round(h*.42)))}),
      disableFlip:false
    },decoded=>{if(token===scanToken)fillScanned(input,decoded,afterScan)},()=>{});
    if(token!==scanToken)return;
    const suffix=activeCameraCandidates.length>1?` · objectif ${activeCameraIndex+1}/${activeCameraCandidates.length}`:'';
    setScanStatus(`EAN prêt à être lu${suffix} · garde les barres nettes dans le cadre.`,'ready');
    try{await activeHtml5.applyVideoConstraints?.({advanced:[{focusMode:'continuous'}]})}catch{}
    activeFallbackTimer=setTimeout(async()=>{
      if(token!==scanToken)return;
      if(activeCameraIndex<activeCameraCandidates.length-1){
        activeCameraIndex+=1;
        setScanStatus(`Mise au point insuffisante · essai automatique d’un autre objectif (${activeCameraIndex+1}/${activeCameraCandidates.length})…`,'switching');
        await startHtml5Candidate(input,afterScan,token);
      }else{
        setScanStatus('Le live n’arrive pas à faire une mise au point fiable. Appuie sur « Photo du code » : l’iPhone utilisera son appareil photo natif.','photo');
        host.querySelector('.barcode-photo-action')?.classList.add('recommended');
      }
    },4300);
  }catch(e){
    if(token!==scanToken)return;
    if(activeCameraIndex<activeCameraCandidates.length-1){activeCameraIndex+=1;return startHtml5Candidate(input,afterScan,token)}
    setScanStatus('Le live caméra est indisponible. Utilise « Photo du code » ou saisis l’EAN manuellement.','photo');
    host.querySelector('.barcode-photo-action')?.classList.add('recommended');
    if(e?.name==='NotAllowedError')toast('Autorise la caméra pour scanner, ou saisis le code manuellement.');
  }
}
async function startIosFallback(input,afterScan,{reason='ios',token=scanToken}={}){
  if(token!==scanToken)return;
  setScanStatus(reason==='native-timeout'?'Passage au décodeur EAN renforcé…':'Chargement du décodeur EAN optimisé iPhone…','switching');
  const loaded=await loadHtml5Qrcode();if(token!==scanToken)return;
  if(!loaded){setScanStatus('Le moteur live n’a pas pu se charger. Utilise « Photo du code » ou saisis l’EAN.','photo');scannerShell().querySelector('.barcode-photo-action')?.classList.add('recommended');return}
  try{
    const cams=await window.Html5Qrcode.getCameras();
    activeCameraCandidates=cameraCandidates(cams);
  }catch{activeCameraCandidates=[]}
  activeCameraIndex=0;
  await startHtml5Candidate(input,afterScan,token);
}
async function scanPhotoFile(file){
  const input=activeTargetInput,afterScan=activeAfterScan,token=scanToken;if(!input||!file)return;
  if(activeFallbackTimer)clearTimeout(activeFallbackTimer);activeFallbackTimer=null;stopTracks();if(activeFrame)cancelAnimationFrame(activeFrame);activeFrame=null;
  const loaded=await loadHtml5Qrcode();if(!loaded||token!==scanToken){toast('Le moteur de lecture n’a pas pu se charger.');return}
  await shutdownHtml5();if(token!==scanToken)return;
  const host=scannerShell(),reader=host.querySelector('#storeopsHtml5Reader'),video=host.querySelector('#storeopsBarcodeVideo');host.hidden=false;video.hidden=true;reader.hidden=false;
  setScanStatus('Analyse de la photo en cours…','switching');
  try{
    activeHtml5=new window.Html5Qrcode('storeopsHtml5Reader',formatConfig());
    const decoded=await activeHtml5.scanFile(file,false);
    if(token===scanToken)fillScanned(input,decoded,afterScan);
  }catch{
    if(token!==scanToken)return;
    setScanStatus('Code non lu sur cette photo. Reprends-la de plus près, sans reflet, ou relance le live.','photo');
    host.querySelector('.barcode-photo-action')?.classList.add('recommended');
    toast('Code-barres non détecté sur la photo.');
  }
}
async function startScanner(input,afterScan){
  if(!input)return;
  if(!navigator.mediaDevices?.getUserMedia){toast('Caméra indisponible. Saisis le code manuellement.');input.focus();return}
  stopScanner();
  activeTargetInput=input;activeAfterScan=afterScan;
  const token=scanToken;
  const host=scannerShell();host.hidden=false;host.querySelector('.barcode-photo-action')?.classList.remove('recommended');setScanStatus('Initialisation de la caméra…');
  if(isAppleMobile())return startIosFallback(input,afterScan,{reason:'ios',token});
  const detector=await supportedDetector();if(token!==scanToken)return;
  if(detector)return startNativeScanner(detector,input,afterScan,token);
  return startIosFallback(input,afterScan,{reason:'fallback',token});
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
