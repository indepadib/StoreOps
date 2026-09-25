const clean=v=>String(v??'').trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const esc=v=>clean(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const unique=rows=>[...new Set(rows.map(clean).filter(Boolean))];

function vendorKey(r){
 return clean(r?.source_vendor_account)||clean(r?.vendor)||clean(r?.source_origin)||'FOURNISSEUR_NON_IDENTIFIE'
}
function lineKey(l){
 return [clean(l?.product_number)||clean(l?.ean)||clean(l?.product_name),clean(l?.purchase_unit)||'UNITE_INCONNUE'].join('::')
}
function sumNullable(rows,field){
 let total=0,count=0;
 for(const row of rows){const n=num(row?.[field]);if(n!==null){total+=n;count++}}
 return{value:count?Math.round((total+Number.EPSILON)*1000)/1000:null,coverage:rows.length?count/rows.length:0}
}

export function aggregatePoRows(rows=[]){
 const groups=new Map();
 for(const po of Array.isArray(rows)?rows:[]){
  const key=vendorKey(po);
  if(!groups.has(key))groups.set(key,{
   key,
   vendor:clean(po.vendor)||clean(po.source_origin)||'Fournisseur',
   vendorAccount:clean(po.source_vendor_account)||null,
   warehouseIds:new Set(),
   poNumbers:new Set(),
   etaDates:new Set(),
   createdDates:new Set(),
   documents:[],
   lineMap:new Map(),
   controlledLines:0,
   lineCount:0
  });
  const g=groups.get(key);
  g.documents.push(po);
  g.poNumbers.add(clean(po.po_number));
  if(po.source_warehouse_id)g.warehouseIds.add(clean(po.source_warehouse_id));
  if(po.eta)g.etaDates.add(clean(po.eta).slice(0,10));
  if(po.source_created_date)g.createdDates.add(clean(po.source_created_date).slice(0,10));
  for(const line of po.lines||[]){
   g.lineCount++;
   if(line.quality_control_id)g.controlledLines++;
   const lk=lineKey(line);
   if(!g.lineMap.has(lk))g.lineMap.set(lk,{
    key:lk,
    productNumber:clean(line.product_number)||null,
    ean:clean(line.ean)||null,
    productName:clean(line.product_name)||clean(line.product_number)||clean(line.ean)||'Article',
    category:clean(line.category)||'Autre',
    unit:clean(line.purchase_unit)||null,
    poNumbers:new Set(),
    rows:[]
   });
   const item=g.lineMap.get(lk);
   item.poNumbers.add(clean(po.po_number));
   item.rows.push(line)
  }
 }
 return[...groups.values()].map(g=>({
  key:g.key,
  vendor:g.vendor,
  vendorAccount:g.vendorAccount,
  warehouseIds:[...g.warehouseIds],
  poNumbers:[...g.poNumbers].filter(Boolean).sort(),
  etaDates:[...g.etaDates].sort(),
  createdDates:[...g.createdDates].sort(),
  documents:g.documents,
  documentCount:g.documents.length,
  lineCount:g.lineCount,
  controlledLines:g.controlledLines,
  uniqueArticleCount:g.lineMap.size,
  lines:[...g.lineMap.values()].map(item=>{
   const ordered=sumNullable(item.rows,'ordered_qty'),remaining=sumNullable(item.rows,'remaining_qty');
   return{
    key:item.key,
    productNumber:item.productNumber,
    ean:item.ean,
    productName:item.productName,
    category:item.category,
    unit:item.unit,
    poNumbers:[...item.poNumbers].filter(Boolean).sort(),
    sourceLineCount:item.rows.length,
    orderedQty:ordered.value,
    orderedCoverage:ordered.coverage,
    remainingQty:remaining.value,
    remainingCoverage:remaining.coverage,
    controlledLines:item.rows.filter(x=>x.quality_control_id).length
   }
  }).sort((a,b)=>a.productName.localeCompare(b.productName,'fr'))
 })).sort((a,b)=>a.vendor.localeCompare(b.vendor,'fr'))
}

function fmtQty(v){return v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:3})}
function fmtDate(v){if(!v)return'—';const d=new Date(String(v).slice(0,10)+'T12:00:00Z');return Number.isNaN(d.getTime())?esc(v):d.toLocaleDateString('fr-FR')}

export function buildPoPrintHtml({groups=[],storeName='Magasin',title='PO à réceptionner',generatedAt=new Date()}={}){
 const safeGroups=Array.isArray(groups)?groups:[];
 const generated=generatedAt instanceof Date&&!Number.isNaN(generatedAt.getTime())?generatedAt:new Date();
 const groupHtml=safeGroups.map(g=>{
  const rows=(g.lines||[]).map(l=>`<tr>
   <td>${esc((l.poNumbers||[]).join(', '))}</td>
   <td>${esc(l.productNumber||l.ean||'—')}</td>
   <td>${esc(l.productName||'Article')}</td>
   <td>${esc(l.category||'Autre')}</td>
   <td class="num">${fmtQty(l.orderedQty)}</td>
   <td class="num">${fmtQty(l.remainingQty)}</td>
   <td>${esc(l.unit||'—')}</td>
   <td>${Number(l.controlledLines||0)}/${Number(l.sourceLineCount||0)}</td>
  </tr>`).join('');
  return`<section class="supplier">
   <div class="supplier-head">
    <div><h2>${esc(g.vendor||'Fournisseur')}</h2><div class="meta">${g.vendorAccount?`Compte fournisseur ${esc(g.vendorAccount)} · `:''}${Number(g.documentCount||0)} PO · ${Number(g.uniqueArticleCount||0)} article(s) unique(s)</div></div>
    <div class="right"><strong>${esc((g.poNumbers||[]).join(' · '))}</strong><div class="meta">Livraison ${esc((g.etaDates||[]).map(fmtDate).join(' · ')||'—')}</div></div>
   </div>
   <table><thead><tr><th>PO source</th><th>Code article</th><th>Désignation</th><th>Catégorie</th><th>Qté commandée</th><th>Reste à recevoir</th><th>Unité</th><th>Contrôle</th></tr></thead><tbody>${rows||'<tr><td colspan="8">Aucune ligne</td></tr>'}</tbody></table>
   <div class="signature"><span>Réceptionnaire : ____________________</span><span>Date / heure : ____________________</span><span>Signature : ____________________</span></div>
  </section>`
 }).join('');
 return`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page{size:A4 landscape;margin:10mm}
  *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1d1720;margin:0;font-size:10px}
  .top{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #e5004f;padding-bottom:8px;margin-bottom:12px}
  h1{margin:0;font-size:21px}.brand{color:#e5004f;font-weight:900}.meta{color:#665b61;margin-top:3px}.right{text-align:right}
  .supplier{break-inside:avoid;margin:0 0 16px}.supplier+.supplier{break-before:page}.supplier-head{display:flex;justify-content:space-between;gap:20px;margin:0 0 7px}
  h2{margin:0;font-size:15px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cfc6ca;padding:5px 6px;vertical-align:top}
  th{background:#f5eff2;text-align:left;font-size:9px;text-transform:uppercase}.num{text-align:right;white-space:nowrap}
  .signature{display:flex;justify-content:space-between;gap:20px;margin-top:12px;padding-top:9px;border-top:1px solid #cfc6ca;font-weight:700}
  .footer{margin-top:10px;color:#776a70;text-align:right}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
 </style></head><body>
 <div class="top"><div><div class="brand">FRANPRIX · StoreOps</div><h1>${esc(title)}</h1><div class="meta">${esc(storeName)}</div></div><div class="right"><strong>${safeGroups.reduce((s,g)=>s+Number(g.documentCount||0),0)} PO</strong><div class="meta">Généré le ${esc(generated.toLocaleString('fr-FR'))}</div></div></div>
 ${groupHtml||'<p>Aucun PO à imprimer.</p>'}
 <div class="footer">Document de travail StoreOps · aucune écriture D365 déclenchée par l’impression.</div>
 <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));<\/script>
 </body></html>`
}
