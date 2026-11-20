import { useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import {
  addDaysBs,
  daysBetweenAd,
  formatNPR,
  getBsFiscalYearRange,
  getBsMonthRange,
  todayAd,
  todayBs,
} from '../lib/bsDate';
import { CHANNEL_LABELS, PAYMENT_LABELS, t } from '../lib/i18n';
import type { SalesChannel } from '../types/erp';

export function DashboardView() {
  const {
    language,
    selectedStoreId,
    bsStart,
    bsEnd,
    stores,
    products,
    stockBatches,
    salesInvoices,
    customerCreditLedger,
    customers,
    suppliers,
    expenses,
    wasteRecords,
    employee,
    setActiveModule,
  } = useApp();

  const [channelFilter, setChannelFilter] = useState<'all' | SalesChannel>('all');
  const currentBs = todayBs();
  const currentAd = todayAd();
  const weekStartBs = addDaysBs(currentBs, -6);
  const monthRange = getBsMonthRange(currentBs);
  const yearRange = getBsFiscalYearRange(currentBs);

  const canSeeProfit = employee?.role === 'owner' || employee?.permissions.canViewProfitReports;

  const activeInvoices = useMemo(() => {
    return salesInvoices.filter((inv) => {
      if (inv.status === 'reversed') return false;
      if (selectedStoreId !== 'all' && inv.storeId !== selectedStoreId) return false;
      if (channelFilter !== 'all' && inv.channel !== channelFilter) return false;
      return true;
    });
  }, [salesInvoices, selectedStoreId, channelFilter]);

  const rangeInvoices = useMemo(
    () => activeInvoices.filter((i) => i.bsDate >= bsStart && i.bsDate <= bsEnd),
    [activeInvoices, bsStart, bsEnd]
  );

  const metrics = useMemo(() => {
    const dailySales = activeInvoices
      .filter((i) => i.bsDate === currentBs)
      .reduce((s, i) => s + i.netTotal, 0);
    const weeklySales = activeInvoices
      .filter((i) => i.bsDate >= weekStartBs && i.bsDate <= currentBs)
      .reduce((s, i) => s + i.netTotal, 0);
    const monthlySales = activeInvoices
      .filter((i) => i.bsDate >= monthRange.start && i.bsDate <= monthRange.end)
      .reduce((s, i) => s + i.netTotal, 0);
    const yearlySales = activeInvoices
      .filter((i) => i.bsDate >= yearRange.start && i.bsDate <= yearRange.end)
      .reduce((s, i) => s + i.netTotal, 0);

    const retailSales = rangeInvoices
      .filter((i) => i.channel === 'walk_in')
      .reduce((s, i) => s + i.netTotal, 0);
    const wholesaleSales = rangeInvoices
      .filter((i) => i.channel === 'wholesale')
      .reduce((s, i) => s + i.netTotal, 0);
    const onlineSales = rangeInvoices
      .filter((i) => ['phone', 'whatsapp', 'messenger', 'online'].includes(i.channel))
      .reduce((s, i) => s + i.netTotal, 0);

    const totalRangeSales = rangeInvoices.reduce((s, i) => s + i.netTotal, 0);
    const grossProfit = rangeInvoices.reduce((s, i) => s + i.grossProfit, 0);
    const avgBill = rangeInvoices.length > 0 ? totalRangeSales / rangeInvoices.length : 0;

    const rangeExpenses = expenses
      .filter(
        (e) =>
          (selectedStoreId === 'all' || e.storeId === selectedStoreId) &&
          e.bsDate >= bsStart &&
          e.bsDate <= bsEnd
      )
      .reduce((s, e) => s + e.amount, 0);

    const rangeWaste = wasteRecords
      .filter(
        (w) =>
          (selectedStoreId === 'all' || w.storeId === selectedStoreId) &&
          w.bsDate >= bsStart &&
          w.bsDate <= bsEnd
      )
      .reduce((s, w) => s + w.financialLoss, 0);

    const netProfit = grossProfit - rangeExpenses - rangeWaste;

    // Payment method separation
    const paymentSums: Record<string, number> = {
      cash: 0,
      qr: 0,
      bank_transfer: 0,
      mobile_wallet: 0,
      credit: 0,
    };
    for (const inv of rangeInvoices) {
      for (const alloc of inv.paymentAllocations) {
        paymentSums[alloc.method] = (paymentSums[alloc.method] || 0) + alloc.amount;
      }
    }

    const creditRecovered = customerCreditLedger
      .filter(
        (c) =>
          c.entryType === 'payment_recovery' &&
          (selectedStoreId === 'all' || c.storeId === selectedStoreId) &&
          c.bsDate >= bsStart &&
          c.bsDate <= bsEnd
      )
      .reduce((s, c) => s + c.amount, 0);

    const cashCollected =
      paymentSums.cash + paymentSums.qr + paymentSums.bank_transfer + paymentSums.mobile_wallet;
    const outstandingReceivables = customers.reduce((s, c) => s + c.currentBalance, 0);
    const supplierPayables = suppliers.reduce((s, sp) => s + sp.currentPayable, 0);

    return {
      dailySales,
      weeklySales,
      monthlySales,
      yearlySales,
      retailSales,
      wholesaleSales,
      onlineSales,
      totalRangeSales,
      grossProfit,
      netProfit,
      avgBill,
      paymentSums,
      creditRecovered,
      cashCollected,
      outstandingReceivables,
      supplierPayables,
    };
  }, [
    activeInvoices,
    rangeInvoices,
    expenses,
    wasteRecords,
    customerCreditLedger,
    customers,
    suppliers,
    selectedStoreId,
    bsStart,
    bsEnd,
    currentBs,
    weekStartBs,
    monthRange,
    yearRange,
  ]);

  const channelBreakdown = useMemo(() => {
    const channels: SalesChannel[] = ['walk_in', 'phone', 'whatsapp', 'messenger', 'online', 'wholesale'];
    return channels.map((ch) => {
      const list = rangeInvoices.filter((i) => i.channel === ch);
      return {
        channel: ch,
        count: list.length,
        total: list.reduce((s, i) => s + i.netTotal, 0),
      };
    });
  }, [rangeInvoices]);

  const storeBreakdown = useMemo(() => {
    return stores.map((st) => {
      const list = salesInvoices.filter(
        (i) => i.status === 'confirmed' && i.storeId === st.id && i.bsDate >= bsStart && i.bsDate <= bsEnd
      );
      const rev = list.reduce((s, i) => s + i.netTotal, 0);
      const gp = list.reduce((s, i) => s + i.grossProfit, 0);
      const cash = list.reduce((s, i) => s + i.amountPaid, 0);
      const cred = list.reduce((s, i) => s + i.creditAmount, 0);
      return { store: st, count: list.length, rev, gp, cash, cred };
    });
  }, [stores, salesInvoices, bsStart, bsEnd]);

  const alerts = useMemo(() => {
    const relevantBatches = stockBatches.filter(
      (b) => (selectedStoreId === 'all' || b.storeId === selectedStoreId) && b.qtyRemaining > 0 && b.expiryDateAd
    );
    let expired = 0;
    let exp5 = 0;
    let exp10 = 0;
    let exp18 = 0;
    for (const b of relevantBatches) {
      const days = daysBetweenAd(currentAd, b.expiryDateAd!);
      if (days < 0) expired++;
      else if (days <= 5) exp5++;
      else if (days <= 10) exp10++;
      else if (days <= 18) exp18++;
    }

    const lowStock = products.filter((p) => {
      if (p.status !== 'active') return false;
      const qty = stockBatches
        .filter((b) => (selectedStoreId === 'all' || b.storeId === selectedStoreId) && b.productId === p.id)
        .reduce((s, b) => s + b.qtyRemaining, 0);
      return qty <= p.minStock;
    }).length;

    const overdueCreditCount = customers.filter((c) => c.currentBalance > 0).length;

    return { expired, exp5, exp10, exp18, lowStock, overdueCreditCount };
  }, [stockBatches, products, customers, selectedStoreId, currentAd]);

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          Period: <span className="font-mono font-medium text-slate-900 dark:text-slate-100">{bsStart} BS</span> to{' '}
          <span className="font-mono font-medium text-slate-900 dark:text-slate-100">{bsEnd} BS</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['all', 'walk_in', 'phone', 'whatsapp', 'messenger', 'online', 'wholesale'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                channelFilter === ch
                  ? 'bg-slate-900 dark:bg-teal-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {ch === 'all' ? 'All Channels' : CHANNEL_LABELS[ch][language]}
            </button>
          ))}
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label={t('todaySales', language)} value={formatNPR(metrics.dailySales, language)} sub={`Weekly: ${formatNPR(metrics.weeklySales, language)}`} />
        <KpiCard label={t('monthlySales', language)} value={formatNPR(metrics.monthlySales, language)} sub={`Yearly FY: ${formatNPR(metrics.yearlySales, language)}`} />
        <KpiCard
          label={t('cashCollected', language)}
          value={formatNPR(metrics.cashCollected, language)}
          sub={`Recovered: ${formatNPR(metrics.creditRecovered, language)}`}
          tone="green"
        />
        <KpiCard
          label={t('outstandingCredit', language)}
          value={formatNPR(metrics.outstandingReceivables, language)}
          sub={`Payable: ${formatNPR(metrics.supplierPayables, language)}`}
          tone={metrics.outstandingReceivables > 0 ? 'amber' : 'neutral'}
        />
      </div>

      {/* Secondary Business Performance Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <MiniStat label={t('retailSales', language)} value={formatNPR(metrics.retailSales, language)} />
        <MiniStat label={t('wholesaleSales', language)} value={formatNPR(metrics.wholesaleSales, language)} />
        <MiniStat label={t('onlineSales', language)} value={formatNPR(metrics.onlineSales, language)} />
        <MiniStat label={t('avgTransaction', language)} value={formatNPR(metrics.avgBill, language)} />
        <MiniStat label={t('customerCount', language)} value={String(customers.length)} />
        <MiniStat
          label={canSeeProfit ? t('grossProfit', language) : 'Total Bills'}
          value={canSeeProfit ? formatNPR(metrics.grossProfit, language) : String(rangeInvoices.length)}
        />
      </div>

      {canSeeProfit && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">Period Net Sales</div>
            <div className="text-lg font-mono font-semibold tabular-nums mt-1">
              {formatNPR(metrics.totalRangeSales, language)}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">{t('grossProfit', language)} (FIFO)</div>
            <div className="text-lg font-mono font-semibold tabular-nums mt-1 text-emerald-700 dark:text-emerald-400">
              {formatNPR(metrics.grossProfit, language)}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">{t('netProfit', language)}</div>
            <div
              className={`text-lg font-mono font-semibold tabular-nums mt-1 ${
                metrics.netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatNPR(metrics.netProfit, language)}
            </div>
          </div>
        </div>
      )}

      {/* Channel Breakdown + Payment Methods + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold">Sales by Channel</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {channelBreakdown.map((c) => (
              <div key={c.channel} className="py-2 flex items-center justify-between">
                <span>
                  {CHANNEL_LABELS[c.channel][language]}{' '}
                  <span className="text-slate-400">({c.count})</span>
                </span>
                <span className="font-mono tabular-nums font-medium">{formatNPR(c.total, language)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold">Payment Method Split</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {(['cash', 'qr', 'bank_transfer', 'mobile_wallet', 'credit'] as const).map((pm) => (
              <div key={pm} className="py-2 flex items-center justify-between">
                <span>{PAYMENT_LABELS[pm][language]}</span>
                <span className="font-mono tabular-nums font-medium">
                  {formatNPR(metrics.paymentSums[pm] || 0, language)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold">Inventory & Credit Alerts</h3>
          <div className="space-y-2 text-xs">
            <AlertRow label="Already Expired Batches" count={alerts.expired} severity={alerts.expired > 0 ? 'red' : 'ok'} onClick={() => setActiveModule('expiry_damage')} />
            <AlertRow label="Expiring within 5 days" count={alerts.exp5} severity={alerts.exp5 > 0 ? 'red' : 'ok'} onClick={() => setActiveModule('expiry_damage')} />
            <AlertRow label="Expiring within 10 days" count={alerts.exp10} severity={alerts.exp10 > 0 ? 'amber' : 'ok'} onClick={() => setActiveModule('expiry_damage')} />
            <AlertRow label="Expiring within 18 days" count={alerts.exp18} severity={alerts.exp18 > 0 ? 'amber' : 'ok'} onClick={() => setActiveModule('expiry_damage')} />
            <AlertRow label="Items Below Minimum Stock" count={alerts.lowStock} severity={alerts.lowStock > 0 ? 'amber' : 'ok'} onClick={() => setActiveModule('inventory')} />
            <AlertRow label="Customers with Credit Balance" count={alerts.overdueCreditCount} severity={alerts.overdueCreditCount > 0 ? 'amber' : 'ok'} onClick={() => setActiveModule('credit_management')} />
          </div>
        </div>
      </div>

      {/* Store-by-Store Performance Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Multi-Store Performance Comparison</h3>
          <span className="text-xs text-slate-500">{stores.length} store(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium">Store</th>
                <th className="text-right px-4 py-2.5 font-medium">Invoices</th>
                <th className="text-right px-4 py-2.5 font-medium">Net Sales</th>
                <th className="text-right px-4 py-2.5 font-medium">Cash / Digital Paid</th>
                <th className="text-right px-4 py-2.5 font-medium">Credit Sales</th>
                {canSeeProfit && <th className="text-right px-5 py-2.5 font-medium">Gross Profit</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {storeBreakdown.map((row) => (
                <tr key={row.store.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-5 py-2.5 font-medium">
                    {row.store.code} · {row.store.name}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{row.count}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">{formatNPR(row.rev, language)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatNPR(row.cash, language)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                    {formatNPR(row.cred, language)}
                  </td>
                  {canSeeProfit && (
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums">{formatNPR(row.gp, language)}</td>
                  )}
                </tr>
              ))}
              {storeBreakdown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    No stores configured yet. Create your first branch in the Stores module.
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

function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'neutral' | 'green' | 'amber';
}) {
  const toneClass =
    tone === 'green'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'amber'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-slate-900 dark:text-slate-100';
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-xl font-mono font-bold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">{sub}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{label}</div>
      <div className="text-sm font-mono font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function AlertRow({
  label,
  count,
  severity,
  onClick,
}: {
  label: string;
  count: number;
  severity: 'red' | 'amber' | 'ok';
  onClick: () => void;
}) {
  const cls =
    severity === 'red'
      ? 'text-red-700 dark:text-red-400'
      : severity === 'amber'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-emerald-700 dark:text-emerald-400';
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left cursor-pointer"
    >
      <span className="text-slate-700 dark:text-slate-300">{label}</span>
      <span className={`font-mono font-semibold tabular-nums ${cls}`}>{count}</span>
    </button>
  );
}
