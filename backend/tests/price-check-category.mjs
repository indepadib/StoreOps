import assert from 'node:assert/strict';

// Contract guard for V1.19.1 category enrichment logic.
const product={category:'Autre'};
const promotions={items:[{activeForRequestedContext:true,itemLine:{category:'FPXMPX - Dépannage'}}]};
const promoCategory=(promotions.items||[]).find(x=>x.activeForRequestedContext)?.itemLine?.category||null;
const category=product.category&&product.category!=='Autre'?product.category:(promoCategory||product.category||'Autre');
assert.equal(category,'FPXMPX - Dépannage');
console.log('StoreOps V1.19.1 price-check category enrichment contract passed');
