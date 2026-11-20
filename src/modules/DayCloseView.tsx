import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  FileText,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { submitDayClose, verifyDayClose } from '../lib/erpService';
import { formatBsDate, formatNPR, todayBs } from '../lib/bsDate';
import { exportDayClosePdf, exportToCsv, exportToExcel } from '../lib/exportUtils';
import type { DayClose } from '../types/erp';

const DENOMS: Array<{ key: string; label: string; value: number }> = [
  { key: '1000', label: 'NPR 1,000', value: 1000 },
  { key: '500', label: 'NPR 500', value: 500 },
  { key: '100', label: 'NPR 100', value: 100 },
  { key: '50', label: 'NPR 50', value: 50 },
  { key: '20', label: 'NPR 20', value: 20 },
  { key: '10', label: 'NPR 10', value: 10 },
  { key: '5', label: 'NPR 5', value: 5 },
  { key: 'coins', label: 'Coins / Other (NPR)', value: 1 },
];

export function DayCloseView() {
  const {
    stores,
    salesInvoices,
    customerCreditLedger,
    expenses,
    supplierPayments,
    dayCloses,
    selectedStoreId,
    settings,
    employee,
    notify,
    language,
  } = useApp();

  const [storeId, setStoreId] = useState(
    selectedStoreId !== 'all' ? selectedStoreId : stores[0]?.id || ''
  );
  const [bsDate, setBsDate] = useState(todayBs());

  const activeStore = stores.find((s) => s.id === (storeId || stores[0]?.id));

  // Auto-suggest opening cash from most recent previous day close for this store
  const suggestedOpening = useMemo(() => {
    if (!activeStore) return 0;
    const prev = dayCloses
      .filter((d) => d.storeId === activeStore.id && d.bsDate < bsDate)
      .sort((a, b) => b.bsDate.localeCompare(a.bsDate))[0];
    return prev ? prev.closingCashRetained : 0;
  }, [dayCloses, activeStore, bsDate]);

  const [openingCash, setOpeningCash] = useState<number>(0);
  const [useDenomCounter, setUseDenomCounter] = useState(true);
  const [denomCounts, setDenomCounts] = useState<Record<string, number>>({
    '1000': 0,
    '500': 0,
    '100': 0,
    '50': 0,
    '20': 0,
    '10': 0,
    '5': 0,
    coins: 0,
  });
  const [manualActualCash, setManualActualCash] = useState<number>(0);
  const [bankDepositAmount, setBankDepositAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOpeningCash(suggestedOpening);
  }, [suggestedOpening]);

  const existingClose = useMemo(() => {
    if (!activeStore) return undefined;
    return dayCloses.find(
      (d) => d.storeId === activeStore.id && d.bsDate === bsDate.trim()
    );
  }, [dayCloses, activeStore, bsDate]);

  // Compute daily metrics from live Firestore collections for activeStore + bsDate
  const dailySummary = useMemo(() => {
    if (!activeStore) {
      return {
        invoiceCount: 0,
        reversedCount: 0,
        grossSalesTotal: 0,
        grossProfitTotal: 0,
        cashSales: 0,
        qrSales: 0,
        bankTransferSales: 0,
        mobileWalletSales: 0,
        creditSales: 0,
        cashRecoveries: 0,
        digitalRecoveries: 0,
        cashExpenses: 0,
        totalExpenses: 0,
        cashSupplierPayments: 0,
      };
    }

    const dayInvoices = salesInvoices.filter(
      (i) => i.storeId === activeStore.id && i.bsDate === bsDate.trim()
    );
    const confirmed = dayInvoices.filter((i) => i.status === 'confirmed');
    const reversedCount = dayInvoices.filter((i) => i.status === 'reversed').length;

    let grossSalesTotal = 0;
    let grossProfitTotal = 0;
    let cashSales = 0;
    let qrSales = 0;
    let bankTransferSales = 0;
    let mobileWalletSales = 0;
    let creditSales = 0;

    for (const inv of confirmed) {
      grossSalesTotal += inv.netTotal;
      grossProfitTotal += inv.grossProfit;
      for (const al of inv.paymentAllocations) {
        if (al.method === 'cash') cashSales += al.amount;
        else if (al.method === 'qr') qrSales += al.amount;
        else if (al.method === 'bank_transfer') bankTransferSales += al.amount;
        else if (al.method === 'mobile_wallet') mobileWalletSales += al.amount;
        else if (al.method === 'credit') creditSales += al.amount;
      }
    }

    const dayRecoveries = customerCreditLedger.filter(
      (c) =>
        c.storeId === activeStore.id &&
        c.bsDate === bsDate.trim() &&
        c.entryType === 'payment_recovery'
    );
    let cashRecoveries = 0;
    let digitalRecoveries = 0;
    for (const r of dayRecoveries) {
      if (r.method === 'cash') cashRecoveries += r.amount;
      else digitalRecoveries += r.amount;
    }

    const dayExpenses = expenses.filter(
      (e) => e.storeId === activeStore.id && e.bsDate === bsDate.trim()
    );
    let cashExpenses = 0;
    let totalExpenses = 0;
    for (const e of dayExpenses) {
      totalExpenses += e.amount;
      if (e.paymentMethod === 'cash') cashExpenses += e.amount;
    }

    const cashSupplierPayments = supplierPayments
      .filter(
        (p) =>
          p.storeId === activeStore.id &&
          p.bsDate === bsDate.trim() &&
          p.method === 'cash'
      )
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      invoiceCount: confirmed.length,
      reversedCount,
      grossSalesTotal: Number(grossSalesTotal.toFixed(2)),
      grossProfitTotal: Number(grossProfitTotal.toFixed(2)),
      cashSales: Number(cashSales.toFixed(2)),
      qrSales: Number(qrSales.toFixed(2)),
      bankTransferSales: Number(bankTransferSales.toFixed(2)),
      mobileWalletSales: Number(mobileWalletSales.toFixed(2)),
      creditSales: Number(creditSales.toFixed(2)),
      cashRecoveries: Number(cashRecoveries.toFixed(2)),
      digitalRecoveries: Number(digitalRecoveries.toFixed(2)),
      cashExpenses: Number(cashExpenses.toFixed(2)),
      totalExpenses: Number(totalExpenses.toFixed(2)),
      cashSupplierPayments: Number(cashSupplierPayments.toFixed(2)),
    };
  }, [
    activeStore,
    bsDate,
    salesInvoices,
    customerCreditLedger,
    expenses,
    supplierPayments,
  ]);

  const denomTotal = useMemo(() => {
    return DENOMS.reduce(
      (sum, d) => sum + Math.max(0, Number(denomCounts[d.key] || 0)) * d.value,
      0
    );
  }, [denomCounts]);

  const actualCashCounted = useDenomCounter ? denomTotal : manualActualCash;
  const expectedCash = Number(
    (
      openingCash +
      dailySummary.cashSales +
      dailySummary.cashRecoveries -
      dailySummary.cashExpenses -
      dailySummary.cashSupplierPayments
    ).toFixed(2)
  );
  const cashVariance = Number((actualCashCounted - expectedCash).toFixed(2));
  const closingCashRetained = Number((actualCashCounted - bankDepositAmount).toFixed(2));

  const handleCloseDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !activeStore) return;
    setBusy(true);
    try {
      const saved = await submitDayClose(employee, {
        store: { id: activeStore.id, code: activeStore.code, name: activeStore.name },
        bsDate: bsDate.trim(),
        ...dailySummary,
        openingCash,
        expectedCash,
        actualCashCounted,
        cashVariance,
        bankDepositAmount,
        closingCashRetained,
        denominations: useDenomCounter ? denomCounts : undefined,
        notes,
      });
      notify('success', `Closed day ${saved.bsDate} for ${activeStore.code} (${saved.closeRef}).`);
      setNotes('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to submit Day Close.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (dc: DayClose) => {
    if (!employee || employee.role !== 'owner') return;
    setBusy(true);
    try {
      await verifyDayClose(employee, dc);
      notify('success', `Verified ${dc.closeRef}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const sortedHistory = useMemo(() => {
    return [...dayCloses]
      .filter((d) => selectedStoreId === 'all' || d.storeId === selectedStoreId)
      .sort((a, b) => b.bsDate.localeCompare(a.bsDate));
  }, [dayCloses, selectedStoreId]);

  return (
    <div className="space-y-6">
      {/* Header & Store / Date Picker */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Daily Day Close (End-of-Day Register)</h2>
            <p className="text-xs text-slate-500">
              Reconcile daily cash drawer, digital payments, credit recoveries, expenses, and lock daily accounts per branch.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <select
              value={activeStore?.id || ''}
              onChange={(e) => setStoreId(e.target.value)}
              disabled={Boolean(employee && employee.role !== 'owner' && employee.storeId)}
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
            <input
              value={bsDate}
              onChange={(e) => setBsDate(e.target.value)}
              placeholder="YYYY-MM-DD"
              className="h-9 w-32 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
            />
          </div>
        </div>

        {existingClose && (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <div>
                <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                  {existingClose.closeRef} · Day Already {existingClose.status === 'verified' ? 'Verified' : 'Closed'} ({formatBsDate(existingClose.bsDate, language)})
                </div>
                <div className="text-emerald-800 dark:text-emerald-300 font-mono tabular-nums">
                  Sales: {formatNPR(existingClose.grossSalesTotal, language)} · Counted: {formatNPR(existingClose.actualCashCounted, language)} · Variance: {formatNPR(existingClose.cashVariance, language)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportDayClosePdf(existingClose, activeStore, settings.businessName)}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                Download EOD PDF
              </button>
              {existingClose.status === 'closed' && employee?.role === 'owner' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleVerify(existingClose)}
                  className="px-3 py-1.5 rounded-lg bg-teal-700 text-white font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verify &amp; Final Lock
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Live Daily Summary + Cash Reconciliation Form */}
      <form onSubmit={handleCloseDay} className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
        {/* Left: Auto-computed Day Summary */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <h3 className="text-sm font-semibold">
              Daily Sales &amp; Cash Flow ({activeStore?.code} · {bsDate})
            </h3>
            <span className="font-mono text-slate-500">
              {dailySummary.invoiceCount} bill(s)
              {dailySummary.reversedCount > 0 ? ` · ${dailySummary.reversedCount} reversed` : ''}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="text-slate-500">Gross Daily Sales</div>
              <div className="text-base font-bold font-mono tabular-nums mt-0.5">
                {formatNPR(dailySummary.grossSalesTotal, language)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="text-slate-500">Gross Profit (FIFO)</div>
              <div className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                {formatNPR(dailySummary.grossProfitTotal, language)}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-3">
            <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Sales by Payment Method
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cash Sales</span>
              <span className="font-mono tabular-nums">{formatNPR(dailySummary.cashSales, language)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">QR Payment</span>
              <span className="font-mono tabular-nums">{formatNPR(dailySummary.qrSales, language)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Bank Transfer</span>
              <span className="font-mono tabular-nums">{formatNPR(dailySummary.bankTransferSales, language)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Mobile Wallet</span>
              <span className="font-mono tabular-nums">{formatNPR(dailySummary.mobileWalletSales, language)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Credit (Udharo) Issued</span>
              <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                {formatNPR(dailySummary.creditSales, language)}
              </span>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
            <div className="font-semibold text-slate-700 dark:text-slate-300">
              Cash Drawer Formula
            </div>
            <label className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Opening Cash Float (+)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={Boolean(existingClose)}
                value={openingCash}
                onChange={(e) => setOpeningCash(Number(e.target.value))}
                className="w-32 h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono tabular-nums"
              />
            </label>
            <div className="flex justify-between">
              <span className="text-slate-500">+ Cash Sales</span>
              <span className="font-mono tabular-nums text-emerald-700">
                +{formatNPR(dailySummary.cashSales, language)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">+ Cash Udharo Recoveries</span>
              <span className="font-mono tabular-nums text-emerald-700">
                +{formatNPR(dailySummary.cashRecoveries, language)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">- Cash Expenses (Total Exp: {formatNPR(dailySummary.totalExpenses)})</span>
              <span className="font-mono tabular-nums text-red-600">
                -{formatNPR(dailySummary.cashExpenses, language)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">- Cash Supplier Payments</span>
              <span className="font-mono tabular-nums text-red-600">
                -{formatNPR(dailySummary.cashSupplierPayments, language)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-slate-200 dark:border-slate-800 pt-2">
              <span>Expected Cash in Drawer</span>
              <span className="font-mono tabular-nums text-teal-700 dark:text-teal-400">
                {formatNPR(expectedCash, language)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Physical Cash Count & Handover */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <h3 className="text-sm font-semibold">Physical Cash Count &amp; Closing</h3>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                disabled={Boolean(existingClose)}
                checked={useDenomCounter}
                onChange={(e) => setUseDenomCounter(e.target.checked)}
              />
              <span>Use NPR Note Counter</span>
            </label>
          </div>

          {useDenomCounter ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {DENOMS.map((d) => (
                <label key={d.key} className="space-y-1 block">
                  <span className="text-[11px] text-slate-500">{d.label}</span>
                  <input
                    type="number"
                    min="0"
                    disabled={Boolean(existingClose)}
                    value={denomCounts[d.key] || 0}
                    onChange={(e) =>
                      setDenomCounts((prev) => ({
                        ...prev,
                        [d.key]: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-full h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-right"
                  />
                </label>
              ))}
            </div>
          ) : (
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Actual Physical Cash Counted (NPR) *</span>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={Boolean(existingClose)}
                value={manualActualCash}
                onChange={(e) => setManualActualCash(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-right"
              />
            </label>
          )}

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex justify-between font-semibold">
              <span>Actual Counted Cash</span>
              <span className="font-mono tabular-nums">{formatNPR(actualCashCounted, language)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Cash Variance (Counted - Expected)</span>
              <span
                className={`font-mono tabular-nums ${
                  cashVariance === 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : cashVariance > 0
                      ? 'text-teal-700 dark:text-teal-400'
                      : 'text-red-600'
                }`}
              >
                {cashVariance > 0 ? '+' : ''}
                {formatNPR(cashVariance, language)}
                {cashVariance === 0 ? ' (Exact)' : cashVariance > 0 ? ' (Excess)' : ' (Short)'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Bank Deposit / Owner Handover (NPR)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={Boolean(existingClose)}
                value={bankDepositAmount}
                onChange={(e) => setBankDepositAmount(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-right"
              />
            </label>
            <div className="space-y-1">
              <span className="text-slate-600 dark:text-slate-400 block">Closing Float Retained (Tomorrow Opening)</span>
              <div className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-end font-mono tabular-nums font-semibold">
                {formatNPR(closingCashRetained, language)}
              </div>
            </div>
          </div>

          <label className="space-y-1 block">
            <span className="text-slate-600 dark:text-slate-400">Closing Remarks / Variance Explanation</span>
            <input
              disabled={Boolean(existingClose)}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., All QR settlements matched, handed NPR 25,000 to bank..."
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </label>

          {!existingClose && (
            <button
              type="submit"
              disabled={busy || !activeStore}
              className="w-full py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              {busy ? 'Closing Day...' : `Close Day (${bsDate} BS)`}
            </button>
          )}
        </div>
      </form>

      {/* Historical Day Close Register */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Daily Day Close Register</h3>
            <p className="text-xs text-slate-500">Permanent daily EOD history across stores.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() =>
                exportToExcel(
                  'Daily_Day_Close_Register',
                  'Day Closes',
                  [
                    'Close Ref',
                    'BS Date',
                    'Store',
                    'Invoices',
                    'Gross Sales',
                    'Cash Sales',
                    'Digital Sales',
                    'Credit Sales',
                    'Expected Cash',
                    'Actual Cash',
                    'Variance',
                    'Deposit',
                    'Retained Float',
                    'Status',
                    'Closed By',
                  ],
                  sortedHistory.map((d) => [
                    d.closeRef,
                    d.bsDate,
                    stores.find((s) => s.id === d.storeId)?.code || d.storeId,
                    d.invoiceCount,
                    d.grossSalesTotal.toFixed(2),
                    d.cashSales.toFixed(2),
                    (d.qrSales + d.bankTransferSales + d.mobileWalletSales).toFixed(2),
                    d.creditSales.toFixed(2),
                    d.expectedCash.toFixed(2),
                    d.actualCashCounted.toFixed(2),
                    d.cashVariance.toFixed(2),
                    d.bankDepositAmount.toFixed(2),
                    d.closingCashRetained.toFixed(2),
                    d.status,
                    d.closedByName,
                  ])
                )
              }
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" /> Excel
            </button>
            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  'Daily_Day_Close_Register',
                  ['Close Ref', 'BS Date', 'Store', 'Invoices', 'Gross Sales', 'Expected Cash', 'Actual Cash', 'Variance', 'Status'],
                  sortedHistory.map((d) => [
                    d.closeRef,
                    d.bsDate,
                    stores.find((s) => s.id === d.storeId)?.code || d.storeId,
                    d.invoiceCount,
                    d.grossSalesTotal.toFixed(2),
                    d.expectedCash.toFixed(2),
                    d.actualCashCounted.toFixed(2),
                    d.cashVariance.toFixed(2),
                    d.status,
                  ])
                )
              }
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Close Ref</th>
                <th className="text-left px-4 py-2.5 font-medium">BS Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Store</th>
                <th className="text-right px-4 py-2.5 font-medium">Bills</th>
                <th className="text-right px-4 py-2.5 font-medium">Gross Sales</th>
                <th className="text-right px-4 py-2.5 font-medium">Expected Cash</th>
                <th className="text-right px-4 py-2.5 font-medium">Actual Cash</th>
                <th className="text-right px-4 py-2.5 font-medium">Variance</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedHistory.map((dc) => {
                const st = stores.find((s) => s.id === dc.storeId);
                return (
                  <tr key={dc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-mono font-semibold">{dc.closeRef}</td>
                    <td className="px-4 py-2.5 font-mono">{dc.bsDate}</td>
                    <td className="px-4 py-2.5">{st?.code || dc.storeId}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{dc.invoiceCount}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                      {formatNPR(dc.grossSalesTotal, language)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatNPR(dc.expectedCash, language)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatNPR(dc.actualCashCounted, language)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono tabular-nums font-medium ${
                        dc.cashVariance === 0
                          ? 'text-emerald-700'
                          : dc.cashVariance < 0
                            ? 'text-red-600'
                            : 'text-teal-700'
                      }`}
                    >
                      {formatNPR(dc.cashVariance, language)}
                    </td>
                    <td className="px-4 py-2.5 capitalize">
                      <span className={dc.status === 'verified' ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                        {dc.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right space-x-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => exportDayClosePdf(dc, st, settings.businessName)}
                        className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                      >
                        Z-Report PDF
                      </button>
                      {dc.status === 'closed' && employee?.role === 'owner' && (
                        <button
                          type="button"
                          onClick={() => handleVerify(dc)}
                          className="text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          Verify
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sortedHistory.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    No daily day-close records yet. Reconcile today&apos;s cash drawer above and click Close Day.
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
