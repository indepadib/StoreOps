import {staffingSummary} from './staffing.mjs';
import {coldChainSummary} from './cold-chain.mjs';
import {cashOpeningSummary} from './cash-opening.mjs';
import {lossSummary} from './loss.mjs';
import {peekBusinessPulse} from './business-pulse.mjs';

// Central network overview uses local facts and existing sales cache only.
export function networkControlSnapshot(storeId,businessDate){
 return{staffing:staffingSummary(storeId,businessDate),coldChain:coldChainSummary(storeId,businessDate),cashOpening:cashOpeningSummary(storeId,businessDate),loss:lossSummary(storeId,businessDate),businessPulse:peekBusinessPulse(storeId,businessDate),snapshotAt:new Date().toISOString(),dataHealth:{network:true}};
}
