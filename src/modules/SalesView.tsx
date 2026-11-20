import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Check, RotateCcw, Gift } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import {
  confirmSaleTransaction,
  expandComboOfferLines,
  reverseSaleTransaction,
} from '../lib/erpService';
import { formatNPR, todayBs } from '../lib/bsDate';
import { CHANNEL_LABELS, PAYMENT_LABELS } from '../lib/i18n';
import { InvoiceModal } from '../components/InvoiceModal';
import type {
  ComboOffer,
  PaymentAllocation,
  PaymentAllocationMethod,
  Product,
  SalesChannel,
  SalesInvoice,
} from '../types/erp';

interface CartRow {
  product: Product;
  qty: number;
  unitPrice: number;
  discount: number;
}

export function SalesView() {
  const {
    stores,
    products,
    stockBatches,
    customers,
    salesInvoices,
    comboOffers,
    pendingPosCombo,
    clearPendingPosCombo,
    settings,
    selectedStoreId,
    employee,
    isOnline,
    queueOfflineSale,
    notify,
    language,
  } = useApp();

  const [storeId, setStoreId] = useState(selectedStoreId !== 'all' ? selectedStoreId : stores[0]?.id || '');
  const [bsDate, setBsDate] = useState(todayBs());
  const [channel, setChannel] = useState<SalesChannel>('walk_in');
  const [customerId, setCustomerId] = useState<string>('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const [itemQuery, setItemQuery] = useState('');
  const [selectedComboId, setSelectedComboId] = useState('');
  const [comboPacks, setComboPacks] = useState(1);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([
    { method: 'cash', amount: 0 },
  ]);
  const [clientRequestId, setClientRequestId] = useState(() => `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const [busy, setBusy] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<SalesInvoice | null>(null);
  const [reversingInvoice, setReversingInvoice] = useState<SalesInvoice | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  const activeStore = stores.find((s) => s.id === (storeId || stores[0]?.id));
  const activeCustomer = customers.find((c) => c.id === customerId);

  const stockMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of stockBatches) {
      if (activeStore && b.storeId === activeStore.id) {
        map[b.productId] = (map[b.productId] || 0) + b.qtyRemaining;
      }
    }
    return map;
  }, [stockBatches, activeStore]);

  const matchingProducts = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.status === 'active' &&
          (p.itemCode.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            (p.barcode || '').toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [products, itemQuery]);

  const activeComboOffers = useMemo(() => {
    return comboOffers.filter(
      (o) =>
        o.active &&
        (o.storeId === 'all' || !activeStore || o.storeId === activeStore.id)
    );
  }, [comboOffers, activeStore]);

  const applyComboToCart = useCallback(
    (offer: ComboOffer, packCount: number) => {
      const packs = Math.max(1, Math.floor(packCount || 1));
      const expanded = expandComboOfferLines(offer, packs, products);
      const missing = expanded.filter((l) => !l.product);
      if (missing.length > 0) {
        notify(
          'error',
          `Product ${missing[0].itemCode} in combo ${offer.offerCode} is missing from Product Master.`
        );
        return;
      }
      setCart((prev) => [
        ...prev,
        ...expanded.map((l) => ({
          product: l.product!,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discount: l.discount,
        })),
      ]);
      notify(
        'success',
        `Added ${packs}x ${offer.name} (${formatNPR(offer.offerRate * packs, language)}) to bill.`
      );
    },
    [products, notify, language]
  );

  useEffect(() => {
    if (pendingPosCombo) {
      applyComboToCart(pendingPosCombo.combo, pendingPosCombo.packs);
      clearPendingPosCombo();
    }
  }, [pendingPosCombo, applyComboToCart, clearPendingPosCombo]);

  const addToCart = (p: Product) => {
    const price = channel === 'wholesale' ? p.wholesalePrice : p.sellingPrice;
    setCart((prev) => {
      const existing = prev.find((r) => r.product.id === p.id && r.discount === 0 && r.unitPrice === price);
      if (existing) {
        return prev.map((r) =>
          r === existing ? { ...r, qty: r.qty + 1 } : r
        );
      }
      return [...prev, { product: p, qty: 1, unitPrice: price, discount: 0 }];
    });
    setItemQuery('');
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let lineDisc = 0;
    let taxAmount = 0;
    const vatRate = settings.defaultVatRate || 13;
    for (const row of cart) {
      const gross = row.qty * row.unitPrice;
      const taxable = Math.max(0, gross - row.discount);
      const rate =
        activeStore?.taxMode === 'vat_13' && row.product.taxType === 'vat_13' ? vatRate : 0;
      subtotal += gross;
      lineDisc += row.discount;
      taxAmount += (taxable * rate) / 100;
    }
    const netTotal = Math.max(0, subtotal - lineDisc - invoiceDiscount + taxAmount);
    return {
      subtotal: Number(subtotal.toFixed(2)),
      discountTotal: Number((lineDisc + invoiceDiscount).toFixed(2)),
      taxAmount: Number(taxAmount.toFixed(2)),
      netTotal: Number(netTotal.toFixed(2)),
    };
  }, [cart, invoiceDiscount, activeStore, settings.defaultVatRate]);

  const syncSinglePaymentAmount = () => {
    if (allocations.length === 1) {
      setAllocations([{ ...allocations[0], amount: totals.netTotal }]);
    }
  };

  const requiresRegistered = totals.netTotal >= settings.smallRetailThreshold;

  const handleConfirmSale = async () => {
    if (!employee || !activeStore) return;
    if (cart.length === 0) {
      notify('error', 'Add at least one item to the bill.');
      return;
    }

    const effectiveAllocations =
      allocations.length === 1 && allocations[0].amount === 0
        ? [{ ...allocations[0], amount: totals.netTotal }]
        : allocations;

    const payload = {
      clientRequestId,
      store: { id: activeStore.id, code: activeStore.code, taxMode: activeStore.taxMode },
      bsDate,
      channel,
      customer: activeCustomer,
      isAnonymous: isAnonymous && settings.allowAnonymousRetail,
      smallRetailThreshold: settings.smallRetailThreshold,
      vatRate: settings.defaultVatRate,
      cartItems: cart,
      invoiceDiscount,
      paymentAllocations: effectiveAllocations,
      allBatches: stockBatches,
    };

    if (!isOnline) {
      queueOfflineSale({
        clientRequestId,
        createdAtIso: new Date().toISOString(),
        payload,
      });
      setCart([]);
      setInvoiceDiscount(0);
      setClientRequestId(`req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
      return;
    }

    setBusy(true);
    try {
      const inv = await confirmSaleTransaction(employee, payload);
      notify('success', `Confirmed ${inv.invoiceNo} · ${formatNPR(inv.netTotal, language)}`);
      setPreviewInvoice(inv);
      setCart([]);
      setInvoiceDiscount(0);
      setAllocations([{ method: 'cash', amount: 0 }]);
      setClientRequestId(`req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to confirm sale.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !reversingInvoice || !reversalReason.trim()) return;
    setBusy(true);
    try {
      await reverseSaleTransaction(employee, reversingInvoice, reversalReason.trim());
      notify('success', `Reversed ${reversingInvoice.invoiceNo} and restored store stock.`);
      setReversingInvoice(null);
      setReversalReason('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Reversal failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left: Fast Sales Entry */}
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="space-y-1 block">
              <span>Store *</span>
              <select
                value={activeStore?.id || ''}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span>BS Date *</span>
              <input
                value={bsDate}
                onChange={(e) => setBsDate(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Sales Channel *</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as SalesChannel)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {(Object.keys(CHANNEL_LABELS) as SalesChannel[]).map((ch) => (
                  <option key={ch} value={ch}>
                    {CHANNEL_LABELS[ch][language]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Item Code Search */}
          <div className="relative">
            <input
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              placeholder="Scan barcode or type Item Code / Product Name (e.g., RICE001)..."
              className="w-full h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
            />
            {matchingProducts.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {matchingProducts.map((p) => {
                  const avail = stockMap[p.id] || 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addToCart(p)}
                      className="w-full px-3.5 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <div>
                        <span className="font-mono font-semibold">{p.itemCode}</span> · {p.name}
                      </div>
                      <div className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        Stock: {avail} {p.baseUnit} · {formatNPR(channel === 'wholesale' ? p.wholesalePrice : p.sellingPrice)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Special Combo / Offer Pack Quick-Add */}
          {activeComboOffers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs">
              <div className="inline-flex items-center gap-1.5 font-medium text-teal-700 dark:text-teal-400 shrink-0">
                <Gift className="w-3.5 h-3.5" />
                <span>Combo Offer Pack:</span>
              </div>
              <select
                value={selectedComboId}
                onChange={(e) => setSelectedComboId(e.target.value)}
                className="flex-1 min-w-[200px] h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">-- Select Monthly / Weekend / Festival Pack --</option>
                {activeComboOffers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.offerCode} · {o.name} ({o.items.length} items) — {formatNPR(o.offerRate)}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-1 shrink-0">
                <span className="text-slate-500">Packs:</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={comboPacks}
                  onChange={(e) => setComboPacks(Math.max(1, Number(e.target.value) || 1))}
                  className="w-14 h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono"
                />
              </label>
              <button
                type="button"
                disabled={!selectedComboId}
                onClick={() => {
                  const found = activeComboOffers.find((o) => o.id === selectedComboId);
                  if (found) {
                    applyComboToCart(found, comboPacks);
                    setSelectedComboId('');
                    setComboPacks(1);
                  }
                }}
                className="h-8 px-3 rounded bg-teal-700 hover:bg-teal-800 text-white font-medium disabled:opacity-50 cursor-pointer shrink-0"
              >
                Add Combo Pack
              </button>
            </div>
          )}

          {/* Cart Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Item</th>
                  <th className="text-right px-3 py-2 font-medium">Stock</th>
                  <th className="text-right px-3 py-2 font-medium">Qty</th>
                  <th className="text-right px-3 py-2 font-medium">Rate</th>
                  <th className="text-right px-3 py-2 font-medium">Disc</th>
                  <th className="text-right px-3 py-2 font-medium">Line Net</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cart.map((row, idx) => {
                  const lineNet = Math.max(0, row.qty * row.unitPrice - row.discount);
                  return (
                    <tr key={`${row.product.id}_${idx}`}>
                      <td className="px-3 py-2">
                        <div className="font-mono font-medium">{row.product.itemCode}</div>
                        <div className="text-slate-500">{row.product.name}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                        {stockMap[row.product.id] || 0}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={row.qty}
                          onChange={(e) =>
                            setCart((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, qty: Number(e.target.value) } : r))
                            )
                          }
                          className="w-16 h-7 px-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.unitPrice}
                          onChange={(e) =>
                            setCart((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, unitPrice: Number(e.target.value) } : r))
                            )
                          }
                          className="w-20 h-7 px-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.discount}
                          onChange={(e) =>
                            setCart((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, discount: Number(e.target.value) } : r))
                            )
                          }
                          className="w-16 h-7 px-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                        {lineNet.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Search by Item Code or Product Name above to build the invoice.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Customer Category & Split Payments */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Customer Classification</span>
              <span className="font-mono text-[11px] text-slate-500">
                Threshold: NPR {settings.smallRetailThreshold}
              </span>
            </div>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="">
                {requiresRegistered
                  ? '-- Select Registered Customer (Required) --'
                  : 'Small Retail Walk-in (No registration needed)'}
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customerCode} · {c.name} ({c.mobile}) · Bal: {c.currentBalance}
                </option>
              ))}
            </select>
            {requiresRegistered && !customerId && settings.allowAnonymousRetail && (
              <label className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                />
                <span>Authorize Anonymous Transaction (&ge; NPR {settings.smallRetailThreshold})</span>
              </label>
            )}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-mono tabular-nums">{formatNPR(totals.subtotal, language)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Extra Discount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={invoiceDiscount}
                onChange={(e) => setInvoiceDiscount(Number(e.target.value))}
                className="w-24 h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono"
              />
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">VAT / Tax</span>
              <span className="font-mono tabular-nums">{formatNPR(totals.taxAmount, language)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t border-slate-200 dark:border-slate-800 pt-2">
              <span>Net Total</span>
              <span className="font-mono tabular-nums text-teal-700 dark:text-teal-400">
                {formatNPR(totals.netTotal, language)}
              </span>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Payment Split</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={syncSinglePaymentAmount}
                  className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  Fill Exact
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAllocations((prev) => [...prev, { method: 'qr', amount: 0 }])
                  }
                  className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:underline cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Split
                </button>
              </div>
            </div>
            {allocations.map((al, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={al.method}
                  onChange={(e) =>
                    setAllocations((prev) =>
                      prev.map((a, i) =>
                        i === idx ? { ...a, method: e.target.value as PaymentAllocationMethod } : a
                      )
                    )
                  }
                  className="flex-1 h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  {(['cash', 'qr', 'bank_transfer', 'mobile_wallet', 'credit'] as const).map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_LABELS[m][language]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={al.amount}
                  onChange={(e) =>
                    setAllocations((prev) =>
                      prev.map((a, i) => (i === idx ? { ...a, amount: Number(e.target.value) } : a))
                    )
                  }
                  className="w-24 h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono"
                />
                {allocations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setAllocations((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleConfirmSale}
            disabled={busy || cart.length === 0}
            className="w-full py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            {busy ? 'Processing FIFO & Invoice...' : 'Confirm Sale & Print'}
          </button>
        </div>
      </div>

      {/* Recent Sales */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
          Recent Daily Sales Transactions
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Invoice No</th>
                <th className="text-left px-4 py-2 font-medium">BS Date</th>
                <th className="text-left px-4 py-2 font-medium">Channel</th>
                <th className="text-left px-4 py-2 font-medium">Customer</th>
                <th className="text-right px-4 py-2 font-medium">Net Total</th>
                <th className="text-right px-4 py-2 font-medium">Paid / Credit</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {salesInvoices
                .filter((i) => selectedStoreId === 'all' || i.storeId === selectedStoreId)
                .sort((a, b) => b.bsDate.localeCompare(a.bsDate))
                .slice(0, 20)
                .map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-2 font-mono font-medium">{inv.invoiceNo}</td>
                    <td className="px-4 py-2 font-mono">{inv.bsDate}</td>
                    <td className="px-4 py-2">{CHANNEL_LABELS[inv.channel]?.[language]}</td>
                    <td className="px-4 py-2">{inv.customerName || 'Small Retail'}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-medium">
                      {formatNPR(inv.netTotal, language)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {inv.amountPaid.toFixed(0)} / {inv.creditAmount.toFixed(0)}
                    </td>
                    <td className="px-4 py-2">
                      <span className={inv.status === 'confirmed' ? 'text-emerald-700' : 'text-red-600'}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <button
                        onClick={() => setPreviewInvoice(inv)}
                        className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                      >
                        Print
                      </button>
                      {inv.status === 'confirmed' &&
                        (employee?.role === 'owner' ||
                          employee?.role === 'store_manager' ||
                          employee?.permissions.canReverseSales) && (
                          <button
                            onClick={() => {
                              setReversingInvoice(inv);
                              setReversalReason('');
                            }}
                            className="text-red-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" /> Reverse
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {reversingInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmReverse}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs shadow-xl"
          >
            <div className="text-sm font-semibold">
              Reverse Invoice <span className="font-mono">{reversingInvoice.invoiceNo}</span>
            </div>
            <p className="text-slate-500">
              Reversing restores all FIFO batch quantities back into store inventory and logs an immutable reversal ledger entry.
            </p>
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Reason for Reversal *</span>
              <input
                required
                autoFocus
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="Customer returned damaged item / billing error..."
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReversingInvoice(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !reversalReason.trim()}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 cursor-pointer"
              >
                {busy ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </form>
        </div>
      )}

      {previewInvoice && (
        <InvoiceModal invoice={previewInvoice} onClose={() => setPreviewInvoice(null)} />
      )}
    </div>
  );
}
