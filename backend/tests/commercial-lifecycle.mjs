import assert from 'node:assert/strict';
import { previousBusinessDay, offerEndedYesterday, resolveStorePriceGroup } from '../services/dynamics.mjs';

assert.equal(previousBusinessDay('2026-09-05'),'2026-09-04');
assert.equal(previousBusinessDay('2026-03-01'),'2026-02-28');

const ended={Status:'Disabled',ProcessingStatus:'Processed',ValidFrom:'2026-08-01T12:00:00Z',ValidTo:'2026-09-04T12:00:00Z'};
assert.equal(offerEndedYesterday(ended,'2026-09-05'),true,'an offer ending yesterday must generate a removal action today even if disabled afterwards');
assert.equal(offerEndedYesterday(ended,'2026-09-04'),false,'the offer must remain valid on its inclusive ValidTo date');
assert.equal(offerEndedYesterday({...ended,ProcessingStatus:'Draft'},'2026-09-05'),false,'unprocessed offers must never generate operational actions');
assert.equal(offerEndedYesterday({...ended,ValidTo:'1900-01-01T12:00:00Z'},'2026-09-05'),false,'open-ended sentinel dates must not generate a promo end');
assert.equal(resolveStorePriceGroup('val-fleuri'),'Franprix');

console.log('StoreOps V1.21.1 commercial lifecycle tests passed');
