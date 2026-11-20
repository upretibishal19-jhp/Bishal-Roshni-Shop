import { useState } from 'react';
import { Plus, CheckCircle2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import {
  approvePendingGrn,
  createAndApproveGrn,
  createPurchaseOrder,
} from '../lib/erpService';
import { formatNPR, todayBs } from '../lib/bsDate';
import type { PurchaseOrder, PurchaseOrderItem } from '../types/erp';

export function PurchasesView() {
  const {
    stores,
    suppliers,
    products,
    purchaseOrders,
    goodsReceipts,
    selectedStoreId,
    employee,
    notify,
    language,
  } = useApp();

  const [showPoForm, setShowPoForm] = useState(false);
  const [poStoreId, setPoStoreId] = useState(selectedStoreId !== 'all' ? selectedStoreId : stores[0]?.id || '');
  const [poSupplierId, setPoSupplierId] = useState(suppliers[0]?.id || '');
  const [poBsDate, setPoBsDate] = useState(todayBs());
  const [poItems, setPoItems] = useState<PurchaseOrderItem[]>([]);
  const [pickProductId, setPickProductId] = useState(products[0]?.id || '');
  const [pickQty, setPickQty] = useState(10);
  const [pickCost, setPickCost] = useState(products[0]?.purchasePrice || 0);

  const [receivingPo, setReceivingPo] = useState<PurchaseOrder | null>(null);
  const [grnLines, setGrnLines] = useState<
    Array<{
      productId: string;
      itemCode: string;
      productName: string;
      orderedQty: number;
      receivedQty: number;
      unitCost: number;
      batchNo: string;
      expiryDateBs: string;
    }>
  >([]);
  const [approveImmediately, setApproveImmediately] = useState(true);
  const [busy, setBusy] = useState(false);

  const addPoLine = () => {
    const p = products.find((pr) => pr.id === (pickProductId || products[0]?.id));
    if (!p || pickQty <= 0) return;
    const cost = pickCost || p.purchasePrice;
    setPoItems((prev) => [
      ...prev,
      {
        productId: p.id,
        itemCode: p.itemCode,
        productName: p.name,
        unit: p.baseUnit,
        orderedQty: pickQty,
        receivedQty: 0,
        unitCost: cost,
        lineTotal: Number((pickQty * cost).toFixed(2)),
      },
    ]);
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || poItems.length === 0) return;
    const sup = suppliers.find((s) => s.id === (poSupplierId || suppliers[0]?.id));
    if (!sup) {
      notify('error', 'Select a supplier first.');
      return;
    }
    setBusy(true);
    try {
      await createPurchaseOrder(employee, {
        storeId: poStoreId || stores[0]?.id || '',
        supplier: sup,
        bsDate: poBsDate,
        items: poItems,
      });
      notify('success', 'Purchase order created.');
      setShowPoForm(false);
      setPoItems([]);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'PO creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const startReceiving = (po: PurchaseOrder) => {
    setReceivingPo(po);
    setGrnLines(
      po.items.map((it) => {
        const remaining = Math.max(0, it.orderedQty - it.receivedQty);
        return {
          productId: it.productId,
          itemCode: it.itemCode,
          productName: it.productName,
          orderedQty: remaining,
          receivedQty: remaining,
          unitCost: it.unitCost,
          batchNo: `B-${todayBs().replace(/-/g, '')}`,
          expiryDateBs: '',
        };
      })
    );
  };

  const handleReceiveGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !receivingPo) return;
    setBusy(true);
    try {
      await createAndApproveGrn(employee, {
        po: receivingPo,
        bsDate: todayBs(),
        items: grnLines.map((l) => ({
          ...l,
          expiryDateBs: l.expiryDateBs || undefined,
        })),
        approveImmediately,
      });
      notify(
        'success',
        approveImmediately
          ? 'Goods received, approved, and added to FIFO stock batches.'
          : 'GRN logged for approval.'
      );
      setReceivingPo(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'GRN failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Purchase Orders & Goods Received Notes (GRN)</h2>
          <p className="text-xs text-slate-500">Supports partial deliveries, shortage/excess checks, and batch expiry capture.</p>
        </div>
        <button
          onClick={() => setShowPoForm(true)}
          className="h-9 px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New Purchase Order
        </button>
      </div>

      {showPoForm && (
        <form onSubmit={handleCreatePo} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="text-sm font-semibold">Create Purchase Order</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 block">
              <span>Receiving Store *</span>
              <select value={poStoreId || stores[0]?.id || ''} onChange={(e) => setPoStoreId(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Supplier *</span>
              <select value={poSupplierId || suppliers[0]?.id || ''} onChange={(e) => setPoSupplierId(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span>PO Date (BS) *</span>
              <input value={poBsDate} onChange={(e) => setPoBsDate(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
            <select
              value={pickProductId}
              onChange={(e) => {
                setPickProductId(e.target.value);
                const p = products.find((pr) => pr.id === e.target.value);
                if (p) setPickCost(p.purchasePrice);
              }}
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.itemCode} · {p.name}
                </option>
              ))}
            </select>
            <input type="number" min="1" value={pickQty} onChange={(e) => setPickQty(Number(e.target.value))} placeholder="Qty" className="w-24 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            <input type="number" step="0.01" min="0" value={pickCost} onChange={(e) => setPickCost(Number(e.target.value))} placeholder="Cost" className="w-28 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            <button type="button" onClick={addPoLine} className="h-9 px-3 rounded-lg bg-slate-900 dark:bg-slate-700 text-white cursor-pointer">
              Add Item
            </button>
          </div>

          {poItems.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-1">
              {poItems.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>
                    {it.itemCode} · {it.productName} ({it.orderedQty} {it.unit} @ {it.unitCost})
                  </span>
                  <span className="font-mono">{formatNPR(it.lineTotal, language)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowPoForm(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy || poItems.length === 0} className="px-4 py-1.5 rounded-lg bg-teal-700 text-white font-medium cursor-pointer">
              Submit PO
            </button>
          </div>
        </form>
      )}

      {receivingPo && (
        <form onSubmit={handleReceiveGrn} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Receive Delivery Against {receivingPo.poNo}</div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={approveImmediately} onChange={(e) => setApproveImmediately(e.target.checked)} />
              <span>Approve GRN & Post Stock Immediately</span>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="text-left px-3 py-2">Product</th>
                  <th className="text-right px-3 py-2">Remaining Ordered</th>
                  <th className="text-right px-3 py-2">Received Qty</th>
                  <th className="text-right px-3 py-2">Short/Excess</th>
                  <th className="text-right px-3 py-2">Unit Cost</th>
                  <th className="text-left px-3 py-2">Batch No</th>
                  <th className="text-left px-3 py-2">Expiry (BS)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {grnLines.map((gl, idx) => (
                  <tr key={gl.productId}>
                    <td className="px-3 py-2">
                      <span className="font-mono">{gl.itemCode}</span> · {gl.productName}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{gl.orderedQty}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={gl.receivedQty}
                        onChange={(e) =>
                          setGrnLines((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, receivedQty: Number(e.target.value) } : row))
                          )
                        }
                        className="w-20 h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {gl.receivedQty - gl.orderedQty}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={gl.unitCost}
                        onChange={(e) =>
                          setGrnLines((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, unitCost: Number(e.target.value) } : row))
                          )
                        }
                        className="w-24 h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={gl.batchNo}
                        onChange={(e) =>
                          setGrnLines((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, batchNo: e.target.value } : row))
                          )
                        }
                        className="w-28 h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={gl.expiryDateBs}
                        placeholder="YYYY-MM-DD"
                        onChange={(e) =>
                          setGrnLines((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, expiryDateBs: e.target.value } : row))
                          )
                        }
                        className="w-28 h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setReceivingPo(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-emerald-700 text-white font-medium cursor-pointer">
              Confirm Goods Receipt
            </button>
          </div>
        </form>
      )}

      {/* POs Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">Purchase Orders</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">PO No</th>
                <th className="text-left px-4 py-2 font-medium">BS Date</th>
                <th className="text-left px-4 py-2 font-medium">Supplier</th>
                <th className="text-right px-4 py-2 font-medium">Ordered</th>
                <th className="text-right px-4 py-2 font-medium">Received</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {purchaseOrders
                .filter((po) => selectedStoreId === 'all' || po.storeId === selectedStoreId)
                .map((po) => (
                  <tr key={po.id}>
                    <td className="px-4 py-2 font-mono font-semibold">{po.poNo}</td>
                    <td className="px-4 py-2 font-mono">{po.bsDate}</td>
                    <td className="px-4 py-2">{po.supplierName}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{formatNPR(po.totalOrderedAmount, language)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{formatNPR(po.totalReceivedAmount, language)}</td>
                    <td className="px-4 py-2 capitalize">{po.status}</td>
                    <td className="px-4 py-2 text-right">
                      {po.status !== 'completed' && po.status !== 'cancelled' && (
                        <button onClick={() => startReceiving(po)} className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer">
                          Receive Goods
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* GRN Pending/Approved */}
      {goodsReceipts.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">Goods Received Notes (GRN)</div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {goodsReceipts.map((g) => (
              <div key={g.id} className="px-5 py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-mono font-semibold">{g.grnNo}</span> · PO {g.poNo} · {g.supplierName} ·{' '}
                  <span className="font-mono">{g.bsDate}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono">{formatNPR(g.totalReceivedAmount, language)}</span>
                  {g.status === 'pending_approval' ? (
                    <button
                      onClick={() => employee && approvePendingGrn(employee, g)}
                      className="px-2.5 py-1 rounded bg-emerald-700 text-white inline-flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Approve Stock
                    </button>
                  ) : (
                    <span className="text-emerald-700 font-medium">Approved</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
