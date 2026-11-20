import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase';
import { addDaysBs, bsToAd, todayAd, todayBs } from './bsDate';
import {
  BOOTSTRAPPED_OWNER_EMAIL,
  BUSINESS_ID,
  DEFAULT_ROLE_PERMISSIONS,
  type BaseUnit,
  type BusinessSettings,
  type ComboOffer,
  type ComboOfferItem,
  type ComboOfferType,
  type Customer,
  type DayClose,
  type Employee,
  type EmployeeInvite,
  type EmployeeRole,
  type ExpenseCategory,
  type GoodsReceipt,
  type OnlineOrder,
  type OnlineOrderItem,
  type OnlineOrderStatus,
  type PaymentAllocation,
  type PaymentAllocationMethod,
  type PaymentMethod,
  type Product,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type RolePermissions,
  type SalesChannel,
  type SalesInvoice,
  type SalesLineItem,
  type StockBatch,
  type StockCount,
  type StockCountLine,
  type StockTransfer,
  type Supplier,
  type TaxMode,
  type TaxType,
} from '../types/erp';

function cleanId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function omitEmpty<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') {
      result[k] = v;
    }
  }
  return result as T;
}

export async function appendAuditLog(
  actor: Employee,
  action: string,
  entityType: string,
  entityId: string,
  summary: string
): Promise<void> {
  const id = cleanId('aud');
  try {
    await setDoc(doc(db, 'auditLogs', id), {
      businessId: BUSINESS_ID,
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: action.slice(0, 80),
      entityType: entityType.slice(0, 60),
      entityId: entityId.slice(0, 128),
      summary: summary.slice(0, 300),
      bsDate: todayBs(),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `auditLogs/${id}`);
  }
}

export async function bootstrapUserAndWorkspace(user: User): Promise<Employee | null> {
  const emailLower = (user.email || '').toLowerCase();
  const empRef = doc(db, 'employees', user.uid);
  try {
    const empSnap = await getDoc(empRef);
    let activeEmployee: Employee | null = null;

    if (empSnap.exists()) {
      activeEmployee = { id: empSnap.id, ...(empSnap.data() as Omit<Employee, 'id'>) };
    } else if (emailLower === BOOTSTRAPPED_OWNER_EMAIL) {
      const ownerPayload: Record<string, unknown> = {
        businessId: BUSINESS_ID,
        uid: user.uid,
        email: emailLower,
        displayName: user.displayName || 'Bishal Upreti (Owner)',
        role: 'owner' as EmployeeRole,
        permissions: DEFAULT_ROLE_PERMISSIONS.owner,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(empRef, ownerPayload);
      activeEmployee = {
        id: user.uid,
        businessId: BUSINESS_ID,
        uid: user.uid,
        email: emailLower,
        displayName: user.displayName || 'Bishal Upreti (Owner)',
        role: 'owner',
        permissions: DEFAULT_ROLE_PERMISSIONS.owner,
        active: true,
      };
    } else if (emailLower) {
      const inviteSnap = await getDoc(doc(db, 'employeeInvites', emailLower));
      if (inviteSnap.exists()) {
        const invite = inviteSnap.data() as EmployeeInvite;
        if (invite.active) {
          const claimedPayload = omitEmpty({
            businessId: BUSINESS_ID,
            uid: user.uid,
            email: emailLower,
            displayName: invite.displayName || user.displayName || emailLower,
            phone: invite.phone,
            role: invite.role,
            storeId: invite.storeId,
            permissions: invite.permissions,
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await setDoc(empRef, claimedPayload);
          activeEmployee = {
            id: user.uid,
            businessId: BUSINESS_ID,
            uid: user.uid,
            email: emailLower,
            displayName: String(claimedPayload.displayName),
            phone: invite.phone,
            role: invite.role,
            storeId: invite.storeId,
            permissions: invite.permissions,
            active: true,
          };
        }
      }
    }

    if (activeEmployee && activeEmployee.role === 'owner') {
      const settingsRef = doc(db, 'settings', 'global');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, {
          businessId: BUSINESS_ID,
          businessName: 'Bishal Roshni Kirana Pasal',
          businessNameNe: 'बिशाल रोशनी किराना पसल',
          panVatNo: '',
          taxMode: 'vat_13',
          defaultVatRate: 13,
          smallRetailThreshold: 500,
          allowAnonymousRetail: true,
          fiscalYearStartMonth: 4,
          updatedAt: serverTimestamp(),
        });
      }

      const storesSnap = await getDocs(
        query(collection(db, 'stores'), where('businessId', '==', BUSINESS_ID))
      );
      if (storesSnap.empty) {
        await setDoc(doc(db, 'stores', 'store_main'), {
          businessId: BUSINESS_ID,
          code: 'MAIN-01',
          name: 'Main Supermarket Store',
          nameNe: 'मुख्य सुपरमार्केट शाखा',
          address: 'Kathmandu, Nepal',
          taxMode: 'vat_13',
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    return activeEmployee;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `employees/${user.uid}`);
  }
}

export async function saveBusinessSettings(
  actor: Employee,
  data: Omit<BusinessSettings, 'id' | 'businessId' | 'updatedAt'>
): Promise<void> {
  try {
    await setDoc(
      doc(db, 'settings', 'global'),
      omitEmpty({
        businessId: BUSINESS_ID,
        businessName: data.businessName,
        businessNameNe: data.businessNameNe,
        panVatNo: data.panVatNo,
        taxMode: data.taxMode,
        defaultVatRate: Number(data.defaultVatRate),
        smallRetailThreshold: Number(data.smallRetailThreshold),
        allowAnonymousRetail: Boolean(data.allowAnonymousRetail),
        fiscalYearStartMonth: Number(data.fiscalYearStartMonth),
        updatedAt: serverTimestamp(),
      })
    );
    await appendAuditLog(actor, 'UPDATE_SETTINGS', 'settings', 'global', 'Updated business settings');
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/global');
  }
}

export async function saveStore(
  actor: Employee,
  store: {
    id?: string;
    code: string;
    name: string;
    nameNe?: string;
    address: string;
    phone?: string;
    panVatNo?: string;
    taxMode: TaxMode;
    active: boolean;
  }
): Promise<string> {
  const id = store.id || cleanId('store');
  const ref = doc(db, 'stores', id);
  try {
    if (store.id) {
      await updateDoc(
        ref,
        omitEmpty({
          name: store.name,
          nameNe: store.nameNe,
          address: store.address,
          phone: store.phone,
          panVatNo: store.panVatNo,
          taxMode: store.taxMode,
          active: store.active,
          updatedAt: serverTimestamp(),
        })
      );
      await appendAuditLog(actor, 'UPDATE_STORE', 'store', id, `Updated store ${store.name}`);
    } else {
      await setDoc(
        ref,
        omitEmpty({
          businessId: BUSINESS_ID,
          code: store.code.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
          name: store.name,
          nameNe: store.nameNe,
          address: store.address,
          phone: store.phone,
          panVatNo: store.panVatNo,
          taxMode: store.taxMode,
          active: store.active,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
      await appendAuditLog(actor, 'CREATE_STORE', 'store', id, `Created store ${store.name} (${store.code})`);
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `stores/${id}`);
  }
}

export async function saveProduct(
  actor: Employee,
  existingProducts: Product[],
  product: {
    id?: string;
    itemCode: string;
    barcode?: string;
    name: string;
    nameNe?: string;
    category: string;
    subcategory?: string;
    brand?: string;
    baseUnit: BaseUnit;
    purchasePrice: number;
    sellingPrice: number;
    wholesalePrice: number;
    taxType: TaxType;
    minStock: number;
    maxStock: number;
    defaultSupplierId?: string;
    tracksExpiry: boolean;
    defaultExpiryDateBs?: string;
    status: 'active' | 'inactive';
  }
): Promise<string> {
  const normalizedCode = product.itemCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!normalizedCode) {
    throw new Error('Item code must contain alphanumeric characters (e.g. RICE001).');
  }
  const duplicate = existingProducts.find(
    (p) => p.itemCode === normalizedCode && p.id !== product.id
  );
  if (duplicate) {
    throw new Error(`Duplicate item code "${normalizedCode}" already exists for ${duplicate.name}.`);
  }

  const id = product.id || `prod_${normalizedCode}`;
  const ref = doc(db, 'products', id);
  try {
    if (product.id) {
      await updateDoc(
        ref,
        omitEmpty({
          barcode: product.barcode,
          name: product.name,
          nameNe: product.nameNe,
          category: product.category,
          subcategory: product.subcategory,
          brand: product.brand,
          baseUnit: product.baseUnit,
          purchasePrice: Number(product.purchasePrice),
          sellingPrice: Number(product.sellingPrice),
          wholesalePrice: Number(product.wholesalePrice),
          taxType: product.taxType,
          minStock: Number(product.minStock),
          maxStock: Number(product.maxStock),
          defaultSupplierId: product.defaultSupplierId,
          tracksExpiry: product.tracksExpiry,
          defaultExpiryDateBs: product.defaultExpiryDateBs,
          status: product.status,
          updatedAt: serverTimestamp(),
        })
      );
      await appendAuditLog(actor, 'UPDATE_PRODUCT', 'product', id, `Updated product ${normalizedCode} (${product.name})`);
    } else {
      await setDoc(
        ref,
        omitEmpty({
          businessId: BUSINESS_ID,
          itemCode: normalizedCode,
          barcode: product.barcode,
          name: product.name,
          nameNe: product.nameNe,
          category: product.category,
          subcategory: product.subcategory,
          brand: product.brand,
          baseUnit: product.baseUnit,
          purchasePrice: Number(product.purchasePrice),
          sellingPrice: Number(product.sellingPrice),
          wholesalePrice: Number(product.wholesalePrice),
          taxType: product.taxType,
          minStock: Number(product.minStock),
          maxStock: Number(product.maxStock),
          defaultSupplierId: product.defaultSupplierId,
          tracksExpiry: product.tracksExpiry,
          defaultExpiryDateBs: product.defaultExpiryDateBs,
          status: product.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
      await appendAuditLog(actor, 'CREATE_PRODUCT', 'product', id, `Created product ${normalizedCode} (${product.name})`);
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `products/${id}`);
  }
}

export async function toggleProductStatus(
  actor: Employee,
  product: Product
): Promise<void> {
  const nextStatus = product.status === 'active' ? 'inactive' : 'active';
  try {
    await updateDoc(doc(db, 'products', product.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
    await appendAuditLog(
      actor,
      nextStatus === 'active' ? 'REACTIVATE_PRODUCT' : 'DEACTIVATE_PRODUCT',
      'product',
      product.id,
      `Set ${product.itemCode} status to ${nextStatus}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `products/${product.id}`);
  }
}

export async function recordOpeningOrAdjustmentStock(
  actor: Employee,
  params: {
    storeId: string;
    product: Product;
    movementType: 'opening' | 'manual_adjustment' | 'customer_return' | 'supplier_return';
    qtyDelta: number;
    unitCost: number;
    batchNo: string;
    expiryDateBs?: string;
    reason: string;
    bsDate: string;
  }
): Promise<void> {
  const { storeId, product, movementType, qtyDelta, unitCost, batchNo, expiryDateBs, reason, bsDate } = params;
  if (qtyDelta === 0) throw new Error('Quantity cannot be zero.');

  try {
    await runTransaction(db, async (tx) => {
      const batchesQuery = query(
        collection(db, 'stockBatches'),
        where('businessId', '==', BUSINESS_ID),
        where('storeId', '==', storeId),
        where('productId', '==', product.id)
      );
      const batchSnap = await getDocs(batchesQuery);
      const storeBatches = batchSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<StockBatch, 'id'>) }))
        .sort((a, b) => (a.expiryDateAd || '9999-12-31').localeCompare(b.expiryDateAd || '9999-12-31'));

      if (qtyDelta > 0) {
        const batchId = cleanId('batch');
        const ledgerId = cleanId('led');
        const expiryDateAd = expiryDateBs ? bsToAd(expiryDateBs) : undefined;
        tx.set(
          doc(db, 'stockBatches', batchId),
          omitEmpty({
            businessId: BUSINESS_ID,
            storeId,
            productId: product.id,
            itemCode: product.itemCode,
            batchNo: batchNo || `BATCH-${bsDate}`,
            expiryDateBs,
            expiryDateAd,
            unitCost,
            qtyReceived: qtyDelta,
            qtyRemaining: qtyDelta,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
        tx.set(doc(db, 'stockLedger', ledgerId), {
          businessId: BUSINESS_ID,
          storeId,
          productId: product.id,
          itemCode: product.itemCode,
          productName: product.name,
          batchId,
          movementType,
          qtyDelta,
          unitCost,
          totalValue: Number((qtyDelta * unitCost).toFixed(2)),
          referenceType: movementType,
          referenceId: batchId,
          referenceNo: batchNo || `ADJ-${bsDate}`,
          reason,
          actorUid: actor.uid,
          actorName: actor.displayName,
          bsDate,
          adDate: bsToAd(bsDate),
          createdAt: serverTimestamp(),
        });
      } else {
        const needed = Math.abs(qtyDelta);
        const totalAvailable = storeBatches.reduce((sum, b) => sum + b.qtyRemaining, 0);
        if (totalAvailable < needed) {
          throw new Error(`Insufficient stock in store. Available: ${totalAvailable}, requested deduction: ${needed}`);
        }
        let remainingToDeduct = needed;
        for (const b of storeBatches) {
          if (remainingToDeduct <= 0) break;
          if (b.qtyRemaining <= 0) continue;
          const take = Math.min(b.qtyRemaining, remainingToDeduct);
          remainingToDeduct -= take;
          tx.update(doc(db, 'stockBatches', b.id), {
            qtyRemaining: Number((b.qtyRemaining - take).toFixed(4)),
            updatedAt: serverTimestamp(),
          });
          const ledgerId = cleanId('led');
          tx.set(doc(db, 'stockLedger', ledgerId), {
            businessId: BUSINESS_ID,
            storeId,
            productId: product.id,
            itemCode: product.itemCode,
            productName: product.name,
            batchId: b.id,
            movementType,
            qtyDelta: -take,
            unitCost: b.unitCost,
            totalValue: Number((-take * b.unitCost).toFixed(2)),
            referenceType: movementType,
            referenceId: b.id,
            referenceNo: b.batchNo,
            reason,
            actorUid: actor.uid,
            actorName: actor.displayName,
            bsDate,
            adDate: bsToAd(bsDate),
            createdAt: serverTimestamp(),
          });
        }
      }
    });
    await appendAuditLog(
      actor,
      movementType.toUpperCase(),
      'inventory',
      product.id,
      `${movementType}: ${qtyDelta} ${product.baseUnit} of ${product.itemCode} in store ${storeId}`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Insufficient stock')) throw error;
    handleFirestoreError(error, OperationType.WRITE, 'stockLedger');
  }
}

export async function confirmSaleTransaction(
  actor: Employee,
  params: {
    clientRequestId: string;
    store: { id: string; code: string; taxMode: TaxMode };
    bsDate: string;
    channel: SalesChannel;
    customer?: Customer;
    isAnonymous?: boolean;
    smallRetailThreshold: number;
    vatRate: number;
    cartItems: Array<{
      product: Product;
      qty: number;
      unitPrice: number;
      discount: number;
    }>;
    invoiceDiscount: number;
    paymentAllocations: PaymentAllocation[];
    allBatches: StockBatch[];
  }
): Promise<SalesInvoice> {
  const {
    clientRequestId,
    store,
    bsDate,
    channel,
    customer,
    isAnonymous,
    smallRetailThreshold,
    vatRate,
    cartItems,
    invoiceDiscount,
    paymentAllocations,
    allBatches,
  } = params;

  if (cartItems.length === 0) throw new Error('Add at least one item to confirm sale.');

  const invoiceId = `inv_${clientRequestId}`;
  const invoiceRef = doc(db, 'salesInvoices', invoiceId);
  const adDate = bsToAd(bsDate);

  // Calculate amounts
  let subtotal = 0;
  let lineDiscountTotal = 0;
  let taxAmount = 0;

  const computedLines = cartItems.map((c) => {
    const gross = Number((c.qty * c.unitPrice).toFixed(2));
    const disc = Number(c.discount.toFixed(2));
    const taxable = Math.max(0, gross - disc);
    const rate = store.taxMode === 'vat_13' && c.product.taxType === 'vat_13' ? vatRate : 0;
    const tax = Number(((taxable * rate) / 100).toFixed(2));
    subtotal += gross;
    lineDiscountTotal += disc;
    taxAmount += tax;
    return {
      ...c,
      gross,
      taxable,
      rate,
      tax,
      lineTotal: Number((taxable + tax).toFixed(2)),
    };
  });

  const totalDiscount = Number((lineDiscountTotal + invoiceDiscount).toFixed(2));
  const netTotal = Number(Math.max(0, subtotal - totalDiscount + taxAmount).toFixed(2));

  const cleanedAllocations = paymentAllocations.filter((a) => a.amount > 0);
  const creditAmount = Number(
    cleanedAllocations
      .filter((a) => a.method === 'credit')
      .reduce((s, a) => s + a.amount, 0)
      .toFixed(2)
  );
  const amountPaid = Number(
    cleanedAllocations
      .filter((a) => a.method !== 'credit')
      .reduce((s, a) => s + a.amount, 0)
      .toFixed(2)
  );

  if (Math.abs(amountPaid + creditAmount - netTotal) > 0.5) {
    throw new Error(`Payment split (${amountPaid + creditAmount}) must match Net Total (${netTotal}).`);
  }

  if (creditAmount > 0 && !customer) {
    throw new Error('Credit sales require a registered customer.');
  }

  if (netTotal >= smallRetailThreshold && !customer && !isAnonymous) {
    throw new Error(
      `Sales of NPR ${smallRetailThreshold} and above require a Registered Customer (or authorize anonymous transaction).`
    );
  }

  const customerCategory: 'small_retail' | 'registered' | 'anonymous' = customer
    ? 'registered'
    : isAnonymous
      ? 'anonymous'
      : 'small_retail';

  let primaryPaymentMethod: PaymentMethod = 'cash';
  if (cleanedAllocations.length > 1) {
    primaryPaymentMethod = creditAmount > 0 && amountPaid > 0 ? 'partial' : 'multiple';
  } else if (cleanedAllocations.length === 1) {
    primaryPaymentMethod = cleanedAllocations[0].method;
  }

  const invoiceNo = `INV-${store.code}-${bsDate.replace(/-/g, '')}-${clientRequestId.slice(-4).toUpperCase()}`;

  try {
    const finalInvoice = await runTransaction(db, async (tx) => {
      // 1. ALL READS FIRST
      const existingInv = await tx.get(invoiceRef);
      if (existingInv.exists()) {
        return { id: existingInv.id, ...(existingInv.data() as Omit<SalesInvoice, 'id'>) };
      }

      let customerDocData: Customer | null = null;
      if (customer) {
        const custSnap = await tx.get(doc(db, 'customers', customer.id));
        if (!custSnap.exists()) throw new Error('Customer record not found.');
        customerDocData = { id: custSnap.id, ...(custSnap.data() as Omit<Customer, 'id'>) };
        if (creditAmount > 0 && customerDocData.currentBalance + creditAmount > customerDocData.creditLimit) {
          throw new Error(
            `Credit limit exceeded for ${customerDocData.name}. Limit: NPR ${customerDocData.creditLimit}, Current: NPR ${customerDocData.currentBalance}`
          );
        }
      }

      // Read relevant store batches fresh inside transaction
      const batchCache = new Map<string, StockBatch>();
      const candidateBatches = allBatches.filter((b) => b.storeId === store.id && b.qtyRemaining > 0);
      for (const cb of candidateBatches) {
        const snap = await tx.get(doc(db, 'stockBatches', cb.id));
        if (snap.exists()) {
          batchCache.set(cb.id, { id: snap.id, ...(snap.data() as Omit<StockBatch, 'id'>) });
        }
      }

      // 2. FIFO Allocation calculation
      const saleLines: SalesLineItem[] = [];
      let totalCogs = 0;
      const batchUpdates = new Map<string, number>();
      const ledgerWrites: Array<{
        id: string;
        data: Record<string, unknown>;
      }> = [];

      for (const line of computedLines) {
        const productBatches = Array.from(batchCache.values())
          .filter((b) => b.productId === line.product.id && b.qtyRemaining > 0)
          .sort((a, b) => (a.expiryDateAd || '9999-12-31').localeCompare(b.expiryDateAd || '9999-12-31'));

        const available = productBatches.reduce((sum, b) => sum + b.qtyRemaining, 0);
        if (available < line.qty) {
          throw new Error(
            `Insufficient stock for ${line.product.itemCode} (${line.product.name}). Available: ${available}, Requested: ${line.qty}`
          );
        }

        let remainingNeed = line.qty;
        let lineCogs = 0;
        const batchDeductions: Array<{ batchId: string; qty: number; unitCost: number }> = [];

        for (const batch of productBatches) {
          if (remainingNeed <= 0) break;
          const take = Math.min(batch.qtyRemaining, remainingNeed);
          remainingNeed -= take;
          batch.qtyRemaining = Number((batch.qtyRemaining - take).toFixed(4));
          batchUpdates.set(batch.id, batch.qtyRemaining);

          const cogsPart = Number((take * batch.unitCost).toFixed(2));
          lineCogs += cogsPart;
          batchDeductions.push({ batchId: batch.id, qty: take, unitCost: batch.unitCost });

          ledgerWrites.push({
            id: cleanId('led'),
            data: {
              businessId: BUSINESS_ID,
              storeId: store.id,
              productId: line.product.id,
              itemCode: line.product.itemCode,
              productName: line.product.name,
              batchId: batch.id,
              movementType: 'sale',
              qtyDelta: -take,
              unitCost: batch.unitCost,
              totalValue: -cogsPart,
              referenceType: 'sales_invoice',
              referenceId: invoiceId,
              referenceNo: invoiceNo,
              reason: `Sale via ${channel} (${invoiceNo})`,
              actorUid: actor.uid,
              actorName: actor.displayName,
              bsDate,
              adDate,
              createdAt: serverTimestamp(),
            },
          });
        }

        totalCogs += lineCogs;
        saleLines.push({
          productId: line.product.id,
          itemCode: line.product.itemCode,
          productName: line.product.name,
          unit: line.product.baseUnit,
          qty: line.qty,
          unitPrice: line.unitPrice,
          discount: line.discount,
          taxRate: line.rate,
          taxAmount: line.tax,
          lineTotal: line.lineTotal,
          fifoCogs: Number(lineCogs.toFixed(2)),
          batchDeductions,
        });
      }

      const revenueExVat = Number((netTotal - taxAmount).toFixed(2));
      const grossProfit = Number((revenueExVat - totalCogs).toFixed(2));

      // 3. ALL WRITES AFTER READS
      for (const [bId, newQty] of batchUpdates.entries()) {
        tx.update(doc(db, 'stockBatches', bId), {
          qtyRemaining: newQty,
          updatedAt: serverTimestamp(),
        });
      }

      for (const lw of ledgerWrites) {
        tx.set(doc(db, 'stockLedger', lw.id), lw.data);
      }

      const invoicePayload = omitEmpty({
        businessId: BUSINESS_ID,
        invoiceNo,
        clientRequestId,
        storeId: store.id,
        bsDate,
        adDate,
        channel,
        customerId: customer?.id,
        customerName: customer?.name,
        customerMobile: customer?.mobile,
        customerCategory,
        items: saleLines,
        subtotal: Number(subtotal.toFixed(2)),
        discountAmount: totalDiscount,
        taxAmount: Number(taxAmount.toFixed(2)),
        netTotal,
        totalCogs: Number(totalCogs.toFixed(2)),
        grossProfit,
        amountPaid,
        creditAmount,
        primaryPaymentMethod,
        paymentAllocations: cleanedAllocations,
        status: 'confirmed' as const,
        createdByUid: actor.uid,
        createdByName: actor.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.set(invoiceRef, invoicePayload);

      if (creditAmount > 0 && customer && customerDocData) {
        tx.update(doc(db, 'customers', customer.id), {
          currentBalance: Number((customerDocData.currentBalance + creditAmount).toFixed(2)),
          updatedAt: serverTimestamp(),
        });
        const creditId = cleanId('cred');
        tx.set(
          doc(db, 'customerCreditLedger', creditId),
          omitEmpty({
            businessId: BUSINESS_ID,
            customerId: customer.id,
            customerName: customer.name,
            storeId: store.id,
            invoiceId,
            invoiceNo,
            entryType: 'credit_sale',
            amount: creditAmount,
            method: 'credit',
            dueDateBs: addDaysBs(bsDate, customerDocData.defaultDueDays || 15),
            notes: `Credit portion of ${invoiceNo}`,
            bsDate,
            actorUid: actor.uid,
            actorName: actor.displayName,
            createdAt: serverTimestamp(),
          })
        );
      }

      return {
        id: invoiceId,
        ...(invoicePayload as unknown as Omit<SalesInvoice, 'id'>),
      };
    });

    await appendAuditLog(
      actor,
      'CONFIRM_SALE',
      'sales_invoice',
      invoiceId,
      `Confirmed ${finalInvoice.invoiceNo} for NPR ${finalInvoice.netTotal} (${channel})`
    );
    return finalInvoice;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Insufficient stock') ||
        error.message.includes('Credit limit') ||
        error.message.includes('require'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `salesInvoices/${invoiceId}`);
  }
}

export async function reverseSaleTransaction(
  actor: Employee,
  invoice: SalesInvoice,
  reason: string
): Promise<void> {
  if (invoice.status === 'reversed') throw new Error('Invoice is already reversed.');
  const bsDate = todayBs();
  const adDate = todayAd();

  try {
    await runTransaction(db, async (tx) => {
      const invRef = doc(db, 'salesInvoices', invoice.id);
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists()) throw new Error('Invoice not found.');
      if (invSnap.data().status === 'reversed') throw new Error('Invoice already reversed.');

      const batchReads = new Map<string, number>();
      for (const item of invoice.items) {
        for (const ded of item.batchDeductions || []) {
          if (!batchReads.has(ded.batchId)) {
            const bSnap = await tx.get(doc(db, 'stockBatches', ded.batchId));
            if (bSnap.exists()) {
              batchReads.set(ded.batchId, Number(bSnap.data().qtyRemaining || 0));
            }
          }
        }
      }

      let customerBal = 0;
      if (invoice.creditAmount > 0 && invoice.customerId) {
        const cSnap = await tx.get(doc(db, 'customers', invoice.customerId));
        if (cSnap.exists()) {
          customerBal = Number(cSnap.data().currentBalance || 0);
        }
      }

      // Writes
      tx.update(invRef, {
        status: 'reversed',
        reversedByUid: actor.uid,
        reversedReason: reason,
        updatedAt: serverTimestamp(),
      });

      const batchTotals = new Map<string, number>(batchReads);
      for (const item of invoice.items) {
        for (const ded of item.batchDeductions || []) {
          const prev = batchTotals.get(ded.batchId) ?? 0;
          const next = Number((prev + ded.qty).toFixed(4));
          batchTotals.set(ded.batchId, next);
          tx.update(doc(db, 'stockBatches', ded.batchId), {
            qtyRemaining: next,
            updatedAt: serverTimestamp(),
          });
          tx.set(doc(db, 'stockLedger', cleanId('led')), {
            businessId: BUSINESS_ID,
            storeId: invoice.storeId,
            productId: item.productId,
            itemCode: item.itemCode,
            productName: item.productName,
            batchId: ded.batchId,
            movementType: 'sale_reversal',
            qtyDelta: ded.qty,
            unitCost: ded.unitCost,
            totalValue: Number((ded.qty * ded.unitCost).toFixed(2)),
            referenceType: 'sales_reversal',
            referenceId: invoice.id,
            referenceNo: invoice.invoiceNo,
            reason: `Reversal of ${invoice.invoiceNo}: ${reason}`,
            actorUid: actor.uid,
            actorName: actor.displayName,
            bsDate,
            adDate,
            createdAt: serverTimestamp(),
          });
        }
      }

      if (invoice.creditAmount > 0 && invoice.customerId) {
        tx.update(doc(db, 'customers', invoice.customerId), {
          currentBalance: Number(Math.max(0, customerBal - invoice.creditAmount).toFixed(2)),
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'customerCreditLedger', cleanId('cred')), {
          businessId: BUSINESS_ID,
          customerId: invoice.customerId,
          customerName: invoice.customerName || 'Customer',
          storeId: invoice.storeId,
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          entryType: 'reversal',
          amount: invoice.creditAmount,
          method: 'reversal',
          notes: `Reversal of ${invoice.invoiceNo}: ${reason}`,
          bsDate,
          actorUid: actor.uid,
          actorName: actor.displayName,
          createdAt: serverTimestamp(),
        });
      }
    });
    await appendAuditLog(actor, 'REVERSE_SALE', 'sales_invoice', invoice.id, `Reversed ${invoice.invoiceNo}: ${reason}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `salesInvoices/${invoice.id}`);
  }
}

export interface ManualInvoiceLineInput {
  product?: Product;
  itemCode: string;
  productName: string;
  unit: BaseUnit;
  qty: number;
  unitPrice: number;
  discount: number;
  taxType: TaxType;
}

export async function generateCustomerInvoice(
  actor: Employee,
  params: {
    clientRequestId: string;
    store: { id: string; code: string; taxMode: TaxMode };
    bsDate: string;
    channel: SalesChannel;
    customer?: Customer;
    manualCustomerName?: string;
    manualCustomerMobile?: string;
    applyVat: boolean;
    vatRate: number;
    items: ManualInvoiceLineInput[];
    invoiceDiscount: number;
    paymentMethod: PaymentAllocationMethod;
    amountPaidInput?: number;
    deductStock: boolean;
    allBatches: StockBatch[];
  }
): Promise<SalesInvoice> {
  const {
    clientRequestId,
    store,
    bsDate,
    channel,
    customer,
    manualCustomerName,
    manualCustomerMobile,
    applyVat,
    vatRate,
    items,
    invoiceDiscount,
    paymentMethod,
    amountPaidInput,
    deductStock,
    allBatches,
  } = params;

  if (items.length === 0) throw new Error('Add at least one item row to generate the invoice.');
  for (const row of items) {
    if (!row.itemCode.trim()) throw new Error('Every item row must have an Item Code.');
    if (!(row.qty > 0)) throw new Error(`Quantity must be greater than zero for ${row.itemCode}.`);
    if (row.unitPrice < 0) throw new Error(`Rate cannot be negative for ${row.itemCode}.`);
  }

  const invoiceId = `inv_${clientRequestId}`;
  const invoiceRef = doc(db, 'salesInvoices', invoiceId);
  const adDate = bsToAd(bsDate);

  let subtotal = 0;
  let lineDiscountTotal = 0;
  let taxAmount = 0;

  const computedLines = items.map((c) => {
    const cleanCode = c.itemCode.trim().toUpperCase();
    const cleanName = c.productName.trim() || cleanCode;
    const gross = Number((c.qty * c.unitPrice).toFixed(2));
    const disc = Number((c.discount || 0).toFixed(2));
    const taxable = Math.max(0, gross - disc);
    const rate = applyVat && store.taxMode === 'vat_13' && c.taxType === 'vat_13' ? vatRate : 0;
    const tax = Number(((taxable * rate) / 100).toFixed(2));
    subtotal += gross;
    lineDiscountTotal += disc;
    taxAmount += tax;
    return {
      ...c,
      itemCode: cleanCode,
      productName: cleanName,
      gross,
      tax,
      rate,
      lineTotal: Number((taxable + tax).toFixed(2)),
    };
  });

  const totalDiscount = Number((lineDiscountTotal + Math.max(0, invoiceDiscount || 0)).toFixed(2));
  const netTotal = Number(Math.max(0, subtotal - totalDiscount + taxAmount).toFixed(2));

  let amountPaid = netTotal;
  let creditAmount = 0;
  let primaryPaymentMethod: PaymentMethod = paymentMethod;
  let paymentAllocations: PaymentAllocation[] = [{ method: paymentMethod, amount: netTotal }];

  if (paymentMethod === 'credit') {
    if (!customer) throw new Error('Credit invoices require selecting a registered customer.');
    amountPaid = 0;
    creditAmount = netTotal;
    paymentAllocations = [{ method: 'credit', amount: netTotal }];
  } else if (
    typeof amountPaidInput === 'number' &&
    amountPaidInput >= 0 &&
    amountPaidInput < netTotal - 0.01
  ) {
    if (!customer) {
      throw new Error('Partial payment (balance due) requires selecting a registered customer.');
    }
    amountPaid = Number(amountPaidInput.toFixed(2));
    creditAmount = Number((netTotal - amountPaid).toFixed(2));
    primaryPaymentMethod = 'partial';
    paymentAllocations = [
      ...(amountPaid > 0 ? [{ method: paymentMethod, amount: amountPaid }] : []),
      { method: 'credit', amount: creditAmount },
    ];
  }

  const customerCategory: 'small_retail' | 'registered' = customer ? 'registered' : 'small_retail';
  const invoiceNo = `INV-${store.code}-${bsDate.replace(/-/g, '')}-${clientRequestId.slice(-4).toUpperCase()}`;

  try {
    const finalInvoice = await runTransaction(db, async (tx) => {
      const existingInv = await tx.get(invoiceRef);
      if (existingInv.exists()) {
        return { id: existingInv.id, ...(existingInv.data() as Omit<SalesInvoice, 'id'>) };
      }

      let customerDocData: Customer | null = null;
      if (customer) {
        const custSnap = await tx.get(doc(db, 'customers', customer.id));
        if (!custSnap.exists()) throw new Error('Customer record not found.');
        customerDocData = { id: custSnap.id, ...(custSnap.data() as Omit<Customer, 'id'>) };
        if (creditAmount > 0 && customerDocData.currentBalance + creditAmount > customerDocData.creditLimit) {
          throw new Error(
            `Credit limit exceeded for ${customerDocData.name}. Limit: NPR ${customerDocData.creditLimit}, Current: NPR ${customerDocData.currentBalance}`
          );
        }
      }

      const batchCache = new Map<string, StockBatch>();
      if (deductStock) {
        const candidateBatches = allBatches.filter((b) => b.storeId === store.id && b.qtyRemaining > 0);
        for (const cb of candidateBatches) {
          const snap = await tx.get(doc(db, 'stockBatches', cb.id));
          if (snap.exists()) {
            batchCache.set(cb.id, { id: snap.id, ...(snap.data() as Omit<StockBatch, 'id'>) });
          }
        }
      }

      const saleLines: SalesLineItem[] = [];
      let totalCogs = 0;
      const batchUpdates = new Map<string, number>();
      const ledgerWrites: Array<{ id: string; data: Record<string, unknown> }> = [];

      for (const line of computedLines) {
        let lineCogs = 0;
        const batchDeductions: Array<{ batchId: string; qty: number; unitCost: number }> = [];
        const resolvedProductId = line.product?.id || `custom_${line.itemCode}`;

        if (deductStock && line.product) {
          const productBatches = Array.from(batchCache.values())
            .filter((b) => b.productId === line.product!.id && b.qtyRemaining > 0)
            .sort((a, b) => (a.expiryDateAd || '9999-12-31').localeCompare(b.expiryDateAd || '9999-12-31'));

          const available = productBatches.reduce((sum, b) => sum + b.qtyRemaining, 0);
          if (available < line.qty) {
            throw new Error(
              `Insufficient FIFO stock for ${line.itemCode} (${line.productName}). Available: ${available}, Requested: ${line.qty}. Uncheck "Deduct Store Inventory" to bill without stock deduction.`
            );
          }

          let remainingNeed = line.qty;
          for (const batch of productBatches) {
            if (remainingNeed <= 0) break;
            const take = Math.min(batch.qtyRemaining, remainingNeed);
            remainingNeed -= take;
            batch.qtyRemaining = Number((batch.qtyRemaining - take).toFixed(4));
            batchUpdates.set(batch.id, batch.qtyRemaining);

            const cogsPart = Number((take * batch.unitCost).toFixed(2));
            lineCogs += cogsPart;
            batchDeductions.push({ batchId: batch.id, qty: take, unitCost: batch.unitCost });

            ledgerWrites.push({
              id: cleanId('led'),
              data: {
                businessId: BUSINESS_ID,
                storeId: store.id,
                productId: resolvedProductId,
                itemCode: line.itemCode,
                productName: line.productName,
                batchId: batch.id,
                movementType: 'sale',
                qtyDelta: -take,
                unitCost: batch.unitCost,
                totalValue: -cogsPart,
                referenceType: 'sales_invoice',
                referenceId: invoiceId,
                referenceNo: invoiceNo,
                reason: `Customer invoice ${invoiceNo}`,
                actorUid: actor.uid,
                actorName: actor.displayName,
                bsDate,
                adDate,
                createdAt: serverTimestamp(),
              },
            });
          }
        } else {
          lineCogs = line.product ? Number((line.product.purchasePrice * line.qty).toFixed(2)) : 0;
        }

        totalCogs += lineCogs;
        saleLines.push({
          productId: resolvedProductId,
          itemCode: line.itemCode,
          productName: line.productName,
          unit: line.unit,
          qty: line.qty,
          unitPrice: line.unitPrice,
          discount: line.discount,
          taxRate: line.rate,
          taxAmount: line.tax,
          lineTotal: line.lineTotal,
          fifoCogs: Number(lineCogs.toFixed(2)),
          batchDeductions,
        });
      }

      const revenueExVat = Number((netTotal - taxAmount).toFixed(2));
      const grossProfit = Number((revenueExVat - totalCogs).toFixed(2));

      for (const [bId, newQty] of batchUpdates.entries()) {
        tx.update(doc(db, 'stockBatches', bId), {
          qtyRemaining: newQty,
          updatedAt: serverTimestamp(),
        });
      }

      for (const lw of ledgerWrites) {
        tx.set(doc(db, 'stockLedger', lw.id), lw.data);
      }

      const invoicePayload = omitEmpty({
        businessId: BUSINESS_ID,
        invoiceNo,
        clientRequestId,
        storeId: store.id,
        bsDate,
        adDate,
        channel,
        customerId: customer?.id,
        customerName: customer?.name || manualCustomerName?.trim() || undefined,
        customerMobile: customer?.mobile || manualCustomerMobile?.trim() || undefined,
        customerCategory,
        items: saleLines,
        subtotal: Number(subtotal.toFixed(2)),
        discountAmount: totalDiscount,
        taxAmount: Number(taxAmount.toFixed(2)),
        netTotal,
        totalCogs: Number(totalCogs.toFixed(2)),
        grossProfit,
        amountPaid,
        creditAmount,
        primaryPaymentMethod,
        paymentAllocations,
        status: 'confirmed' as const,
        createdByUid: actor.uid,
        createdByName: actor.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.set(invoiceRef, invoicePayload);

      if (creditAmount > 0 && customer && customerDocData) {
        tx.update(doc(db, 'customers', customer.id), {
          currentBalance: Number((customerDocData.currentBalance + creditAmount).toFixed(2)),
          updatedAt: serverTimestamp(),
        });
        tx.set(
          doc(db, 'customerCreditLedger', cleanId('cred')),
          omitEmpty({
            businessId: BUSINESS_ID,
            customerId: customer.id,
            customerName: customer.name,
            storeId: store.id,
            invoiceId,
            invoiceNo,
            entryType: 'credit_sale',
            amount: creditAmount,
            method: 'credit',
            dueDateBs: addDaysBs(bsDate, customerDocData.defaultDueDays || 15),
            notes: `Credit portion of ${invoiceNo}`,
            bsDate,
            actorUid: actor.uid,
            actorName: actor.displayName,
            createdAt: serverTimestamp(),
          })
        );
      }

      return {
        id: invoiceId,
        ...(invoicePayload as unknown as Omit<SalesInvoice, 'id'>),
      };
    });

    await appendAuditLog(
      actor,
      'GENERATE_CUSTOMER_INVOICE',
      'sales_invoice',
      invoiceId,
      `Generated ${finalInvoice.invoiceNo} for ${finalInvoice.customerName || 'Walk-in'} — NPR ${finalInvoice.netTotal}`
    );
    return finalInvoice;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Insufficient') ||
        error.message.includes('Credit') ||
        error.message.includes('require') ||
        error.message.includes('Partial'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `salesInvoices/${invoiceId}`);
  }
}

export async function saveCustomer(
  actor: Employee,
  customer: {
    id?: string;
    customerCode: string;
    name: string;
    mobile: string;
    address?: string;
    customerType: 'retail' | 'wholesale';
    creditLimit: number;
    defaultDueDays: number;
    storeId?: string;
    active: boolean;
  }
): Promise<string> {
  const id = customer.id || cleanId('cust');
  try {
    if (customer.id) {
      await updateDoc(
        doc(db, 'customers', id),
        omitEmpty({
          name: customer.name,
          mobile: customer.mobile,
          address: customer.address,
          customerType: customer.customerType,
          creditLimit: Number(customer.creditLimit),
          defaultDueDays: Number(customer.defaultDueDays),
          storeId: customer.storeId,
          active: customer.active,
          updatedAt: serverTimestamp(),
        })
      );
      await appendAuditLog(actor, 'UPDATE_CUSTOMER', 'customer', id, `Updated customer ${customer.name}`);
    } else {
      await setDoc(
        doc(db, 'customers', id),
        omitEmpty({
          businessId: BUSINESS_ID,
          customerCode: customer.customerCode.toUpperCase(),
          name: customer.name,
          mobile: customer.mobile,
          address: customer.address,
          customerType: customer.customerType,
          creditLimit: Number(customer.creditLimit),
          currentBalance: 0,
          defaultDueDays: Number(customer.defaultDueDays),
          storeId: customer.storeId,
          active: customer.active,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
      await appendAuditLog(actor, 'CREATE_CUSTOMER', 'customer', id, `Registered customer ${customer.name}`);
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `customers/${id}`);
  }
}

export async function recordCreditRecovery(
  actor: Employee,
  params: {
    customer: Customer;
    storeId: string;
    amount: number;
    method: 'cash' | 'bank_transfer' | 'qr' | 'mobile_wallet';
    referenceNo?: string;
    notes?: string;
    bsDate: string;
  }
): Promise<void> {
  const { customer, storeId, amount, method, referenceNo, notes, bsDate } = params;
  if (amount <= 0) throw new Error('Payment amount must be greater than zero.');

  try {
    await runTransaction(db, async (tx) => {
      const custRef = doc(db, 'customers', customer.id);
      const snap = await tx.get(custRef);
      if (!snap.exists()) throw new Error('Customer not found.');
      const curBal = Number(snap.data().currentBalance || 0);
      const nextBal = Number(Math.max(0, curBal - amount).toFixed(2));

      tx.update(custRef, {
        currentBalance: nextBal,
        updatedAt: serverTimestamp(),
      });
      tx.set(
        doc(db, 'customerCreditLedger', cleanId('cred')),
        omitEmpty({
          businessId: BUSINESS_ID,
          customerId: customer.id,
          customerName: customer.name,
          storeId,
          entryType: 'payment_recovery',
          amount: Number(amount.toFixed(2)),
          method,
          referenceNo,
          notes,
          bsDate,
          actorUid: actor.uid,
          actorName: actor.displayName,
          createdAt: serverTimestamp(),
        })
      );
    });
    await appendAuditLog(
      actor,
      'CREDIT_RECOVERY',
      'customer',
      customer.id,
      `Recovered NPR ${amount} from ${customer.name} via ${method}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'customerCreditLedger');
  }
}

export async function saveSupplier(
  actor: Employee,
  supplier: {
    id?: string;
    name: string;
    contactPerson?: string;
    phone: string;
    address?: string;
    panVatNo?: string;
    paymentTerms?: string;
    active: boolean;
  }
): Promise<string> {
  const id = supplier.id || cleanId('sup');
  try {
    if (supplier.id) {
      await updateDoc(
        doc(db, 'suppliers', id),
        omitEmpty({
          name: supplier.name,
          contactPerson: supplier.contactPerson,
          phone: supplier.phone,
          address: supplier.address,
          panVatNo: supplier.panVatNo,
          paymentTerms: supplier.paymentTerms,
          active: supplier.active,
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      await setDoc(
        doc(db, 'suppliers', id),
        omitEmpty({
          businessId: BUSINESS_ID,
          name: supplier.name,
          contactPerson: supplier.contactPerson,
          phone: supplier.phone,
          address: supplier.address,
          panVatNo: supplier.panVatNo,
          paymentTerms: supplier.paymentTerms,
          currentPayable: 0,
          active: supplier.active,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
    await appendAuditLog(actor, supplier.id ? 'UPDATE_SUPPLIER' : 'CREATE_SUPPLIER', 'supplier', id, supplier.name);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `suppliers/${id}`);
  }
}

export async function createPurchaseOrder(
  actor: Employee,
  params: {
    storeId: string;
    supplier: Supplier;
    bsDate: string;
    items: PurchaseOrderItem[];
  }
): Promise<string> {
  const id = cleanId('po');
  const poNo = `PO-${params.bsDate.replace(/-/g, '')}-${id.slice(-4).toUpperCase()}`;
  const totalOrderedAmount = Number(
    params.items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2)
  );
  try {
    await setDoc(doc(db, 'purchaseOrders', id), {
      businessId: BUSINESS_ID,
      poNo,
      storeId: params.storeId,
      supplierId: params.supplier.id,
      supplierName: params.supplier.name,
      bsDate: params.bsDate,
      status: 'submitted',
      items: params.items,
      totalOrderedAmount,
      totalReceivedAmount: 0,
      createdByUid: actor.uid,
      createdByName: actor.displayName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await appendAuditLog(actor, 'CREATE_PO', 'purchase_order', id, `Created ${poNo} for ${params.supplier.name}`);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `purchaseOrders/${id}`);
  }
}

export async function createAndApproveGrn(
  actor: Employee,
  params: {
    po: PurchaseOrder;
    bsDate: string;
    items: Array<{
      productId: string;
      itemCode: string;
      productName: string;
      orderedQty: number;
      receivedQty: number;
      unitCost: number;
      batchNo: string;
      expiryDateBs?: string;
    }>;
    approveImmediately: boolean;
  }
): Promise<string> {
  const grnId = cleanId('grn');
  const grnNo = `GRN-${params.bsDate.replace(/-/g, '')}-${grnId.slice(-4).toUpperCase()}`;
  const grnItems = params.items.map((i) =>
    omitEmpty({
      productId: i.productId,
      itemCode: i.itemCode,
      productName: i.productName,
      orderedQty: i.orderedQty,
      receivedQty: i.receivedQty,
      varianceQty: Number((i.receivedQty - i.orderedQty).toFixed(4)),
      unitCost: i.unitCost,
      batchNo: i.batchNo || `B-${params.bsDate}`,
      expiryDateBs: i.expiryDateBs,
      expiryDateAd: i.expiryDateBs ? bsToAd(i.expiryDateBs) : undefined,
      lineTotal: Number((i.receivedQty * i.unitCost).toFixed(2)),
    })
  );
  const totalReceivedAmount = Number(
    grnItems.reduce((s, i) => s + i.lineTotal, 0).toFixed(2)
  );

  try {
    if (!params.approveImmediately) {
      await setDoc(doc(db, 'goodsReceipts', grnId), {
        businessId: BUSINESS_ID,
        grnNo,
        poId: params.po.id,
        poNo: params.po.poNo,
        storeId: params.po.storeId,
        supplierId: params.po.supplierId,
        supplierName: params.po.supplierName,
        bsDate: params.bsDate,
        status: 'pending_approval',
        items: grnItems,
        totalReceivedAmount,
        createdByUid: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await appendAuditLog(actor, 'CREATE_GRN', 'goods_receipt', grnId, `Created pending ${grnNo}`);
      return grnId;
    }

    await runTransaction(db, async (tx) => {
      const poSnap = await tx.get(doc(db, 'purchaseOrders', params.po.id));
      const supSnap = await tx.get(doc(db, 'suppliers', params.po.supplierId));
      if (!poSnap.exists() || !supSnap.exists()) throw new Error('PO or Supplier not found.');

      const poData = poSnap.data() as PurchaseOrder;
      const supPayable = Number(supSnap.data().currentPayable || 0);

      const updatedPoItems = poData.items.map((poItem) => {
        const match = grnItems.find((g) => g.productId === poItem.productId);
        const addQty = match ? match.receivedQty : 0;
        return {
          ...poItem,
          receivedQty: Number((poItem.receivedQty + addQty).toFixed(4)),
        };
      });
      const allDone = updatedPoItems.every((i) => i.receivedQty >= i.orderedQty);
      const nextPoReceivedAmount = Number((poData.totalReceivedAmount + totalReceivedAmount).toFixed(2));

      tx.set(doc(db, 'goodsReceipts', grnId), {
        businessId: BUSINESS_ID,
        grnNo,
        poId: params.po.id,
        poNo: params.po.poNo,
        storeId: params.po.storeId,
        supplierId: params.po.supplierId,
        supplierName: params.po.supplierName,
        bsDate: params.bsDate,
        status: 'approved',
        items: grnItems,
        totalReceivedAmount,
        createdByUid: actor.uid,
        approvedByUid: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(doc(db, 'purchaseOrders', params.po.id), {
        items: updatedPoItems,
        totalReceivedAmount: nextPoReceivedAmount,
        status: allDone ? 'completed' : 'partial',
        updatedAt: serverTimestamp(),
      });

      tx.update(doc(db, 'suppliers', params.po.supplierId), {
        currentPayable: Number((supPayable + totalReceivedAmount).toFixed(2)),
        updatedAt: serverTimestamp(),
      });

      const adDate = bsToAd(params.bsDate);
      for (const item of grnItems) {
        if (item.receivedQty <= 0) continue;
        const batchId = cleanId('batch');
        tx.set(
          doc(db, 'stockBatches', batchId),
          omitEmpty({
            businessId: BUSINESS_ID,
            storeId: params.po.storeId,
            productId: item.productId,
            itemCode: item.itemCode,
            batchNo: item.batchNo,
            expiryDateBs: item.expiryDateBs,
            expiryDateAd: item.expiryDateAd,
            unitCost: item.unitCost,
            qtyReceived: item.receivedQty,
            qtyRemaining: item.receivedQty,
            supplierId: params.po.supplierId,
            grnId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
        tx.set(doc(db, 'stockLedger', cleanId('led')), {
          businessId: BUSINESS_ID,
          storeId: params.po.storeId,
          productId: item.productId,
          itemCode: item.itemCode,
          productName: item.productName,
          batchId,
          movementType: 'purchase_grn',
          qtyDelta: item.receivedQty,
          unitCost: item.unitCost,
          totalValue: item.lineTotal,
          referenceType: 'goods_receipt',
          referenceId: grnId,
          referenceNo: grnNo,
          reason: `Goods received against ${params.po.poNo}`,
          actorUid: actor.uid,
          actorName: actor.displayName,
          bsDate: params.bsDate,
          adDate,
          createdAt: serverTimestamp(),
        });
      }
    });
    await appendAuditLog(actor, 'APPROVE_GRN', 'goods_receipt', grnId, `Approved ${grnNo} (NPR ${totalReceivedAmount})`);
    return grnId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `goodsReceipts/${grnId}`);
  }
}

export async function approvePendingGrn(actor: Employee, grn: GoodsReceipt): Promise<void> {
  if (grn.status === 'approved') return;
  try {
    await runTransaction(db, async (tx) => {
      const grnRef = doc(db, 'goodsReceipts', grn.id);
      const poRef = doc(db, 'purchaseOrders', grn.poId);
      const supRef = doc(db, 'suppliers', grn.supplierId);
      const [grnSnap, poSnap, supSnap] = await Promise.all([tx.get(grnRef), tx.get(poRef), tx.get(supRef)]);
      if (!grnSnap.exists() || !poSnap.exists() || !supSnap.exists()) throw new Error('GRN/PO/Supplier missing.');
      if (grnSnap.data().status === 'approved') return;

      const poData = poSnap.data() as PurchaseOrder;
      const supPayable = Number(supSnap.data().currentPayable || 0);
      const updatedPoItems = poData.items.map((poItem) => {
        const match = grn.items.find((g) => g.productId === poItem.productId);
        return {
          ...poItem,
          receivedQty: Number((poItem.receivedQty + (match ? match.receivedQty : 0)).toFixed(4)),
        };
      });
      const allDone = updatedPoItems.every((i) => i.receivedQty >= i.orderedQty);

      tx.update(grnRef, {
        status: 'approved',
        approvedByUid: actor.uid,
        updatedAt: serverTimestamp(),
      });
      tx.update(poRef, {
        items: updatedPoItems,
        totalReceivedAmount: Number((poData.totalReceivedAmount + grn.totalReceivedAmount).toFixed(2)),
        status: allDone ? 'completed' : 'partial',
        updatedAt: serverTimestamp(),
      });
      tx.update(supRef, {
        currentPayable: Number((supPayable + grn.totalReceivedAmount).toFixed(2)),
        updatedAt: serverTimestamp(),
      });

      const adDate = bsToAd(grn.bsDate);
      for (const item of grn.items) {
        if (item.receivedQty <= 0) continue;
        const batchId = cleanId('batch');
        tx.set(
          doc(db, 'stockBatches', batchId),
          omitEmpty({
            businessId: BUSINESS_ID,
            storeId: grn.storeId,
            productId: item.productId,
            itemCode: item.itemCode,
            batchNo: item.batchNo,
            expiryDateBs: item.expiryDateBs,
            expiryDateAd: item.expiryDateAd,
            unitCost: item.unitCost,
            qtyReceived: item.receivedQty,
            qtyRemaining: item.receivedQty,
            supplierId: grn.supplierId,
            grnId: grn.id,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
        tx.set(doc(db, 'stockLedger', cleanId('led')), {
          businessId: BUSINESS_ID,
          storeId: grn.storeId,
          productId: item.productId,
          itemCode: item.itemCode,
          productName: item.productName,
          batchId,
          movementType: 'purchase_grn',
          qtyDelta: item.receivedQty,
          unitCost: item.unitCost,
          totalValue: item.lineTotal,
          referenceType: 'goods_receipt',
          referenceId: grn.id,
          referenceNo: grn.grnNo,
          reason: `Approved GRN ${grn.grnNo}`,
          actorUid: actor.uid,
          actorName: actor.displayName,
          bsDate: grn.bsDate,
          adDate,
          createdAt: serverTimestamp(),
        });
      }
    });
    await appendAuditLog(actor, 'APPROVE_GRN', 'goods_receipt', grn.id, `Approved ${grn.grnNo}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `goodsReceipts/${grn.id}`);
  }
}

export async function recordSupplierPayment(
  actor: Employee,
  params: {
    supplier: Supplier;
    storeId: string;
    method: 'cash' | 'bank_transfer' | 'qr' | 'mobile_wallet';
    amount: number;
    referenceNo?: string;
    notes?: string;
    bsDate: string;
  }
): Promise<void> {
  if (params.amount <= 0) throw new Error('Amount must be greater than zero.');
  try {
    await runTransaction(db, async (tx) => {
      const supRef = doc(db, 'suppliers', params.supplier.id);
      const snap = await tx.get(supRef);
      if (!snap.exists()) throw new Error('Supplier not found.');
      const cur = Number(snap.data().currentPayable || 0);
      tx.update(supRef, {
        currentPayable: Number(Math.max(0, cur - params.amount).toFixed(2)),
        updatedAt: serverTimestamp(),
      });
      tx.set(
        doc(db, 'supplierPayments', cleanId('spay')),
        omitEmpty({
          businessId: BUSINESS_ID,
          supplierId: params.supplier.id,
          supplierName: params.supplier.name,
          storeId: params.storeId,
          method: params.method,
          amount: Number(params.amount.toFixed(2)),
          referenceNo: params.referenceNo,
          notes: params.notes,
          bsDate: params.bsDate,
          actorUid: actor.uid,
          actorName: actor.displayName,
          createdAt: serverTimestamp(),
        })
      );
    });
    await appendAuditLog(
      actor,
      'SUPPLIER_PAYMENT',
      'supplier',
      params.supplier.id,
      `Paid NPR ${params.amount} to ${params.supplier.name}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'supplierPayments');
  }
}

export async function dispatchStockTransfer(
  actor: Employee,
  params: {
    fromStoreId: string;
    toStoreId: string;
    bsDate: string;
    items: Array<{ product: Product; qty: number }>;
    allBatches: StockBatch[];
  }
): Promise<string> {
  if (params.fromStoreId === params.toStoreId) throw new Error('Sending and receiving stores must differ.');
  const transferId = cleanId('trf');
  const transferRef = `TRF-${params.bsDate.replace(/-/g, '')}-${transferId.slice(-4).toUpperCase()}`;
  const adDate = bsToAd(params.bsDate);

  try {
    await runTransaction(db, async (tx) => {
      const batchCache = new Map<string, StockBatch>();
      const candidates = params.allBatches.filter((b) => b.storeId === params.fromStoreId && b.qtyRemaining > 0);
      for (const cb of candidates) {
        const snap = await tx.get(doc(db, 'stockBatches', cb.id));
        if (snap.exists()) batchCache.set(cb.id, { id: snap.id, ...(snap.data() as Omit<StockBatch, 'id'>) });
      }

      const dispatchedItems: StockTransfer['items'] = [];
      const batchUpdates = new Map<string, number>();
      const ledgerWrites: Array<{ id: string; data: Record<string, unknown> }> = [];

      for (const line of params.items) {
        const batches = Array.from(batchCache.values())
          .filter((b) => b.productId === line.product.id && b.qtyRemaining > 0)
          .sort((a, b) => (a.expiryDateAd || '9999-12-31').localeCompare(b.expiryDateAd || '9999-12-31'));

        const available = batches.reduce((s, b) => s + b.qtyRemaining, 0);
        if (available < line.qty) {
          throw new Error(`Insufficient stock for ${line.product.itemCode} in sending store.`);
        }

        let need = line.qty;
        for (const batch of batches) {
          if (need <= 0) break;
          const take = Math.min(batch.qtyRemaining, need);
          need -= take;
          batch.qtyRemaining = Number((batch.qtyRemaining - take).toFixed(4));
          batchUpdates.set(batch.id, batch.qtyRemaining);

          dispatchedItems.push(
            omitEmpty({
              productId: line.product.id,
              itemCode: line.product.itemCode,
              productName: line.product.name,
              qtyDispatched: take,
              qtyReceived: 0,
              unitCost: batch.unitCost,
              batchNo: batch.batchNo,
              expiryDateBs: batch.expiryDateBs,
              expiryDateAd: batch.expiryDateAd,
            })
          );

          ledgerWrites.push({
            id: cleanId('led'),
            data: {
              businessId: BUSINESS_ID,
              storeId: params.fromStoreId,
              productId: line.product.id,
              itemCode: line.product.itemCode,
              productName: line.product.name,
              batchId: batch.id,
              movementType: 'transfer_out',
              qtyDelta: -take,
              unitCost: batch.unitCost,
              totalValue: Number((-take * batch.unitCost).toFixed(2)),
              referenceType: 'stock_transfer',
              referenceId: transferId,
              referenceNo: transferRef,
              reason: `Dispatched transfer ${transferRef} to store ${params.toStoreId}`,
              actorUid: actor.uid,
              actorName: actor.displayName,
              bsDate: params.bsDate,
              adDate,
              createdAt: serverTimestamp(),
            },
          });
        }
      }

      for (const [bId, q] of batchUpdates.entries()) {
        tx.update(doc(db, 'stockBatches', bId), { qtyRemaining: q, updatedAt: serverTimestamp() });
      }
      for (const lw of ledgerWrites) {
        tx.set(doc(db, 'stockLedger', lw.id), lw.data);
      }

      tx.set(doc(db, 'stockTransfers', transferId), {
        businessId: BUSINESS_ID,
        transferRef,
        fromStoreId: params.fromStoreId,
        toStoreId: params.toStoreId,
        bsDate: params.bsDate,
        status: 'dispatched',
        items: dispatchedItems,
        dispatchedByUid: actor.uid,
        dispatchedByName: actor.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await appendAuditLog(actor, 'DISPATCH_TRANSFER', 'stock_transfer', transferId, `Dispatched ${transferRef}`);
    return transferId;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Insufficient stock')) throw error;
    handleFirestoreError(error, OperationType.CREATE, `stockTransfers/${transferId}`);
  }
}

export async function confirmReceiveTransfer(
  actor: Employee,
  transfer: StockTransfer,
  receivedQuantities: number[]
): Promise<void> {
  if (transfer.status !== 'dispatched') throw new Error('Transfer already processed.');
  const bsDate = todayBs();
  const adDate = todayAd();

  try {
    await runTransaction(db, async (tx) => {
      const trfRef = doc(db, 'stockTransfers', transfer.id);
      const snap = await tx.get(trfRef);
      if (!snap.exists()) throw new Error('Transfer not found.');
      if (snap.data().status !== 'dispatched') throw new Error('Transfer already finalized.');

      const updatedItems = transfer.items.map((item, idx) => ({
        ...item,
        qtyReceived: Math.max(0, Number(receivedQuantities[idx] ?? item.qtyDispatched)),
      }));

      tx.update(trfRef, {
        status: 'received',
        items: updatedItems,
        receivedByUid: actor.uid,
        receivedByName: actor.displayName,
        updatedAt: serverTimestamp(),
      });

      for (const item of updatedItems) {
        if (item.qtyReceived <= 0) continue;
        const batchId = cleanId('batch');
        tx.set(
          doc(db, 'stockBatches', batchId),
          omitEmpty({
            businessId: BUSINESS_ID,
            storeId: transfer.toStoreId,
            productId: item.productId,
            itemCode: item.itemCode,
            batchNo: item.batchNo,
            expiryDateBs: item.expiryDateBs,
            expiryDateAd: item.expiryDateAd,
            unitCost: item.unitCost,
            qtyReceived: item.qtyReceived,
            qtyRemaining: item.qtyReceived,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
        tx.set(doc(db, 'stockLedger', cleanId('led')), {
          businessId: BUSINESS_ID,
          storeId: transfer.toStoreId,
          productId: item.productId,
          itemCode: item.itemCode,
          productName: item.productName,
          batchId,
          movementType: 'transfer_in',
          qtyDelta: item.qtyReceived,
          unitCost: item.unitCost,
          totalValue: Number((item.qtyReceived * item.unitCost).toFixed(2)),
          referenceType: 'stock_transfer',
          referenceId: transfer.id,
          referenceNo: transfer.transferRef,
          reason: `Received transfer ${transfer.transferRef} from ${transfer.fromStoreId}`,
          actorUid: actor.uid,
          actorName: actor.displayName,
          bsDate,
          adDate,
          createdAt: serverTimestamp(),
        });
      }
    });
    await appendAuditLog(actor, 'RECEIVE_TRANSFER', 'stock_transfer', transfer.id, `Received ${transfer.transferRef}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `stockTransfers/${transfer.id}`);
  }
}

export async function createStockCountSheet(
  actor: Employee,
  storeId: string,
  bsDate: string,
  products: Product[],
  batches: StockBatch[]
): Promise<string> {
  const countId = cleanId('cnt');
  const countRef = `CNT-${bsDate.replace(/-/g, '')}-${countId.slice(-4).toUpperCase()}`;
  const activeProducts = products.filter((p) => p.status === 'active');

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'stockCounts', countId), {
      businessId: BUSINESS_ID,
      countRef,
      storeId,
      bsDate,
      status: 'draft',
      totalItems: activeProducts.length,
      shortageCount: 0,
      excessCount: 0,
      netVarianceValue: 0,
      createdByUid: actor.uid,
      createdByName: actor.displayName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const p of activeProducts) {
      const storeProductBatches = batches.filter((b) => b.storeId === storeId && b.productId === p.id);
      const systemQty = Number(storeProductBatches.reduce((s, b) => s + b.qtyRemaining, 0).toFixed(4));
      const totalVal = storeProductBatches.reduce((s, b) => s + b.qtyRemaining * b.unitCost, 0);
      const unitCost = systemQty > 0 ? Number((totalVal / systemQty).toFixed(2)) : p.purchasePrice;

      batch.set(doc(db, 'stockCounts', countId, 'lines', p.id), {
        businessId: BUSINESS_ID,
        stockCountId: countId,
        productId: p.id,
        itemCode: p.itemCode,
        productName: p.name,
        systemQty,
        physicalQty: systemQty,
        varianceQty: 0,
        unitCost,
        varianceValue: 0,
        adjustmentPosted: false,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    await appendAuditLog(actor, 'CREATE_STOCK_COUNT', 'stock_count', countId, `Generated ${countRef} (${activeProducts.length} SKUs)`);
    return countId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `stockCounts/${countId}`);
  }
}

export async function saveStockCountLines(
  countId: string,
  lines: StockCountLine[],
  submitForApproval: boolean
): Promise<void> {
  try {
    const batch = writeBatch(db);
    let shortageCount = 0;
    let excessCount = 0;
    let netVarianceValue = 0;

    for (const line of lines) {
      const varianceQty = Number((line.physicalQty - line.systemQty).toFixed(4));
      const varianceValue = Number((varianceQty * line.unitCost).toFixed(2));
      if (varianceQty < 0) shortageCount++;
      if (varianceQty > 0) excessCount++;
      netVarianceValue += varianceValue;

      batch.update(
        doc(db, 'stockCounts', countId, 'lines', line.id),
        omitEmpty({
          physicalQty: line.physicalQty,
          varianceQty,
          varianceValue,
          reason: line.reason,
          updatedAt: serverTimestamp(),
        })
      );
    }

    batch.update(doc(db, 'stockCounts', countId), {
      status: submitForApproval ? 'submitted' : 'draft',
      shortageCount,
      excessCount,
      netVarianceValue: Number(netVarianceValue.toFixed(2)),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `stockCounts/${countId}`);
  }
}

export async function approveStockCountTransaction(
  actor: Employee,
  stockCount: StockCount,
  lines: StockCountLine[],
  allBatches: StockBatch[]
): Promise<void> {
  if (stockCount.status === 'approved') return;
  const adDate = bsToAd(stockCount.bsDate);

  try {
    await runTransaction(db, async (tx) => {
      const countDocRef = doc(db, 'stockCounts', stockCount.id);
      const countSnap = await tx.get(countDocRef);
      if (!countSnap.exists()) throw new Error('Stock count not found.');
      if (countSnap.data().status === 'approved') return;

      const storeBatches = allBatches.filter((b) => b.storeId === stockCount.storeId && b.qtyRemaining > 0);
      const batchCache = new Map<string, StockBatch>();
      for (const b of storeBatches) {
        const snap = await tx.get(doc(db, 'stockBatches', b.id));
        if (snap.exists()) batchCache.set(b.id, { id: snap.id, ...(snap.data() as Omit<StockBatch, 'id'>) });
      }

      const shortageCount = lines.filter((l) => l.varianceQty < 0).length;
      const excessCount = lines.filter((l) => l.varianceQty > 0).length;
      const netVarianceValue = Number(lines.reduce((s, l) => s + l.varianceValue, 0).toFixed(2));

      tx.update(countDocRef, {
        status: 'approved',
        approvedByUid: actor.uid,
        approvedByName: actor.displayName,
        shortageCount,
        excessCount,
        netVarianceValue,
        updatedAt: serverTimestamp(),
      });

      for (const line of lines) {
        tx.update(
          doc(db, 'stockCounts', stockCount.id, 'lines', line.id),
          omitEmpty({
            physicalQty: line.physicalQty,
            varianceQty: line.varianceQty,
            varianceValue: line.varianceValue,
            reason: line.reason,
            adjustmentPosted: true,
            updatedAt: serverTimestamp(),
          })
        );

        if (line.varianceQty === 0) continue;

        if (line.varianceQty > 0) {
          const newBatchId = cleanId('batch');
          tx.set(doc(db, 'stockBatches', newBatchId), {
            businessId: BUSINESS_ID,
            storeId: stockCount.storeId,
            productId: line.productId,
            itemCode: line.itemCode,
            batchNo: `CNT-${stockCount.countRef.slice(-4)}`,
            unitCost: line.unitCost,
            qtyReceived: line.varianceQty,
            qtyRemaining: line.varianceQty,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          tx.set(doc(db, 'stockLedger', cleanId('led')), {
            businessId: BUSINESS_ID,
            storeId: stockCount.storeId,
            productId: line.productId,
            itemCode: line.itemCode,
            productName: line.productName,
            batchId: newBatchId,
            movementType: 'count_adjustment',
            qtyDelta: line.varianceQty,
            unitCost: line.unitCost,
            totalValue: line.varianceValue,
            referenceType: 'stock_count',
            referenceId: stockCount.id,
            referenceNo: stockCount.countRef,
            reason: line.reason || `Weekly count excess (${stockCount.countRef})`,
            actorUid: actor.uid,
            actorName: actor.displayName,
            bsDate: stockCount.bsDate,
            adDate,
            createdAt: serverTimestamp(),
          });
        } else {
          let toDeduct = Math.abs(line.varianceQty);
          const productBatches = Array.from(batchCache.values())
            .filter((b) => b.productId === line.productId && b.qtyRemaining > 0)
            .sort((a, b) => (a.expiryDateAd || '9999-12-31').localeCompare(b.expiryDateAd || '9999-12-31'));

          for (const b of productBatches) {
            if (toDeduct <= 0) break;
            const take = Math.min(b.qtyRemaining, toDeduct);
            toDeduct -= take;
            b.qtyRemaining = Number((b.qtyRemaining - take).toFixed(4));
            tx.update(doc(db, 'stockBatches', b.id), {
              qtyRemaining: b.qtyRemaining,
              updatedAt: serverTimestamp(),
            });
            tx.set(doc(db, 'stockLedger', cleanId('led')), {
              businessId: BUSINESS_ID,
              storeId: stockCount.storeId,
              productId: line.productId,
              itemCode: line.itemCode,
              productName: line.productName,
              batchId: b.id,
              movementType: 'count_adjustment',
              qtyDelta: -take,
              unitCost: b.unitCost,
              totalValue: Number((-take * b.unitCost).toFixed(2)),
              referenceType: 'stock_count',
              referenceId: stockCount.id,
              referenceNo: stockCount.countRef,
              reason: line.reason || `Weekly count shortage (${stockCount.countRef})`,
              actorUid: actor.uid,
              actorName: actor.displayName,
              bsDate: stockCount.bsDate,
              adDate,
              createdAt: serverTimestamp(),
            });
          }
        }
      }
    });
    await appendAuditLog(actor, 'APPROVE_STOCK_COUNT', 'stock_count', stockCount.id, `Approved ${stockCount.countRef}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `stockCounts/${stockCount.id}`);
  }
}

export async function recordWasteTransaction(
  actor: Employee,
  params: {
    storeId: string;
    product: Product;
    batch?: StockBatch;
    wasteType: 'damaged' | 'expired';
    qty: number;
    reason: string;
    bsDate: string;
    allBatches: StockBatch[];
  }
): Promise<void> {
  const { storeId, product, batch: targetBatch, wasteType, qty, reason, bsDate, allBatches } = params;
  if (qty <= 0) throw new Error('Waste quantity must be greater than zero.');
  const adDate = bsToAd(bsDate);

  try {
    await runTransaction(db, async (tx) => {
      const candidateBatches = targetBatch
        ? [targetBatch]
        : allBatches
            .filter((b) => b.storeId === storeId && b.productId === product.id && b.qtyRemaining > 0)
            .sort((a, b) => (a.expiryDateAd || '9999-12-31').localeCompare(b.expiryDateAd || '9999-12-31'));

      const freshBatches: StockBatch[] = [];
      for (const cb of candidateBatches) {
        const snap = await tx.get(doc(db, 'stockBatches', cb.id));
        if (snap.exists()) freshBatches.push({ id: snap.id, ...(snap.data() as Omit<StockBatch, 'id'>) });
      }

      const available = freshBatches.reduce((s, b) => s + b.qtyRemaining, 0);
      if (available < qty) {
        throw new Error(`Available stock (${available}) is less than waste quantity (${qty}).`);
      }

      let remaining = qty;
      for (const b of freshBatches) {
        if (remaining <= 0) break;
        const take = Math.min(b.qtyRemaining, remaining);
        remaining -= take;
        const loss = Number((take * b.unitCost).toFixed(2));
        const wasteId = cleanId('wst');

        tx.update(doc(db, 'stockBatches', b.id), {
          qtyRemaining: Number((b.qtyRemaining - take).toFixed(4)),
          updatedAt: serverTimestamp(),
        });

        tx.set(doc(db, 'wasteRecords', wasteId), {
          businessId: BUSINESS_ID,
          storeId,
          productId: product.id,
          itemCode: product.itemCode,
          productName: product.name,
          batchId: b.id,
          batchNo: b.batchNo,
          wasteType,
          qty: take,
          unitCost: b.unitCost,
          financialLoss: loss,
          reason,
          bsDate,
          actorUid: actor.uid,
          actorName: actor.displayName,
          createdAt: serverTimestamp(),
        });

        tx.set(doc(db, 'stockLedger', cleanId('led')), {
          businessId: BUSINESS_ID,
          storeId,
          productId: product.id,
          itemCode: product.itemCode,
          productName: product.name,
          batchId: b.id,
          movementType: wasteType === 'expired' ? 'expiry' : 'damage',
          qtyDelta: -take,
          unitCost: b.unitCost,
          totalValue: -loss,
          referenceType: 'waste_record',
          referenceId: wasteId,
          referenceNo: b.batchNo,
          reason: `${wasteType.toUpperCase()}: ${reason}`,
          actorUid: actor.uid,
          actorName: actor.displayName,
          bsDate,
          adDate,
          createdAt: serverTimestamp(),
        });
      }
    });
    await appendAuditLog(actor, `RECORD_${wasteType.toUpperCase()}`, 'waste', product.id, `${qty} ${product.baseUnit} of ${product.itemCode}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Available stock')) throw error;
    handleFirestoreError(error, OperationType.WRITE, 'wasteRecords');
  }
}

export async function saveOnlineOrder(
  actor: Employee,
  params: {
    storeId: string;
    channel: 'phone' | 'whatsapp' | 'messenger' | 'online';
    customerId?: string;
    customerName: string;
    mobile: string;
    deliveryAddress: string;
    deliveryCharge: number;
    items: OnlineOrderItem[];
    discountAmount: number;
    paymentMethod: PaymentAllocationMethod;
    assignedDeliveryUid?: string;
    assignedDeliveryName?: string;
    notes?: string;
    bsDate: string;
  }
): Promise<string> {
  const id = cleanId('ord');
  const orderNo = `ORD-${params.bsDate.replace(/-/g, '')}-${id.slice(-4).toUpperCase()}`;
  const subtotal = Number(params.items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2));
  const netTotal = Number(Math.max(0, subtotal - params.discountAmount + params.deliveryCharge).toFixed(2));
  try {
    await setDoc(
      doc(db, 'onlineOrders', id),
      omitEmpty({
        businessId: BUSINESS_ID,
        orderNo,
        storeId: params.storeId,
        channel: params.channel,
        customerId: params.customerId,
        customerName: params.customerName,
        mobile: params.mobile,
        deliveryAddress: params.deliveryAddress,
        deliveryCharge: Number(params.deliveryCharge),
        items: params.items,
        subtotal,
        discountAmount: Number(params.discountAmount),
        netTotal,
        orderStatus: 'received',
        paymentStatus: 'unpaid',
        paymentMethod: params.paymentMethod,
        assignedDeliveryUid: params.assignedDeliveryUid,
        assignedDeliveryName: params.assignedDeliveryName,
        notes: params.notes,
        bsDate: params.bsDate,
        createdByUid: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await appendAuditLog(actor, 'CREATE_ORDER', 'online_order', id, `Created ${orderNo} via ${params.channel}`);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `onlineOrders/${id}`);
  }
}

export async function updateOnlineOrderStage(
  actor: Employee,
  order: OnlineOrder,
  updates: {
    orderStatus?: OnlineOrderStatus;
    paymentStatus?: 'unpaid' | 'partial' | 'paid';
    assignedDeliveryUid?: string;
    assignedDeliveryName?: string;
    linkedInvoiceId?: string;
    notes?: string;
  }
): Promise<void> {
  try {
    await updateDoc(
      doc(db, 'onlineOrders', order.id),
      omitEmpty({
        orderStatus: updates.orderStatus,
        paymentStatus: updates.paymentStatus,
        assignedDeliveryUid: updates.assignedDeliveryUid,
        assignedDeliveryName: updates.assignedDeliveryName,
        linkedInvoiceId: updates.linkedInvoiceId,
        notes: updates.notes,
        updatedAt: serverTimestamp(),
      })
    );
    await appendAuditLog(actor, 'UPDATE_ORDER', 'online_order', order.id, `Updated ${order.orderNo} -> ${updates.orderStatus || order.orderStatus}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `onlineOrders/${order.id}`);
  }
}

export async function saveExpense(
  actor: Employee,
  expense: {
    storeId: string;
    category: ExpenseCategory;
    amount: number;
    paymentMethod: 'cash' | 'bank_transfer' | 'qr' | 'mobile_wallet';
    description: string;
    referenceNo?: string;
    bsDate: string;
  }
): Promise<string> {
  const id = cleanId('exp');
  try {
    await setDoc(
      doc(db, 'expenses', id),
      omitEmpty({
        businessId: BUSINESS_ID,
        storeId: expense.storeId,
        category: expense.category,
        amount: Number(expense.amount),
        paymentMethod: expense.paymentMethod,
        description: expense.description,
        referenceNo: expense.referenceNo,
        bsDate: expense.bsDate,
        actorUid: actor.uid,
        actorName: actor.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await appendAuditLog(actor, 'CREATE_EXPENSE', 'expense', id, `Logged ${expense.category} expense NPR ${expense.amount}`);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `expenses/${id}`);
  }
}

export async function inviteOrUpdateEmployee(
  actor: Employee,
  params: {
    existingEmployee?: Employee;
    email: string;
    displayName: string;
    phone?: string;
    role: EmployeeRole;
    storeId?: string;
    permissions: RolePermissions;
    active: boolean;
  }
): Promise<void> {
  const emailLower = params.email.trim().toLowerCase();
  try {
    if (params.existingEmployee) {
      await updateDoc(
        doc(db, 'employees', params.existingEmployee.id),
        omitEmpty({
          displayName: params.displayName,
          phone: params.phone,
          role: params.role,
          storeId: params.storeId,
          permissions: params.permissions,
          active: params.active,
          updatedAt: serverTimestamp(),
        })
      );
      await appendAuditLog(actor, 'UPDATE_EMPLOYEE', 'employee', params.existingEmployee.id, `Updated ${emailLower} (${params.role})`);
    } else {
      await setDoc(
        doc(db, 'employeeInvites', emailLower),
        omitEmpty({
          businessId: BUSINESS_ID,
          emailLower,
          displayName: params.displayName,
          phone: params.phone,
          role: params.role,
          storeId: params.storeId,
          permissions: params.permissions,
          active: params.active,
          invitedByUid: actor.uid,
          createdAt: serverTimestamp(),
        })
      );
      await appendAuditLog(actor, 'INVITE_EMPLOYEE', 'employee_invite', emailLower, `Invited ${emailLower} as ${params.role}`);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'employees');
  }
}

export async function submitDayClose(
  actor: Employee,
  params: {
    store: { id: string; code: string; name: string };
    bsDate: string;
    invoiceCount: number;
    reversedCount: number;
    grossSalesTotal: number;
    grossProfitTotal: number;
    cashSales: number;
    qrSales: number;
    bankTransferSales: number;
    mobileWalletSales: number;
    creditSales: number;
    cashRecoveries: number;
    digitalRecoveries: number;
    cashExpenses: number;
    totalExpenses: number;
    cashSupplierPayments: number;
    openingCash: number;
    expectedCash: number;
    actualCashCounted: number;
    cashVariance: number;
    bankDepositAmount: number;
    closingCashRetained: number;
    denominations?: Record<string, number>;
    notes?: string;
  }
): Promise<DayClose> {
  const { store, bsDate } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bsDate)) {
    throw new Error('BS Date must be YYYY-MM-DD.');
  }
  const dayCloseId = `dc_${store.id}_${bsDate}`;
  const ref = doc(db, 'dayCloses', dayCloseId);
  const closeRef = `DC-${store.code}-${bsDate.replace(/-/g, '')}`;
  const adDate = bsToAd(bsDate);

  try {
    const saved = await runTransaction(db, async (tx) => {
      const existingSnap = await tx.get(ref);
      if (existingSnap.exists()) {
        throw new Error(`Day close for ${store.code} on ${bsDate} BS is already recorded.`);
      }

      const payload = omitEmpty({
        businessId: BUSINESS_ID,
        closeRef,
        storeId: store.id,
        bsDate,
        adDate,
        status: 'closed' as const,
        invoiceCount: Number(params.invoiceCount),
        reversedCount: Number(params.reversedCount),
        grossSalesTotal: Number(params.grossSalesTotal.toFixed(2)),
        grossProfitTotal: Number(params.grossProfitTotal.toFixed(2)),
        cashSales: Number(params.cashSales.toFixed(2)),
        qrSales: Number(params.qrSales.toFixed(2)),
        bankTransferSales: Number(params.bankTransferSales.toFixed(2)),
        mobileWalletSales: Number(params.mobileWalletSales.toFixed(2)),
        creditSales: Number(params.creditSales.toFixed(2)),
        cashRecoveries: Number(params.cashRecoveries.toFixed(2)),
        digitalRecoveries: Number(params.digitalRecoveries.toFixed(2)),
        cashExpenses: Number(params.cashExpenses.toFixed(2)),
        totalExpenses: Number(params.totalExpenses.toFixed(2)),
        cashSupplierPayments: Number(params.cashSupplierPayments.toFixed(2)),
        openingCash: Number(params.openingCash.toFixed(2)),
        expectedCash: Number(params.expectedCash.toFixed(2)),
        actualCashCounted: Number(params.actualCashCounted.toFixed(2)),
        cashVariance: Number(params.cashVariance.toFixed(2)),
        bankDepositAmount: Number(params.bankDepositAmount.toFixed(2)),
        closingCashRetained: Number(params.closingCashRetained.toFixed(2)),
        denominations: params.denominations,
        notes: params.notes?.trim() || undefined,
        closedByUid: actor.uid,
        closedByName: actor.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(ref, payload);
      return { id: dayCloseId, ...(payload as unknown as Omit<DayClose, 'id'>) };
    });

    await appendAuditLog(
      actor,
      'DAY_CLOSE',
      'day_close',
      dayCloseId,
      `Closed day ${bsDate} for ${store.code}: Sales NPR ${saved.grossSalesTotal}, Variance NPR ${saved.cashVariance}`
    );
    return saved;
  } catch (error) {
    if (error instanceof Error && error.message.includes('already recorded')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, `dayCloses/${dayCloseId}`);
  }
}

export async function verifyDayClose(
  actor: Employee,
  dayClose: DayClose,
  notes?: string
): Promise<void> {
  if (dayClose.status === 'verified') return;
  try {
    await updateDoc(
      doc(db, 'dayCloses', dayClose.id),
      omitEmpty({
        status: 'verified',
        verifiedByUid: actor.uid,
        verifiedByName: actor.displayName,
        notes: notes !== undefined ? notes.trim() || dayClose.notes : dayClose.notes,
        updatedAt: serverTimestamp(),
      })
    );
    await appendAuditLog(
      actor,
      'VERIFY_DAY_CLOSE',
      'day_close',
      dayClose.id,
      `Verified day close ${dayClose.closeRef} (${dayClose.bsDate})`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `dayCloses/${dayClose.id}`);
  }
}

export async function saveComboOffer(
  actor: Employee,
  existingOffers: ComboOffer[],
  params: {
    id?: string;
    offerCode: string;
    name: string;
    nameNe?: string;
    offerType: ComboOfferType;
    campaignTag?: string;
    storeId: string;
    items: ComboOfferItem[];
    offerRate: number;
    validFromBs?: string;
    validToBs?: string;
    active: boolean;
    notes?: string;
  }
): Promise<string> {
  const normalizedCode = params.offerCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
  if (normalizedCode.length < 2) {
    throw new Error('Offer code must be at least 2 alphanumeric characters (e.g. FAM-PACK-01).');
  }
  const duplicate = existingOffers.find(
    (o) => o.offerCode === normalizedCode && o.id !== params.id
  );
  if (duplicate) {
    throw new Error(`Duplicate offer code "${normalizedCode}" already exists for ${duplicate.name}.`);
  }
  if (!params.items.length || params.items.length > 30) {
    throw new Error('Combo offer must contain between 1 and 30 items.');
  }
  for (const it of params.items) {
    if (!(it.fixedQty > 0)) {
      throw new Error(`Fixed quantity must be greater than zero for ${it.itemCode}.`);
    }
  }
  if (params.offerRate < 0) {
    throw new Error('Offer rate cannot be negative.');
  }

  const validFrom = params.validFromBs?.trim() || '';
  const validTo = params.validToBs?.trim() || '';
  if (validFrom && !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
    throw new Error('Valid From BS date must be YYYY-MM-DD (or leave blank).');
  }
  if (validTo && !/^\d{4}-\d{2}-\d{2}$/.test(validTo)) {
    throw new Error('Valid To BS date must be YYYY-MM-DD (or leave blank).');
  }

  const sanitizedItems: ComboOfferItem[] = params.items.map((it) => ({
    productId: it.productId,
    itemCode: it.itemCode,
    productName: it.productName,
    unit: it.unit,
    fixedQty: Number(it.fixedQty),
    regularUnitPrice: Number(it.regularUnitPrice),
  }));

  const regularTotal = Number(
    sanitizedItems
      .reduce((sum, it) => sum + it.fixedQty * it.regularUnitPrice, 0)
      .toFixed(2)
  );
  const offerRate = Number(Number(params.offerRate).toFixed(2));
  const savingsAmount = Number((regularTotal - offerRate).toFixed(2));

  const id = params.id || `combo_${normalizedCode}`;
  const ref = doc(db, 'comboOffers', id);

  try {
    if (params.id) {
      await updateDoc(ref, {
        name: params.name.trim(),
        nameNe: params.nameNe?.trim() ? params.nameNe.trim() : deleteField(),
        offerType: params.offerType,
        campaignTag: params.campaignTag?.trim() ? params.campaignTag.trim() : deleteField(),
        storeId: params.storeId || 'all',
        items: sanitizedItems,
        regularTotal,
        offerRate,
        savingsAmount,
        validFromBs: validFrom ? validFrom : deleteField(),
        validToBs: validTo ? validTo : deleteField(),
        active: params.active,
        notes: params.notes?.trim() ? params.notes.trim() : deleteField(),
        updatedAt: serverTimestamp(),
      });
      await appendAuditLog(
        actor,
        'UPDATE_COMBO_OFFER',
        'combo_offer',
        id,
        `Updated combo ${normalizedCode} (${params.name}) at NPR ${offerRate}`
      );
    } else {
      await setDoc(
        ref,
        omitEmpty({
          businessId: BUSINESS_ID,
          offerCode: normalizedCode,
          name: params.name.trim(),
          nameNe: params.nameNe?.trim(),
          offerType: params.offerType,
          campaignTag: params.campaignTag?.trim(),
          storeId: params.storeId || 'all',
          items: sanitizedItems,
          regularTotal,
          offerRate,
          savingsAmount,
          validFromBs: validFrom || undefined,
          validToBs: validTo || undefined,
          active: params.active,
          notes: params.notes?.trim(),
          createdByUid: actor.uid,
          createdByName: actor.displayName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
      await appendAuditLog(
        actor,
        'CREATE_COMBO_OFFER',
        'combo_offer',
        id,
        `Created combo ${normalizedCode} (${params.name}) for NPR ${offerRate}`
      );
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `comboOffers/${id}`);
  }
}

export async function toggleComboOfferStatus(
  actor: Employee,
  offer: ComboOffer
): Promise<void> {
  const nextActive = !offer.active;
  try {
    await updateDoc(doc(db, 'comboOffers', offer.id), {
      active: nextActive,
      updatedAt: serverTimestamp(),
    });
    await appendAuditLog(
      actor,
      nextActive ? 'ACTIVATE_COMBO_OFFER' : 'DEACTIVATE_COMBO_OFFER',
      'combo_offer',
      offer.id,
      `Set combo ${offer.offerCode} active=${nextActive}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `comboOffers/${offer.id}`);
  }
}

export interface ExpandedComboLine {
  product?: Product;
  itemCode: string;
  productName: string;
  unit: BaseUnit;
  qty: number;
  unitPrice: number;
  discount: number;
  taxType: TaxType;
}

export function expandComboOfferLines(
  offer: ComboOffer,
  packCount: number,
  products: Product[]
): ExpandedComboLine[] {
  const packs = Math.max(1, Math.floor(packCount || 1));
  const targetBundleTotal = Number((offer.offerRate * packs).toFixed(2));
  const regularBundleTotal = Number(
    offer.items
      .reduce((sum, it) => sum + it.fixedQty * packs * it.regularUnitPrice, 0)
      .toFixed(2)
  );
  const totalDiscountNeeded = Math.max(0, Number((regularBundleTotal - targetBundleTotal).toFixed(2)));
  const needsCustomRate = regularBundleTotal === 0 || targetBundleTotal > regularBundleTotal;

  let distributedDiscount = 0;

  return offer.items.map((item, idx) => {
    const matchedProduct =
      products.find((p) => p.id === item.productId || p.itemCode === item.itemCode);
    const qty = Number((item.fixedQty * packs).toFixed(4));
    const unitPrice = needsCustomRate
      ? Number((targetBundleTotal / offer.items.length / qty).toFixed(2))
      : item.regularUnitPrice;
    const lineGross = Number((qty * unitPrice).toFixed(2));

    let discount = 0;
    if (!needsCustomRate && totalDiscountNeeded > 0 && regularBundleTotal > 0) {
      if (idx === offer.items.length - 1) {
        discount = Math.max(0, Number((totalDiscountNeeded - distributedDiscount).toFixed(2)));
      } else {
        discount = Number(((lineGross / regularBundleTotal) * totalDiscountNeeded).toFixed(2));
        distributedDiscount = Number((distributedDiscount + discount).toFixed(2));
      }
      discount = Math.min(discount, lineGross);
    }

    return {
      product: matchedProduct,
      itemCode: item.itemCode,
      productName: matchedProduct?.name || item.productName,
      unit: matchedProduct?.baseUnit || item.unit,
      qty,
      unitPrice,
      discount,
      taxType: matchedProduct?.taxType || 'exempt',
    };
  });
}
