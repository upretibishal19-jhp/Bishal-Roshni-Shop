import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { recordOpeningOrAdjustmentStock } from '../lib/erpService';
import { formatNPR, todayBs } from '../lib/bsDate';

export function InventoryView() {
  const {
    products,
    stores,
    stockBatches,
    stockLedger,
    salesInvoices,
    goodsReceipts,
    selectedStoreId,
    bsStart,
    bsEnd,
    employee,
    notify,
    language,
  } = useApp();

  const [tab, setTab] = useState<'stock' | 'monthly_report' | 'ledger'>('stock');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [showAdjust, setShowAdjust] = useState(false);

  const [adjStoreId, setAdjStoreId] = useState(stores[0]?.id || '');
  const [adjProductId, setAdjProductId] = useState('');
  const [adjType, setAdjType] = useState<'opening' | 'manual_adjustment' | 'customer_return' | 'supplier_return'>('opening');
  const [adjQty, setAdjQty] = useState(0);
  const [adjCost, setAdjCost] = useState(0);
  const [adjBatchNo, setAdjBatchNo] = useState('');
  const [adjExpiryBs, setAdjExpiryBs] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjDateBs, setAdjDateBs] = useState(todayBs());
  const [busy, setBusy] = useState(false);

  const canAdjust =
    employee &&
    (employee.role === 'owner' ||
      employee.role === 'inventory_controller' ||
      employee.role === 'store_manager' ||
      employee.permissions.canApproveStockAdjustments);

  const stockRows = useMemo(() => {
    return products.map((p) => {
      const relevant = stockBatches.filter(
        (b) => b.productId === p.id && (selectedStoreId === 'all' || b.storeId === selectedStoreId)
      );
      const qty = relevant.reduce((s, b) => s + b.qtyRemaining, 0);
      const val = relevant.reduce((s, b) => s + b.qtyRemaining * b.unitCost, 0);
      return {
        product: p,
        qty,
        val,
        status: qty <= 0 ? 'Out of Stock' : qty <= p.minStock ? 'Reorder Needed' : 'In Stock',
      };
    });
  }, [products, stockBatches, selectedStoreId]);

  const activeProductId = selectedProductId || products[0]?.id || '';
  const activeProduct = products.find((p) => p.id === activeProductId);

  const monthlyMovement = useMemo(() => {
    if (!activeProduct) return null;
    const entries = stockLedger.filter(
      (l) =>
        l.productId === activeProduct.id &&
        (selectedStoreId === 'all' || l.storeId === selectedStoreId)
    );

    const opening = entries
      .filter((l) => l.bsDate < bsStart)
      .reduce((s, l) => s + l.qtyDelta, 0);

    const inPeriod = entries.filter((l) => l.bsDate >= bsStart && l.bsDate <= bsEnd);
    const sumType = (types: string[]) =>
      inPeriod.filter((l) => types.includes(l.movementType)).reduce((s, l) => s + l.qtyDelta, 0);

    const openingInPeriod = sumType(['opening']);
    const purchased = sumType(['purchase_grn']);
    const transfersIn = sumType(['transfer_in']);
    const sold = Math.abs(sumType(['sale']));
    const saleReversal = sumType(['sale_reversal', 'customer_return']);
    const damagedExpired = Math.abs(sumType(['damage', 'expiry']));
    const transfersOut = Math.abs(sumType(['transfer_out']));
    const adjustments = sumType(['count_adjustment', 'manual_adjustment', 'supplier_return']);

    const closing =
      opening +
      openingInPeriod +
      purchased +
      transfersIn -
      sold +
      saleReversal -
      damagedExpired -
      transfersOut +
      adjustments;

    const totalPurchaseValue = inPeriod
      .filter((l) => l.movementType === 'purchase_grn')
      .reduce((s, l) => s + l.totalValue, 0);

    const relatedInvoices = salesInvoices.filter(
      (inv) =>
        inv.status === 'confirmed' &&
        (selectedStoreId === 'all' || inv.storeId === selectedStoreId) &&
        inv.bsDate >= bsStart &&
        inv.bsDate <= bsEnd &&
        inv.items.some((it) => it.productId === activeProduct.id)
    );

    let totalSalesValue = 0;
    let totalItemCogs = 0;
    const salesByDate: Record<string, { qty: number; value: number }> = {};
    for (const inv of relatedInvoices) {
      for (const it of inv.items) {
        if (it.productId === activeProduct.id) {
          totalSalesValue += it.lineTotal - it.taxAmount;
          totalItemCogs += it.fifoCogs;
          if (!salesByDate[inv.bsDate]) salesByDate[inv.bsDate] = { qty: 0, value: 0 };
          salesByDate[inv.bsDate].qty += it.qty;
          salesByDate[inv.bsDate].value += it.lineTotal;
        }
      }
    }

    const supplierHistory = goodsReceipts
      .filter(
        (g) =>
          g.status === 'approved' &&
          (selectedStoreId === 'all' || g.storeId === selectedStoreId) &&
          g.bsDate >= bsStart &&
          g.bsDate <= bsEnd &&
          g.items.some((it) => it.productId === activeProduct.id)
      )
      .map((g) => {
        const line = g.items.find((it) => it.productId === activeProduct.id)!;
        return {
          grnNo: g.grnNo,
          bsDate: g.bsDate,
          supplierName: g.supplierName,
          qty: line.receivedQty,
          unitCost: line.unitCost,
          total: line.lineTotal,
        };
      });

    return {
      opening: opening + openingInPeriod,
      purchased,
      transfersIn,
      sold: sold - saleReversal,
      damagedExpired,
      transfersOut,
      adjustments,
      closing,
      totalPurchaseValue,
      totalSalesValue,
      grossProfit: totalSalesValue - totalItemCogs,
      txCount: inPeriod.length,
      salesByDate: Object.entries(salesByDate).sort((a, b) => a[0].localeCompare(b[0])),
      supplierHistory,
      adjustmentsList: inPeriod.filter((l) =>
        ['count_adjustment', 'manual_adjustment', 'damage', 'expiry'].includes(l.movementType)
      ),
    };
  }, [activeProduct, stockLedger, salesInvoices, goodsReceipts, selectedStoreId, bsStart, bsEnd]);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    const prod = products.find((p) => p.id === (adjProductId || products[0]?.id));
    const storeId = adjStoreId || stores[0]?.id;
    if (!prod || !storeId) return;
    setBusy(true);
    try {
      const signedQty = adjType === 'supplier_return' ? -Math.abs(adjQty) : adjQty;
      await recordOpeningOrAdjustmentStock(employee, {
        storeId,
        product: prod,
        movementType: adjType,
        qtyDelta: signedQty,
        unitCost: adjCost || prod.purchasePrice,
        batchNo: adjBatchNo,
        expiryDateBs: adjExpiryBs || undefined,
        reason: adjReason,
        bsDate: adjDateBs,
      });
      notify('success', `Recorded ${adjType} for ${prod.itemCode}.`);
      setShowAdjust(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Stock movement failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          {[
            { id: 'stock', label: 'Current Stock' },
            { id: 'monthly_report', label: 'Product Monthly Movement' },
            { id: 'ledger', label: 'Auditable Stock Ledger' },
          ].map((tItem) => (
            <button
              key={tItem.id}
              onClick={() => setTab(tItem.id as typeof tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                tab === tItem.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tItem.label}
            </button>
          ))}
        </div>

        {canAdjust && (
          <button
            onClick={() => {
              setAdjStoreId(selectedStoreId !== 'all' ? selectedStoreId : stores[0]?.id || '');
              setAdjProductId(products[0]?.id || '');
              setAdjCost(products[0]?.purchasePrice || 0);
              setShowAdjust(true);
            }}
            className="h-9 px-3.5 rounded-lg bg-teal-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Opening / Stock Adjustment
          </button>
        )}
      </div>

      {showAdjust && (
        <form
          onSubmit={handleAdjustSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
        >
          <div className="text-sm font-semibold">Record Auditable Stock Movement</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <label className="space-y-1 block">
              <span>Store *</span>
              <select
                value={adjStoreId}
                onChange={(e) => setAdjStoreId(e.target.value)}
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
              <span>Product *</span>
              <select
                value={adjProductId}
                onChange={(e) => {
                  setAdjProductId(e.target.value);
                  const found = products.find((p) => p.id === e.target.value);
                  if (found) setAdjCost(found.purchasePrice);
                }}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.itemCode} · {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Movement Type *</span>
              <select
                value={adjType}
                onChange={(e) => setAdjType(e.target.value as typeof adjType)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="opening">Opening Stock (+)</option>
                <option value="manual_adjustment">Manual Adjustment (+/-)</option>
                <option value="customer_return">Customer Return (+)</option>
                <option value="supplier_return">Supplier Return (-)</option>
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Quantity *</span>
              <input
                type="number"
                step="0.01"
                required
                value={adjQty}
                onChange={(e) => setAdjQty(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Unit Cost (NPR) *</span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={adjCost}
                onChange={(e) => setAdjCost(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Batch No.</span>
              <input
                value={adjBatchNo}
                onChange={(e) => setAdjBatchNo(e.target.value)}
                placeholder="OPEN-01"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Expiry Date (BS)</span>
              <input
                value={adjExpiryBs}
                onChange={(e) => setAdjExpiryBs(e.target.value)}
                placeholder="2084-01-15"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>BS Date *</span>
              <input
                required
                value={adjDateBs}
                onChange={(e) => setAdjDateBs(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
          </div>
          <label className="space-y-1 block">
            <span>Reason / Remarks *</span>
            <input
              required
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Opening balance entry / Physical correction"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdjust(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-teal-700 text-white font-medium cursor-pointer">
              {busy ? 'Posting...' : 'Post Ledger Entry'}
            </button>
          </div>
        </form>
      )}

      {tab === 'stock' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Item Code</th>
                  <th className="text-left px-4 py-2.5 font-medium">Product</th>
                  <th className="text-right px-4 py-2.5 font-medium">Available Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium">Min / Max</th>
                  <th className="text-right px-4 py-2.5 font-medium">FIFO Stock Value</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {stockRows.map((r) => (
                  <tr key={r.product.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-mono font-semibold">{r.product.itemCode}</td>
                    <td className="px-4 py-2.5">{r.product.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                      {r.qty} {r.product.baseUnit}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {r.product.minStock} / {r.product.maxStock}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNPR(r.val, language)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          r.status === 'Out of Stock'
                            ? 'text-red-600 font-medium'
                            : r.status === 'Reorder Needed'
                              ? 'text-amber-600 font-medium'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'monthly_report' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium">Select Product:</label>
              <select
                value={activeProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.itemCode} · {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs font-mono text-slate-500">
              Range: {bsStart} BS – {bsEnd} BS
            </div>
          </div>

          {activeProduct && monthlyMovement ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold">
                  {activeProduct.name} ({activeProduct.itemCode}) — Movement Summary
                </h3>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr>
                      <td className="py-2">Opening Stock</td>
                      <td className="py-2 text-right font-mono tabular-nums">{monthlyMovement.opening}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-emerald-700 dark:text-emerald-400">+ Purchases Received</td>
                      <td className="py-2 text-right font-mono tabular-nums">{monthlyMovement.purchased}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-emerald-700 dark:text-emerald-400">+ Stock Transfers In</td>
                      <td className="py-2 text-right font-mono tabular-nums">{monthlyMovement.transfersIn}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-red-600 dark:text-red-400">- Sold (Net of Reversals)</td>
                      <td className="py-2 text-right font-mono tabular-nums">{monthlyMovement.sold}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-red-600 dark:text-red-400">- Damaged / Expired</td>
                      <td className="py-2 text-right font-mono tabular-nums">{monthlyMovement.damagedExpired}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-amber-700 dark:text-amber-400">- Stock Transfers Out</td>
                      <td className="py-2 text-right font-mono tabular-nums">{monthlyMovement.transfersOut}</td>
                    </tr>
                    <tr>
                      <td className="py-2">+/- Other Adjustments</td>
                      <td className="py-2 text-right font-mono tabular-nums">{monthlyMovement.adjustments}</td>
                    </tr>
                    <tr className="font-bold text-sm border-t-2 border-slate-300 dark:border-slate-700">
                      <td className="py-2.5">Closing Stock</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">
                        {monthlyMovement.closing} {activeProduct.baseUnit}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500">Total Purchase Value</div>
                    <div className="text-base font-mono font-semibold tabular-nums mt-1">
                      {formatNPR(monthlyMovement.totalPurchaseValue, language)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Total Sales Value</div>
                    <div className="text-base font-mono font-semibold tabular-nums mt-1">
                      {formatNPR(monthlyMovement.totalSalesValue, language)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Gross Profit (FIFO)</div>
                    <div className="text-base font-mono font-semibold tabular-nums mt-1 text-emerald-700 dark:text-emerald-400">
                      {formatNPR(monthlyMovement.grossProfit, language)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Ledger Transactions</div>
                    <div className="text-base font-mono font-semibold tabular-nums mt-1">
                      {monthlyMovement.txCount}
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2 text-xs">
                  <div className="font-semibold">Sales by BS Date</div>
                  {monthlyMovement.salesByDate.length === 0 ? (
                    <div className="text-slate-500">No sales in selected BS range.</div>
                  ) : (
                    monthlyMovement.salesByDate.map(([d, v]) => (
                      <div key={d} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                        <span className="font-mono">{d}</span>
                        <span className="font-mono tabular-nums">
                          {v.qty} {activeProduct.baseUnit} · {formatNPR(v.value, language)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              Add products first to view product-wise monthly movement reports.
            </div>
          )}
        </div>
      )}

      {tab === 'ledger' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">BS Date</th>
                  <th className="text-left px-4 py-2.5 font-medium">Store</th>
                  <th className="text-left px-4 py-2.5 font-medium">Item Code · Product</th>
                  <th className="text-left px-4 py-2.5 font-medium">Movement</th>
                  <th className="text-right px-4 py-2.5 font-medium">Qty Delta</th>
                  <th className="text-left px-4 py-2.5 font-medium">Ref & Reason</th>
                  <th className="text-left px-4 py-2.5 font-medium">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {stockLedger
                  .filter((l) => selectedStoreId === 'all' || l.storeId === selectedStoreId)
                  .sort((a, b) => b.bsDate.localeCompare(a.bsDate))
                  .slice(0, 200)
                  .map((l) => {
                    const st = stores.find((s) => s.id === l.storeId);
                    return (
                      <tr key={l.id}>
                        <td className="px-4 py-2 font-mono">{l.bsDate}</td>
                        <td className="px-4 py-2">{st?.code || l.storeId}</td>
                        <td className="px-4 py-2">
                          <span className="font-mono font-medium">{l.itemCode}</span> · {l.productName}
                        </td>
                        <td className="px-4 py-2 capitalize">{l.movementType.replace('_', ' ')}</td>
                        <td
                          className={`px-4 py-2 text-right font-mono tabular-nums font-medium ${
                            l.qtyDelta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {l.qtyDelta >= 0 ? `+${l.qtyDelta}` : l.qtyDelta}
                        </td>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                          {l.referenceNo ? `${l.referenceNo} · ` : ''}
                          {l.reason}
                        </td>
                        <td className="px-4 py-2">{l.actorName}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
