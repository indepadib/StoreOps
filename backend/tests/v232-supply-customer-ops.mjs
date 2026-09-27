import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const repl=read('frontend/js/manager-replenishment-v2.js');
const stock=read('backend/services/stock-signals.mjs');
const warehouse=read('frontend/js/warehouse-control.js');
const warehouseBackend=read('backend/services/warehouse-control.mjs');
const pulse=read('frontend/js/pages/manager-performance.js');
const sales=read('backend/services/dynamics-sales.mjs');
const network=read('frontend/js/pages/network.js');
const entry=read('frontend/js/enhancements-entry.js');
const loyalty=read('backend/services/dynamics-loyalty.mjs');
const permissions=read('backend/services/permissions.mjs');

assert.match(repl,/function signalKey\(r\)/);
assert.match(repl,/data-repl2-key/);
assert.match(repl,/function rowByKey\(key\)/);
assert.doesNotMatch(repl,/function rowByEan/);
assert.match(repl,/groupedBatch/);
assert.match(repl,/PO fournisseur/);
assert.match(repl,/SUPPLY_CHECK/);

assert.match(stock,/supplyWarehouseForStore/);
assert.match(stock,/supplierHistory/);
assert.match(stock,/type:'LOW'/);
assert.match(stock,/coverageDays/);
assert.match(stock,/centralStock/);

assert.match(warehouseBackend,/warehouseControlSnapshot/);
assert.match(warehouseBackend,/supplierGroups/);
assert.match(warehouseBackend,/transferGroups/);
assert.match(warehouse,/ENTREPÔT & APPROVISIONNEMENT/);
assert.match(warehouse,/Achats fournisseurs consolidés/);
assert.match(entry,/warehouse-control\.js/);

assert.match(sales,/identifiedSalesShare/);
assert.match(sales,/nonLoyaltyTickets/);
assert.match(pulse,/Poids CA encarté/);
assert.match(pulse,/Recrutement \/ non fidélité/);
assert.match(pulse,/Uplift panier encarté/);
assert.match(pulse,/Proches ruptures/);
assert.match(pulse,/Articles vendus/);
assert.doesNotMatch(pulse,/<span>Marge<\/span>/,'store performance dashboard must not expose unvalidated margin');
assert.match(network,/calculateCustomerWeightedScore/);
assert.match(network,/Customer & fidélité jusqu’à 25%/);
assert.match(network,/CA réseau aujourd’hui/);
assert.match(network,/Ruptures \/ proches/);
assert.match(loyalty,/LoyaltyEnrollmentDate/);
assert.match(loyalty,/OmOperatingUnitNumber/);
assert.match(permissions,/canAccessWarehouse/);
assert.match(permissions,/supply_chain/);

console.log('V2.32 StoreOps supply, warehouse and customer operating system contract OK');
