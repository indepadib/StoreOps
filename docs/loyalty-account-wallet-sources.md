# Loyalty source validation — 2026-11-23

Three-month read-only reconciliation (2026-08-25 through 2026-11-22): 5,199 accounts created, of which 432 unattributed; Earn 43,579.37 MAD (Val Fleuri 28,450.94; Trèfle 15,128.43). The browser loader's seven disjoint 14-day windows produced exactly the same totals as a single complete read. Cold duration in this test: 33.8 seconds overall versus 55.3 seconds for the single request; individual requests stay bounded and display progress. Repeated identical windows use persistent cache. This is an improvement, not a claim of instant cold three-month reads.

Read-only production D365 authentication and OData discovery succeeded. No Power BI model was available locally; these checks validate D365 directly, not parity with an unseen Power BI calculation.

## Customer account creations

`CustTableCDREntities.SysCreatedDateTime` is present and filterable. Samples agree with `CreatedDateTime1` in the same entity and `CustTableBiEntities.CreatedDateTime1`. Scope: configured legal entity (`SysDataAreaId`), `CustGroup = Retail`, distinct `(company, AccountNum)`, true creation timestamp within the selected business days in `Africa/Casablanca` (runtime timezone database). Requests are split into 14-day windows to avoid source timeouts; results are deduplicated across all windows.

The native creation source has no verified creation-store field. Attribution follows `Party` → `DirPartyTableBiEntities.SourceKey/PartyNumber` → earliest `RetailLoyaltyCards.LoyaltyEnrollmentDate/OmOperatingUnitNumber`. This uses the card only for store attribution, never to determine account creation. Multiple cards count once. Ties across units or missing links remain unattributed. A store selection cannot move an account from its original owner. Network counts include unattributed accounts only when the caller can access and selects all active stores; restricted scopes receive only attributed counts with an incomplete-attribution warning.

Read-only reconciliation, 2026-11-01 through 2026-11-22: 707 distinct Retail accounts created; 357 attributed to Val Fleuri, 198 to Trèfle, 152 unattributed. These store allocations are derived from first-card ownership, not certified native creation-store values.

## Wallet Earn

Source: `RetailLoyaltyCardRewardPointTransactionV2`, fields `EntryDate`, `EntryType`, `RewardPointId`, `RewardPointAmountQty`, company and operating unit. `EntryDate` is the D365 business date (observed as noon). Include only Earn entries and definitions from `RetailLoyaltyRewardPoints` explicitly marked `Amount`, `MAD`, redeemable. Observed monetary definition: `HSRG Loyalty Rewards`. Sum signed amounts, including negative reversals; exclude nonmonetary points and other entry types. Deduplicate transaction identities, fail on conflicting duplicates or incomplete pages. Burn remains sourced independently from Wallet tender payments.

Same period: Val Fleuri 6,791.30 MAD (19,443 Earn entries); Trèfle 2,859.25 MAD (8,833 Earn entries); network 9,650.55 MAD. This is the monetary Earn journal, not the remaining balance or tender amount.

## Safeguards

Follow opaque source pagination to completion, with a 100,000-row safety cap. Incomplete or failed sources yield null, never zero. Cache namespace v4 includes tenant, company, mode, stores and operating-unit mappings, dates and network scope. Failed sources are not persisted; successful exact-range results expire within 30 minutes. The old fixed N/D cards are replaced by live values and source/attribution status.
