# Cool & Save — operating model V0

Status: DESIGN_BASELINE. The three commercial basket types are intentionally left configurable until business definitions are supplied.

## Principle

Cool & Save is an external customer-facing app. StoreOps is the store execution and orchestration layer. Dynamics 365 remains the stock and financial source of truth.

Never model a customer purchase as a simple loss/demerit if it is a sale. The target flow must preserve one commercial sale and one stock movement.

## Target lifecycle

1. OFFER
   - StoreOps publishes a Cool & Save offer for a store.
   - Offer has basket type, selling price, quantity available, pickup window and business rules.
   - Contents can be partially or fully dynamic depending on basket type.

2. EXTERNAL PURCHASE
   - Customer pays in the Cool & Save app.
   - App sends an idempotent order event to StoreOps:
     externalOrderId, storeId, basketType, amountPaid, paymentReference, paidAt, pickupWindow.
   - StoreOps state: RECEIVED_PAID.
   - No physical stock issue is posted yet if the real component SKUs are not known.

3. STORE PREPARATION
   - StoreOps creates a picking mission.
   - Employee selects/scans the real articles that compose the basket.
   - Every component stores: product label, item number, EAN, quantity, unit, lot/DLC when relevant.
   - Eligibility rules block expired products and enforce basket-type rules.
   - StoreOps calculates the reference value and checks the commercial rule.

4. D365 RESERVATION / CUSTOMER ORDER
   - Once composition is validated, StoreOps prepares a Dynamics customer order for store pickup containing the real component items.
   - The order carries the Cool & Save external reference.
   - Paid amount must be represented as an existing/prepaid payment or approved tender mapping so POS does not collect the customer a second time.
   - Order must be assigned to the pickup store.
   - StoreOps state becomes ERP_READY only after the ERP reference exists.
   - When supported/configured, Dynamics reserves the real item quantities.

5. READY FOR PICKUP
   - StoreOps shows pickup code, customer-facing order reference, preparation time and SLA.
   - Basket cannot be marked READY if the Dynamics order or required financial mapping failed.
   - Glovo/other availability can be recomputed after the reservation to avoid overselling the same stock.

6. PICKUP / POS
   - Cashier recalls the Dynamics customer order or uses order fulfillment.
   - Actual lines and quantities are visible.
   - If the external payment is correctly represented, amount due should be zero or only the approved residual.
   - POS pickup completes the transaction and triggers Dynamics inventory/financial posting.
   - StoreOps state: PICKED_UP / CLOSED only after confirmation.

7. CANCEL / NO-SHOW
   - Before D365 fulfillment: release reservations and return eligible components to normal availability.
   - If refund is required: state REFUND_PENDING until payment system confirmation.
   - Never silently cancel stock movements separately from the commercial order.

## Data model separation

### Offer
Commercial product offered in the app.
- offerId
- storeId
- basketType
- price
- availableBasketQty
- pickupWindow
- published/paused/soldOut

### External order
Customer purchase.
- externalOrderId (unique / idempotency key)
- offerId
- storeId
- basketType
- amountPaid
- paymentStatus
- paymentReference
- orderStatus
- pickupCode
- d365OrderId
- timestamps

### Fulfillment component
Real article placed in the basket.
- productName
- productNumber
- EAN
- qty
- unit
- lot
- expiryDate
- source (DLC, slow mover, manual)
- referenceValue

## Suggested state machine

RECEIVED_PAID
→ PREPARING
→ COMPOSITION_VALIDATED
→ ERP_READY
→ READY_FOR_PICKUP
→ PICKED_UP
→ CLOSED

Exception states:
ERP_BLOCKED
CANCEL_PENDING
CANCELLED
REFUND_PENDING
REFUNDED
NO_SHOW

## D365 design decision to validate

Preferred baseline:
- Customer order / store pickup with the actual component SKUs.
- External Cool & Save payment represented on the order so no second payment is taken at pickup.
- Discount/price allocation must be validated with Finance/Tax because the basket selling price may differ from the sum of item prices.
- Do not use an inventory loss journal to represent a customer sale.

Alternative to evaluate after the three basket types are known:
- Dynamics Commerce retail product kits can represent a sellable kit with component products and configured substitutions.
- This is appropriate only if the three basket types have sufficiently stable component slots/configurations. Highly dynamic daily baskets should remain actual-item customer orders rather than forcing hundreds of kit configurations.

## StoreOps UI

### Incoming orders
Paid / to prepare / late / ready / pickup today.

### Preparation screen
One order, one task:
- basket type
- promised pickup window
- target value/rules
- scan actual products
- remaining rule to satisfy
- validate composition

### Pickup
Scan pickup QR/code → show customer order + D365 reference → open POS instruction → confirm Dynamics pickup result.

## Non-negotiable controls

- externalOrderId unique
- no duplicate order from webhook retries
- no expired product
- no READY without actual component lines
- no READY without ERP-ready state once D365 integration is enabled
- payment reference retained
- every article always shown as label + product number + EAN when known
- every lifecycle transition audited with user/time/evidence where required
- no direct stock decrement in StoreOps
