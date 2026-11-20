# Security Specification — Bishal Roshni Kirana Pasal ERP

## 1. Data Invariants
1. **Closed Multi-Store Staff Boundary**: No unauthenticated or uninvited external Google user may read or write any business, product, customer, supplier, financial, or inventory document. Only the bootstrapped owner (`upretibishal19@gmail.com` with verified email) or active staff registered in `/employees/{uid}` may access business data.
2. **No Self-Assigned Privileges**: A non-owner user cannot create or update their own `/employees/{uid}` record to set `role: 'owner'` or elevate `permissions`. Only `isOwner()` can create/modify `/employees/{uid}` or `/employeeInvites/{inviteId}` (except an invited user claiming their exact pre-authorized invite without changing role/permissions).
3. **Immutable Financial & Stock Ledgers**: `/stockLedger`, `/customerCreditLedger`, `/supplierPayments`, `/wasteRecords`, and `/auditLogs` are strictly append-only (`allow update, delete: if false`).
4. **No Silent Sales Deletion or Overwrite**: `/salesInvoices` cannot be deleted (`allow delete: if false`). Confirmed invoices may only transition to `reversed` once by an authorized user with `canReverseSales` or `owner`/`store_manager`, recording `reversedByUid == request.auth.uid`.
5. **Approval Gates**: `/stockCounts` cannot jump from `approved` back to `draft` (terminal state locking). `/stockTransfers` only transition from `dispatched` to `received` or `cancelled`. `/goodsReceipts` only transition from `pending_approval` to `approved`.
6. **Temporal & Structural Integrity**: All `create` writes enforce `createdAt == request.time`, `keys().hasAll(...)`, `keys().hasOnly(...)`, `.size()` bounds on every string/list, and `isValidId()` on single-document operations.

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Read**: Anonymous request reading `/products` or `/salesInvoices` -> Denied.
2. **Unverified Email Spoof**: Auth token with `email: 'upretibishal19@gmail.com'` and `email_verified: false` -> Denied.
3. **External User Read**: Signed-in Google user not in `/employees` listing `/customers` -> Denied.
4. **Privilege Escalation**: Cashier updating `/employees/{cashierUid}` with `{ role: 'owner' }` -> Denied.
5. **Shadow Field Injection**: Creating `/products/RICE001` with extra ghost field `isAdminApproved: true` -> Denied by `keys().hasOnly()`.
6. **Ledger Tampering (Update)**: Updating `qtyDelta` on `/stockLedger/{id}` -> Denied (`allow update: if false`).
7. **Ledger Tampering (Delete)**: Deleting a `/customerCreditLedger/{id}` entry -> Denied (`allow delete: if false`).
8. **Silent Invoice Deletion**: Deleting `/salesInvoices/{id}` -> Denied (`allow delete: if false`).
9. **Terminal State Re-open**: Updating an `approved` `/stockCounts/{id}` back to `draft` -> Denied.
10. **ID Poisoning**: Creating `/products/<200-char-invalid-id>` -> Denied by `isValidId()`.
11. **Backdated Timestamp Spoof**: Creating `/stockLedger/{id}` with client-supplied `createdAt` != `request.time` -> Denied.
12. **Actor Spoofing**: Creating `/stockLedger/{id}` with `actorUid` != `request.auth.uid` -> Denied.
13. **Day Close Tampering / Non-Owner Verify**: Deleting `/dayCloses/{id}`, modifying closed financial totals, or verifying a `dayClose` as a non-owner -> Denied.
14. **Combo Offer Tampering**: Deleting `/comboOffers/{id}`, modifying `offerCode` or `createdByUid`, or creating a combo offer as a delivery driver or uninvited user -> Denied.
