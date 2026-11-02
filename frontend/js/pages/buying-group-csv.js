export function parsePurchaseCSV(text){
  const raw=String(text??'').replace(/^\uFEFF/,'');
  if(raw.length>500000)throw Error('Fichier CSV trop volumineux.');
  const first=raw.split(/\r?\n/).find(x=>x.trim())||'';
  const options=[';',',','\t'];const sep=options.sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  const table=[];let row=[],cell='',quotes=false;
  for(let i=0;i<raw.length;i++){
    const ch=raw[i],next=raw[i+1];
    if(ch==='"'){
      if(quotes&&next==='"'){cell+='"';i++;}else quotes=!quotes;
    }else if(ch===sep&&!quotes){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quotes){
      if(ch==='\r'&&next==='\n')i++;
      row.push(cell);cell='';
      if(row.some(x=>String(x).trim()))table.push(row);
      row=[];
    }else cell+=ch;
  }
  if(quotes)throw Error('Guillemets non fermés dans le CSV.');
  row.push(cell);if(row.some(x=>String(x).trim()))table.push(row);
  if(table.length<2)throw Error('Le CSV doit contenir un en-tête et des lignes.');
  const header=table.shift().map(x=>String(x).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s-]/g,'_'));
  const col=(...names)=>header.findIndex(h=>names.includes(h));
  const indices={
    reference:col('reference','document','document_reference','invoice','facture','numero_facture','invoicenumber','vendorinvoicenumber'),
    line:col('ligne','line','line_id','linekey'),
    date:col('date','date_facture','invoicedate','invoice_date','documentdate'),
    netAmount:col('montant_ht','montant_net','amount','netamount','amount_ht','invoiceamount','net_amount'),
    vendorAccount:col('compte_fournisseur','vendor','vendoraccount','vendoraccountnumber','supplieraccount'),
    description:col('description','libelle','designation')
  };
  if(indices.reference<0||indices.date<0||indices.netAmount<0)
    throw Error('Colonnes requises : reference ; date ; montant_ht. Facultatives : ligne, compte_fournisseur, description.');
  if(table.length>200)throw Error('Maximum 200 lignes par import. Découper le CSV en plusieurs fichiers.');
  const parsed=table.map((cells,i)=>{
    const take=k=>indices[k]>=0?String(cells[indices[k]]??'').trim():'';
    const date=take('date'),source=take('netAmount').replace(/\s/g,'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Date à la ligne '+(i+2)+' : utiliser AAAA-MM-JJ.');
    const netAmount=source.includes(',')&&source.includes('.')?source:source.replace(',','.');
    if(!/^-?\d{1,11}(?:\.\d{1,2})?$/.test(netAmount))throw Error('Montant HT invalide à la ligne '+(i+2)+'.');
    return{reference:take('reference'),line:take('line')||'0',date,netAmount,vendorAccount:take('vendorAccount'),description:take('description')};
  });
  const uniq=new Set();
  for(let i=0;i<parsed.length;i++){
    const row=parsed[i],k=row.reference.trim().toUpperCase()+'#'+row.line.trim().toUpperCase();
    if(!row.reference||uniq.has(k))throw Error('Référence/ligne vide ou répétée : '+k+' (CSV ligne '+(i+2)+').');
    uniq.add(k);
  }
  return parsed;
}
