function isActionableChange(c){if(!c?.sourceKey||!c?.ean||!c?.productName)return false;const actionType=c.actionType||'VERIFY',priority=c.priority||'NORMAL';if(c.source==='D365_RETAIL_PRICING'&&actionType==='VERIFY'&&priority!=='CRITICAL')return false;return true}
function ok(v,m){if(!v)throw new Error(m)}
ok(!isActionableChange({sourceKey:'D365-PROMO-1',ean:'1',productName:'A',source:'D365_RETAIL_PRICING',actionType:'VERIFY',priority:'HIGH'}),'ongoing high promotion must not create a daily task');
ok(isActionableChange({sourceKey:'D365-PROMO-2',ean:'2',productName:'B',source:'D365_RETAIL_PRICING',actionType:'VERIFY',priority:'CRITICAL'}),'critical pricing inconsistency must remain actionable');
ok(isActionableChange({sourceKey:'D365-PROMO-3',ean:'3',productName:'C',source:'D365_RETAIL_PRICING',actionType:'PROMO_START',priority:'HIGH'}),'promotion start must remain actionable');
ok(isActionableChange({sourceKey:'D365-PRICE-4',ean:'4',productName:'D',source:'D365_RETAIL_PRICING',actionType:'PRICE_CHANGE',priority:'HIGH'}),'price change must remain actionable');
console.log('StoreOps V1.18.1 commercial operational filtering tests passed');
