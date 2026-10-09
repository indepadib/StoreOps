# Recent commercial actions

Store queues show events for today and the previous two business dates. An event has an immutable date: promo start date, the day after its inclusive end date, effective price date, or the date a genuine source fingerprint change was detected. Synchronization never renews that window. Old first-seen promotions are baseline references, not new actions.

The same recent queue feeds commercial controls, Today, inbox counts and opening blockers. Repeated daily snapshots are deduplicated. Verified events leave the queue and do not return after a periodic cooldown; an actual source change can reopen them. Old events leave the queue even if unverified. Stored controls and independent incident history are not marked resolved or deleted by ageing.

Trade agreements and base-price reads cover three days. Promo end reads cover three inclusive event days, beginning after ValidTo. Source state and controls gain additive event metadata; existing records are retained. Synthetic regression tests cover boundary dates, source baselining, repeated refresh, verification, changed prices and re-entry.
