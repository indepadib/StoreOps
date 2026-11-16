export function filterAndSortRows(rows, columns, filters, sort){
 const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const active=columns.filter(c=>filters[c.key]?.trim()).map(c=>{
  const query=filters[c.key].trim(), match=query.match(/^(<=|>=|<|>|=)?\s*(-?\d+(?:[.,]\d+)?)$/);
  return {c,query:fold(query),match};
 });
 const result=rows.filter(row=>active.every(({c,query,match})=>{
  const value=c.value(row);
  if(query==='n/a')return value==null;
  if(!c.numeric||!match)return fold(value).includes(query);
  if(value==null)return false;
  const number=Number(match[2].replace(',','.'));
  switch(match[1]){
   case '<':return value<number;
   case '<=':return value<=number;
   case '>':return value>number;
   case '>=':return value>=number;
   default:return value===number;
  }
 }));
 const column=columns.find(c=>c.key===sort.key);
 if(!column)return result;
 return result.sort((a,b)=>{
  const left=column.value(a),right=column.value(b);
  if(left==null)return right==null?0:1;
  if(right==null)return -1;
  const order=column.numeric?left-right:String(left).localeCompare(String(right),'fr',{numeric:true});
  return sort.desc?-order:order;
 });
}
