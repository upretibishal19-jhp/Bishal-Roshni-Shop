import { useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { recordCreditRecovery } from '../lib/erpService';
import { bsToAd, daysBetweenAd, formatNPR, todayAd, todayBs } from '../lib/bsDate';
import type { Customer } from '../types/erp';

export function CreditManagementView() {
  const {
    customers,
    salesInvoices,
    customerCreditLedger,
    stores,
    selectedStoreId,
    bsStart,
    bsEnd,
    employee,
    notify,
    language,
  } = useApp();

  const [payCustomer, setPayCustomer] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'cash' | 'bank_transfer' | 'qr' | 'mobile_wallet'>('cash');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payBsDate, setPayBsDate] = useState(todayBs());
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => {
    const periodInv = salesInvoices.filter(
      (i) =>
        i.status === 'confirmed' &&
        (selectedStoreId === 'all' || i.storeId === selectedStoreId) &&
        i.bsDate >= bsStart &&
        i.bsDate <= bsEnd
    );
    const totalSales = periodInv.reduce((s, i) => s + i.netTotal, 0);
    const cashCollected = periodInv.reduce((s, i) => s + i.amountPaid, 0);
    const creditSales = periodInv.reduce((s, i) => s + i.creditAmount, 0);
    const creditRecovered = customerCreditLedger
      .filter(
        (c) =>
          c.entryType === 'payment_recovery' &&
          (selectedStoreId === 'all' || c.storeId === selectedStoreId) &&
          c.bsDate >= bsStart &&
          c.bsDate <= bsEnd
      )
      .reduce((s, c) => s + c.amount, 0);
    const outstandingReceivables = customers.reduce((s, c) => s + c.currentBalance, 0);
    return { totalSales, cashCollected, creditSales, creditRecovered, outstandingReceivables };
  }, [salesInvoices, customerCreditLedger, customers, selectedStoreId, bsStart, bsEnd]);

  const agingRows = useMemo(() => {
    const today = todayAd();
    return customers
      .filter((c) => c.currentBalance > 0)
      .map((c) => {
        const creditEntries = customerCreditLedger
          .filter((e) => e.customerId === c.id && e.entryType === 'credit_sale')
          .sort((a, b) => a.bsDate.localeCompare(b.bsDate));
        const oldest = creditEntries[0];
        const ageDays = oldest ? Math.max(0, daysBetweenAd(bsToAd(oldest.bsDate), today)) : 0;
        const overdue = oldest?.dueDateBs ? todayBs() > oldest.dueDateBs : false;
        const bucket =
          ageDays <= 15 ? '0-15 days' : ageDays <= 30 ? '16-30 days' : ageDays <= 60 ? '31-60 days' : '60+ days';
        return { customer: c, ageDays, bucket, overdue, dueDateBs: oldest?.dueDateBs || '-' };
      });
  }, [customers, customerCreditLedger]);

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !payCustomer) return;
    setBusy(true);
    try {
      await recordCreditRecovery(employee, {
        customer: payCustomer,
        storeId: selectedStoreId !== 'all' ? selectedStoreId : stores[0]?.id || 'store_main',
        amount: payAmount,
        method: payMethod,
        referenceNo: payRef,
        notes: payNotes,
        bsDate: payBsDate,
      });
      notify('success', `Recorded NPR ${payAmount} payment from ${payCustomer.name}.`);
      setPayCustomer(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Strict Separation KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Sales" value={formatNPR(summary.totalSales, language)} />
        <StatCard label="Cash/Digital Collected at Sale" value={formatNPR(summary.cashCollected, language)} tone="green" />
        <StatCard label="Credit Sales (Not Cash)" value={formatNPR(summary.creditSales, language)} tone="amber" />
        <StatCard label="Credit Recovered" value={formatNPR(summary.creditRecovered, language)} tone="green" />
        <StatCard label="Outstanding Receivables" value={formatNPR(summary.outstandingReceivables, language)} tone="red" />
      </div>

      {payCustomer && (
        <form
          onSubmit={handleRecovery}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
        >
          <div className="text-sm font-semibold">
            Record Credit Recovery — {payCustomer.name} (Outstanding: {formatNPR(payCustomer.currentBalance, language)})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="space-y-1 block">
              <span>Amount (NPR) *</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={payCustomer.currentBalance}
                required
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Payment Method</span>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="cash">Cash</option>
                <option value="qr">QR Payment</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="mobile_wallet">Mobile Wallet</option>
              </select>
            </label>
            <label className="space-y-1 block">
              <span>BS Date *</span>
              <input
                required
                value={payBsDate}
                onChange={(e) => setPayBsDate(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Reference / Cheque No.</span>
              <input
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Notes</span>
              <input
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPayCustomer(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-teal-700 text-white font-medium cursor-pointer">
              {busy ? 'Posting...' : 'Receive Payment'}
            </button>
          </div>
        </form>
      )}

      {/* Credit Aging & Overdue Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
          Outstanding Customer Balances & Credit Aging
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                <th className="text-right px-4 py-2.5 font-medium">Credit Limit</th>
                <th className="text-right px-4 py-2.5 font-medium">Outstanding</th>
                <th className="text-left px-4 py-2.5 font-medium">Next Due (BS)</th>
                <th className="text-left px-4 py-2.5 font-medium">Aging Bucket</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {agingRows.map((row) => (
                <tr key={row.customer.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{row.customer.name}</div>
                    <div className="font-mono text-slate-500">
                      {row.customer.customerCode} · {row.customer.mobile}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatNPR(row.customer.creditLimit, language)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                    {formatNPR(row.customer.currentBalance, language)}
                  </td>
                  <td className="px-4 py-2.5 font-mono">{row.dueDateBs}</td>
                  <td className="px-4 py-2.5 font-mono">{row.bucket}</td>
                  <td className="px-4 py-2.5">
                    <span className={row.overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                      {row.overdue ? 'OVERDUE' : 'Within Terms'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => {
                        setPayCustomer(row.customer);
                        setPayAmount(row.customer.currentBalance);
                      }}
                      className="px-2.5 py-1 rounded bg-teal-700 text-white font-medium cursor-pointer"
                    >
                      Receive Payment
                    </button>
                  </td>
                </tr>
              ))}
              {agingRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Zero outstanding customer receivables.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Recovery History */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
          Credit Ledger History
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">BS Date</th>
                <th className="text-left px-4 py-2 font-medium">Customer</th>
                <th className="text-left px-4 py-2 font-medium">Entry</th>
                <th className="text-left px-4 py-2 font-medium">Method</th>
                <th className="text-right px-4 py-2 font-medium">Amount</th>
                <th className="text-left px-4 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {customerCreditLedger
                .sort((a, b) => b.bsDate.localeCompare(a.bsDate))
                .slice(0, 50)
                .map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 font-mono">{e.bsDate}</td>
                    <td className="px-4 py-2 font-medium">{e.customerName}</td>
                    <td className="px-4 py-2 capitalize">{e.entryType.replace('_', ' ')}</td>
                    <td className="px-4 py-2 uppercase">{e.method}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {formatNPR(e.amount, language)}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{e.notes || e.invoiceNo || '-'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' | 'red' }) {
  const cls =
    tone === 'green'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'amber'
        ? 'text-amber-700 dark:text-amber-400'
        : tone === 'red'
          ? 'text-red-600 dark:text-red-400'
          : '';
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-base font-mono font-bold tabular-nums mt-1 ${cls}`}>{value}</div>
    </div>
  );
}
