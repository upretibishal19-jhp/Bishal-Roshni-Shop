import { useState } from 'react';
import { Plus, CheckCircle2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { confirmReceiveTransfer, dispatchStockTransfer } from '../lib/erpService';
import { todayBs } from '../lib/bsDate';
import type { Product, StockTransfer } from '../types/erp';

export function TransfersView() {
  const { stores, products, stockBatches, stockTransfers, employee, notify } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [fromStoreId, setFromStoreId] = useState(stores[0]?.id || '');
  const [toStoreId, setToStoreId] = useState(stores[1]?.id || stores[0]?.id || '');
  const [bsDate, setBsDate] = useState(todayBs());
  const [items, setItems] = useState<Array<{ product: Product; qty: number }>>([]);
  const [pickProductId, setPickProductId] = useState(products[0]?.id || '');
  const [pickQty, setPickQty] = useState(1);
  const [receiving, setReceiving] = useState<StockTransfer | null>(null);
  const [recvQtys, setRecvQtys] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const addLine = () => {
    const p = products.find((pr) => pr.id === (pickProductId || products[0]?.id));
    if (!p || pickQty <= 0) return;
    setItems((prev) => [...prev, { product: p, qty: pickQty }]);
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || items.length === 0) return;
    setBusy(true);
    try {
      await dispatchStockTransfer(employee, {
        fromStoreId: fromStoreId || stores[0]?.id || '',
        toStoreId,
        bsDate,
        items,
        allBatches: stockBatches,
      });
      notify('success', 'Stock dispatched. Receiving store stock will update upon confirmation.');
      setShowForm(false);
      setItems([]);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Transfer dispatch failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !receiving) return;
    setBusy(true);
    try {
      await confirmReceiveTransfer(employee, receiving, recvQtys);
      notify('success', `Transfer ${receiving.transferRef} received into destination store.`);
      setReceiving(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Transfer receipt failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Multi-Store Stock Transfers</h2>
          <p className="text-xs text-slate-500">
            Two-step transfer workflow: destination stock increases only after physical receipt is confirmed.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={stores.length < 2}
          className="h-9 px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Dispatch Transfer
        </button>
      </div>

      {stores.length < 2 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
          Add at least two store branches in the Stores module to transfer inventory between stores.
        </div>
      )}

      {showForm && (
        <form onSubmit={handleDispatch} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="text-sm font-semibold">Dispatch Inter-Store Stock Transfer</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 block">
              <span>Sending Store *</span>
              <select value={fromStoreId} onChange={(e) => setFromStoreId(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Receiving Store *</span>
              <select value={toStoreId} onChange={(e) => setToStoreId(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Transfer Date (BS) *</span>
              <input value={bsDate} onChange={(e) => setBsDate(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <select value={pickProductId} onChange={(e) => setPickProductId(e.target.value)} className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.itemCode} · {p.name}
                </option>
              ))}
            </select>
            <input type="number" min="1" step="0.01" value={pickQty} onChange={(e) => setPickQty(Number(e.target.value))} className="w-24 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            <button type="button" onClick={addLine} className="h-9 px-3 rounded-lg bg-slate-900 dark:bg-slate-700 text-white cursor-pointer">
              Add Item
            </button>
          </div>

          {items.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-1">
              {items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>
                    {it.product.itemCode} · {it.product.name}
                  </span>
                  <span className="font-mono">
                    {it.qty} {it.product.baseUnit}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy || items.length === 0} className="px-4 py-1.5 rounded-lg bg-teal-700 text-white font-medium cursor-pointer">
              Dispatch Stock
            </button>
          </div>
        </form>
      )}

      {receiving && (
        <form onSubmit={handleConfirmReceive} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="text-sm font-semibold">Confirm Receipt — {receiving.transferRef}</div>
          <div className="space-y-2">
            {receiving.items.map((it, idx) => (
              <div key={idx} className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                <span>
                  <span className="font-mono font-medium">{it.itemCode}</span> · {it.productName} (Dispatched: {it.qtyDispatched})
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={recvQtys[idx] ?? it.qtyDispatched}
                  onChange={(e) =>
                    setRecvQtys((prev) => prev.map((v, i) => (i === idx ? Number(e.target.value) : v)))
                  }
                  className="w-24 h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setReceiving(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-emerald-700 text-white font-medium cursor-pointer">
              Confirm & Add to Receiving Store
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Transfer Ref</th>
                <th className="text-left px-4 py-2.5 font-medium">BS Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Route</th>
                <th className="text-right px-4 py-2.5 font-medium">Lines</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {stockTransfers.map((trf) => {
                const from = stores.find((s) => s.id === trf.fromStoreId);
                const to = stores.find((s) => s.id === trf.toStoreId);
                return (
                  <tr key={trf.id}>
                    <td className="px-4 py-2.5 font-mono font-semibold">{trf.transferRef}</td>
                    <td className="px-4 py-2.5 font-mono">{trf.bsDate}</td>
                    <td className="px-4 py-2.5">
                      {from?.code || trf.fromStoreId} &rarr; {to?.code || trf.toStoreId}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{trf.items.length}</td>
                    <td className="px-4 py-2.5 capitalize">{trf.status}</td>
                    <td className="px-4 py-2.5 text-right">
                      {trf.status === 'dispatched' && (
                        <button
                          onClick={() => {
                            setReceiving(trf);
                            setRecvQtys(trf.items.map((i) => i.qtyDispatched));
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 text-white cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Confirm Receive
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {stockTransfers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No stock transfers recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
