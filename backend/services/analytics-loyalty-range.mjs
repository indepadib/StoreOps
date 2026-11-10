import {readCustomerCreations} from './dynamics-customer-creations.mjs';
import {storeOperationalSettings} from './store-settings.mjs';

export async function readLoyaltyRange(stores,period={}) {
 // No legacy enrollment cache: its values cannot be reconciled with account creations.
 return readCustomerCreations((stores||[]).map(s=>({...s,unit:storeOperationalSettings(s.id)?.d365?.operatingUnitNumber})),period);
}
