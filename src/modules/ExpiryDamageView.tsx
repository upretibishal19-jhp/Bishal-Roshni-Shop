import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { recordWasteTransaction } from '../lib/erpService';
import { daysBetweenAd, formatNPR, todayAd, todayBs } from '../lib/bsDate';
import type { StockBatch } from '../types/erp';

export function ExpiryDamageView() {
  const {
    stores,
    products,
    suppliers,
    stockBatches,
    wasteRecords,
    selectedStoreId,
    employee,
    notify,
    language,
  } = useApp();

  const [alertFilter, setAlertFilter] = useState<'all' | 'expired' | '5' | '10' | '18'>('all');
  const [showWasteForm, setShowWasteForm] = useState(false);
  const [storeId, setStoreId] = useState(selectedStoreId !== 'all' ? selectedStoreId : stores[0]?.id || '');
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [selectedBatch, setSelectedBatch] = useState<StockBatch | undefined>(undefined);
  const [wasteType, setWasteType] = useState<'damaged' | 'expired'>('damaged');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [bsDate, setBsDate] = useState(todayBs());
  const [busy, setBusy] = useState(false);

  const currentAd = todayAd();

  const expiryRows = useMemo(() => {
    return stockBatches
      .filter(
        (b) =>
          b.qtyRemaining > 0 &&
          (selectedStoreId === 'all' || b.storeId === selectedStoreId) &&
          b.expiryDateAd
      )
      .map((b) => {
        const daysLeft = daysBetweenAd(currentAd, b.expiryDateAd!);
        const bucket =
          daysLeft < 0
            ? 'expired'
            : daysLeft <= 5
              ? '5'
              : daysLeft <= 10
                ? '10'
                : daysLeft <= 18
                  ? '18'
                  : 'ok';
        return { batch: b, daysLeft, bucket };
      })
      .filter((r) => {
        if (alertFilter === 'all') return r.bucket !== 'ok';
        return r.bucket === alertFilter;
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [stockBatches, selectedStoreId, currentAd, alertFilter]);

  const wasteSummary = useMemo(() => {
    const relevant = wasteRecords.filter(
      (w) => selectedStoreId === 'all' || w.storeId === selectedStoreId
    );
    const damagedLoss = relevant
      .filter((w) => w.wasteType === 'damaged')
      .reduce((s, w) => s + w.financialLoss, 0);
    const expiredLoss = relevant
      .filter((w) => w.wasteType === 'expired')
      .reduce((s, w) => s + w.financialLoss, 0);
    return { damagedLoss, expiredLoss, totalLoss: damagedLoss + expiredLoss };
  }, [wasteRecords, selectedStoreId]);

  const handleWasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    const prod = products.find((p) => p.id === (productId || products[0]?.id));
    if (!prod) return;
    setBusy(true);
    try {
      await recordWasteTransaction(employee, {
        storeId: storeId || stores[0]?.id || '',
        product: prod,
        batch: selectedBatch,
        wasteType,
        qty,
        reason,
        bsDate,
        allBatches: stockBatches,
      });
      notify('success', `Recorded ${wasteType} write-off for ${prod.itemCode}.`);
      setShowWasteForm(false);
      setSelectedBatch(undefined);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Waste entry failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Damaged Stock Loss</div>
          <div className="text-lg font-mono font-bold tabular-nums text-amber-700 mt-1">
            {formatNPR(wasteSummary.damagedLoss, language)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Expired Stock Loss</div>
          <div className="text-lg font-mono font-bold tabular-nums text-red-600 mt-1">
            {formatNPR(wasteSummary.expiredLoss, language)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Financial Waste</div>
          <div className="text-lg font-mono font-bold tabular-nums mt-1">
            {formatNPR(wasteSummary.totalLoss, language)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
          {[
            { id: 'all', label: 'All Alerts (<=18d & Expired)' },
            { id: 'expired', label: 'Expired' },
            { id: '5', label: '<= 5 Days' },
            { id: '10', label: '<= 10 Days' },
            { id: '18', label: '<= 18 Days' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setAlertFilter(f.id as typeof alertFilter)}
              className={`px-2.5 py-1.5 rounded-md cursor-pointer ${
                alertFilter === f.id
                  ? 'bg-white dark:bg-slate-700 font-medium text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            setSelectedBatch(undefined);
            setShowWasteForm(true);
          }}
          className="h-9 px-3.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Write Off Damaged / Expired
        </button>
      </div>

      {showWasteForm && (
        <form onSubmit={handleWasteSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="text-sm font-semibold">Record Damaged or Expired Inventory Write-Off</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="space-y-1 block">
              <span>Store *</span>
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Product *</span>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.itemCode} · {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Waste Category *</span>
              <select value={wasteType} onChange={(e) => setWasteType(e.target.value as 'damaged' | 'expired')} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <option value="damaged">Damaged Product</option>
                <option value="expired">Expired Product</option>
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Quantity *</span>
              <input type="number" step="0.01" min="0.01" required value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            </label>
            <label className="space-y-1 block">
              <span>BS Date *</span>
              <input required value={bsDate} onChange={(e) => setBsDate(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            </label>
          </div>
          <input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. Torn bag, past expiry date)..." className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowWasteForm(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-red-700 text-white font-medium cursor-pointer">
              Confirm Write-Off
            </button>
          </div>
        </form>
      )}

      {/* Batch Expiry Alerts */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
          Batch-Level Expiry Alerts
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Store</th>
                <th className="text-left px-4 py-2 font-medium">Item · Batch</th>
                <th className="text-left px-4 py-2 font-medium">Supplier</th>
                <th className="text-left px-4 py-2 font-medium">Expiry (BS)</th>
                <th className="text-right px-4 py-2 font-medium">Remaining Qty</th>
                <th className="text-left px-4 py-2 font-medium">Alert Status</th>
                <th className="text-right px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {expiryRows.map(({ batch, daysLeft }) => {
                const st = stores.find((s) => s.id === batch.storeId);
                const prod = products.find((p) => p.id === batch.productId);
                const sup = suppliers.find((sp) => sp.id === batch.supplierId);
                return (
                  <tr key={batch.id}>
                    <td className="px-4 py-2">{st?.code || batch.storeId}</td>
                    <td className="px-4 py-2">
                      <span className="font-mono font-medium">{batch.itemCode}</span> · {prod?.name} ({batch.batchNo})
                    </td>
                    <td className="px-4 py-2">{sup?.name || '-'}</td>
                    <td className="px-4 py-2 font-mono">{batch.expiryDateBs}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{batch.qtyRemaining}</td>
                    <td className="px-4 py-2 font-semibold">
                      <span className={daysLeft <= 5 ? 'text-red-600' : 'text-amber-600'}>
                        {daysLeft < 0 ? `EXPIRED (${Math.abs(daysLeft)}d ago)` : `${daysLeft} day(s) left`}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => {
                          setSelectedBatch(batch);
                          setStoreId(batch.storeId);
                          setProductId(batch.productId);
                          setWasteType(daysLeft < 0 ? 'expired' : 'damaged');
                          setQty(batch.qtyRemaining);
                          setShowWasteForm(true);
                        }}
                        className="text-red-600 hover:underline cursor-pointer"
                      >
                        Write Off
                      </button>
                    </td>
                  </tr>
                );
              })}
              {expiryRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No expiring or expired batches in this alert tier.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Waste History */}
      {wasteRecords.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
            Damaged & Expired Write-Off History
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {wasteRecords.slice(0, 30).map((w) => (
              <div key={w.id} className="px-5 py-2 flex justify-between">
                <span>
                  <span className="font-mono">{w.bsDate}</span> ·{' '}
                  <span className="uppercase font-medium">{w.wasteType}</span> · {w.itemCode} ({w.qty}) · {w.reason}
                </span>
                <span className="font-mono text-red-600">-{formatNPR(w.financialLoss, language)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
