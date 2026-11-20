import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Plus, CheckCircle2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  approveStockCountTransaction,
  createStockCountSheet,
  saveStockCountLines,
} from '../lib/erpService';
import { formatNPR, todayBs } from '../lib/bsDate';
import { BUSINESS_ID, type StockCountLine } from '../types/erp';

export function StockCountView() {
  const {
    stores,
    products,
    stockBatches,
    stockCounts,
    selectedStoreId,
    employee,
    notify,
    language,
  } = useApp();

  const [storeId, setStoreId] = useState(selectedStoreId !== 'all' ? selectedStoreId : stores[0]?.id || '');
  const [bsDate, setBsDate] = useState(todayBs());
  const [activeCountId, setActiveCountId] = useState<string>('');
  const [lines, setLines] = useState<StockCountLine[]>([]);
  const [busy, setBusy] = useState(false);

  const canCreate =
    employee && ['owner', 'store_manager', 'inventory_controller'].includes(employee.role);
  const canApprove =
    employee && (employee.role === 'owner' || employee.permissions.canApproveStockAdjustments);

  const filteredCounts = stockCounts
    .filter((c) => selectedStoreId === 'all' || c.storeId === selectedStoreId)
    .sort((a, b) => b.bsDate.localeCompare(a.bsDate));

  const activeCount = stockCounts.find((c) => c.id === activeCountId);

  useEffect(() => {
    if (!activeCountId) {
      setLines([]);
      return;
    }
    const q = query(
      collection(db, 'stockCounts', activeCountId, 'lines'),
      where('businessId', '==', BUSINESS_ID)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<StockCountLine, 'id'>) }))
          .sort((a, b) => a.itemCode.localeCompare(b.itemCode));
        setLines(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `stockCounts/${activeCountId}/lines`)
    );
    return () => unsub();
  }, [activeCountId]);

  const handleGenerate = async () => {
    if (!employee) return;
    const targetStore = storeId || stores[0]?.id;
    if (!targetStore) {
      notify('error', 'Create a store first.');
      return;
    }
    setBusy(true);
    try {
      const id = await createStockCountSheet(employee, targetStore, bsDate, products, stockBatches);
      setActiveCountId(id);
      notify('success', 'Sunday stock count sheet generated.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to generate count sheet.');
    } finally {
      setBusy(false);
    }
  };

  const updateLocalLine = (lineId: string, physicalQty: number, reason: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const varianceQty = Number((physicalQty - l.systemQty).toFixed(4));
        const varianceValue = Number((varianceQty * l.unitCost).toFixed(2));
        return { ...l, physicalQty, varianceQty, varianceValue, reason };
      })
    );
  };

  const handleSave = async (submit: boolean) => {
    if (!activeCount) return;
    setBusy(true);
    try {
      await saveStockCountLines(activeCount.id, lines, submit);
      notify('success', submit ? 'Submitted for Owner/Manager approval.' : 'Draft count saved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save count lines.');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!employee || !activeCount) return;
    setBusy(true);
    try {
      await approveStockCountTransaction(employee, activeCount, lines, stockBatches);
      notify('success', `Approved ${activeCount.countRef} and posted inventory adjustments.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="space-y-1 block">
            <span>Store</span>
            <select
              value={storeId || stores[0]?.id || ''}
              onChange={(e) => setStoreId(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 block">
            <span>Count Date (BS)</span>
            <input
              value={bsDate}
              onChange={(e) => setBsDate(e.target.value)}
              className="h-9 w-32 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
            />
          </label>
          {canCreate && (
            <button
              onClick={handleGenerate}
              disabled={busy}
              className="h-9 px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Generate Sunday Count Sheet
            </button>
          )}
        </div>
        <div className="text-xs text-slate-500">
          System stock never updates until an authorized approver posts adjustments.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Historical Reports List */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Weekly Count Reports ({filteredCounts.length})
          </h3>
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto">
            {filteredCounts.map((c) => {
              const st = stores.find((s) => s.id === c.storeId);
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCountId(c.id)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                    activeCountId === c.id
                      ? 'border-teal-700 bg-teal-50/50 dark:bg-teal-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex justify-between font-mono font-medium">
                    <span>{c.countRef}</span>
                    <span className="capitalize">{c.status}</span>
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    {st?.code || c.storeId} · {c.bsDate}
                  </div>
                  <div className="font-mono text-[11px] mt-1">
                    Net Var: {formatNPR(c.netVarianceValue, language)}
                  </div>
                </button>
              );
            })}
            {filteredCounts.length === 0 && (
              <div className="text-xs text-slate-500 py-6 text-center">No stock counts generated yet.</div>
            )}
          </div>
        </div>

        {/* Active Sheet */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {activeCount ? (
            <div className="space-y-3">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs space-y-0.5">
                  <div className="font-mono font-semibold text-sm">{activeCount.countRef}</div>
                  <div className="text-slate-500">
                    BS Date: {activeCount.bsDate} · Status: <span className="uppercase font-medium">{activeCount.status}</span>
                  </div>
                </div>
                {activeCount.status !== 'approved' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSave(false)}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                    >
                      Save Draft
                    </button>
                    <button
                      onClick={() => handleSave(true)}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium cursor-pointer"
                    >
                      Submit for Approval
                    </button>
                    {canApprove && (
                      <button
                        onClick={handleApprove}
                        disabled={busy}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve & Post Stock
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Code</th>
                      <th className="text-left px-4 py-2 font-medium">Product</th>
                      <th className="text-right px-4 py-2 font-medium">System Stock</th>
                      <th className="text-right px-4 py-2 font-medium">Physical Qty</th>
                      <th className="text-right px-4 py-2 font-medium">Difference</th>
                      <th className="text-right px-4 py-2 font-medium">Unit Cost</th>
                      <th className="text-right px-4 py-2 font-medium">Variance Value</th>
                      <th className="text-left px-4 py-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-2 font-mono font-medium">{line.itemCode}</td>
                        <td className="px-4 py-2">{line.productName}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{line.systemQty}</td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            disabled={activeCount.status === 'approved'}
                            value={line.physicalQty}
                            onChange={(e) =>
                              updateLocalLine(line.id, Number(e.target.value), line.reason || '')
                            }
                            className="w-20 h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono tabular-nums"
                          />
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-mono tabular-nums font-semibold ${
                            line.varianceQty < 0
                              ? 'text-red-600'
                              : line.varianceQty > 0
                                ? 'text-amber-600'
                                : 'text-slate-500'
                          }`}
                        >
                          {line.varianceQty > 0 ? `+${line.varianceQty}` : line.varianceQty}
                          {line.varianceQty < 0 ? ' (Short)' : line.varianceQty > 0 ? ' (Excess)' : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">
                          {line.unitCost.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">
                          {formatNPR(line.varianceValue, language)}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            disabled={activeCount.status === 'approved'}
                            value={line.reason || ''}
                            onChange={(e) =>
                              updateLocalLine(line.id, line.physicalQty, e.target.value)
                            }
                            placeholder="Reason if variance"
                            className="w-40 h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-10 text-center text-xs text-slate-500">
              Select a weekly stock count report on the left or generate a new Sunday count sheet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
