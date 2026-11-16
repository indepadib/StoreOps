const finite=Number.isFinite;
const sum=(rows,key)=>rows.length&&rows.every(row=>finite(row[key]))?rows.reduce((total,row)=>total+row[key],0):null;
const rate=(amount,base)=>finite(amount)&&finite(base)&&base>0?amount/base*100:null;

export function summarizeCategories(rows){
 const sales=sum(rows,'sales'),previousSales=sum(rows,'previousSales');
 const delta=finite(sales)&&finite(previousSales)?sales-previousSales:null;
 const marginRows=rows.filter(row=>finite(row.marginValue)&&finite(row.marginSalesBase)&&row.marginSalesBase>0);
 const marginValue=sum(marginRows,'marginValue'),marginBase=sum(marginRows,'marginSalesBase');
 return {sales,previousSales,delta,change:rate(delta,previousSales),marginValue,marginRate:rate(marginValue,marginBase),
  marginRows:marginRows.length,estimated:marginRows.some(row=>row.marginEstimated),rows:rows.length};
}

export function contributions(rows){
 const change=row=>finite(row.deltaSales)?row.deltaSales:null;
 const increase=rows.reduce((total,row)=>total+Math.max(0,change(row)??0),0);
 const decrease=rows.reduce((total,row)=>total+Math.max(0,-(change(row)??0)),0);
 return rows.map(row=>{
  const delta=change(row);
  return {...row,changeContribution:finite(delta)&&delta!==0?rate(Math.abs(delta),delta>0?increase:decrease):null};
 });
}
