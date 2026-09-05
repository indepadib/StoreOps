export const DEFAULT_INVENTORY_COUNTING_POLICY=Object.freeze({blindFirstCount:true,blindRecount:true,recountDifferentCounterRecommended:true});

export function inventoryLinePresentation(line,policy=DEFAULT_INVENTORY_COUNTING_POLICY){
 const p={...DEFAULT_INVENTORY_COUNTING_POLICY,...(policy||{})};
 const firstBlind=line?.status==='TO_COUNT'&&p.blindFirstCount;
 const recountBlind=line?.status==='RECOUNT'&&p.blindRecount;
 const blind=firstBlind?'FIRST':recountBlind?'RECOUNT':null;
 const variance=line?.final_variance??line?.variance1;
 return{
  blind,
  theoretical:blind?null:line?.theoretical_qty,
  count1:blind?null:line?.count1_qty,
  count1By:blind?null:line?.count1_by_name,
  variance:blind?null:variance,
  final:blind?null:(line?.count2_qty??line?.final_qty),
  showReason:!blind,
  message:firstBlind?'Comptage aveugle : le stock Dynamics est masqué jusqu’à la validation du 1er comptage.':recountBlind?'Recomptage aveugle : le stock Dynamics et le 1er comptage restent masqués jusqu’à validation.':null
 };
}
