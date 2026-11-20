import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { saveExpense } from '../lib/erpService';
import { formatNPR, todayBs } from '../lib/bsDate';
import { EXPENSE_LABELS } from '../lib/i18n';
import type { ExpenseCategory } from '../types/erp';

const CATEGORIES: ExpenseCategory[] = [
  'rent',
  'electricity',
  'salaries',
  'delivery',
  'transportation',
  'maintenance',
  'other',
];

export function ExpensesView() {
  const { stores, expenses, selectedStoreId, bsStart, bsEnd, employee, notify, language } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [storeId, setStoreId] = useState(selectedStoreId !== 'all' ? selectedStoreId : stores[0]?.id || '');
  const [category, setCategory] = useState<ExpenseCategory>('rent');
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'qr' | 'mobile_wallet'>('cash');
  const [description, setDescription] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [bsDate, setBsDate] = useState(todayBs());
  const [busy, setBusy] = useState(false);

  const filtered = expenses
    .filter(
      (e) =>
        (selectedStoreId === 'all' || e.storeId === selectedStoreId) &&
        e.bsDate >= bsStart &&
        e.bsDate <= bsEnd
    )
    .sort((a, b) => b.bsDate.localeCompare(a.bsDate));

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setBusy(true);
    try {
      await saveExpense(employee, {
        storeId: storeId || stores[0]?.id || '',
        category,
        amount,
        paymentMethod,
        description,
        referenceNo,
        bsDate,
      });
      notify('success', 'Expense recorded.');
      setShowForm(false);
      setAmount(0);
      setDescription('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save expense.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Operating Expenses</h2>
          <p className="text-xs text-slate-500">
            Period Total: <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{formatNPR(total, language)}</span>
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="h-9 px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Log Expense
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="text-sm font-semibold">Record Store Operating Expense</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
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
              <span>Category *</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_LABELS[c][language]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Amount (NPR) *</span>
              <input type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            </label>
            <label className="space-y-1 block">
              <span>Payment Method</span>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="qr">QR Payment</option>
                <option value="mobile_wallet">Mobile Wallet</option>
              </select>
            </label>
            <label className="space-y-1 block">
              <span>BS Date *</span>
              <input required value={bsDate} onChange={(e) => setBsDate(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            </label>
            <label className="space-y-1 block">
              <span>Voucher / Ref No.</span>
              <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            </label>
          </div>
          <input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Expense description..." className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-teal-700 text-white font-medium cursor-pointer">
              Save Expense
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">BS Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Store</th>
                <th className="text-left px-4 py-2.5 font-medium">Category</th>
                <th className="text-left px-4 py-2.5 font-medium">Description</th>
                <th className="text-left px-4 py-2.5 font-medium">Method</th>
                <th className="text-right px-4 py-2.5 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((ex) => {
                const st = stores.find((s) => s.id === ex.storeId);
                return (
                  <tr key={ex.id}>
                    <td className="px-4 py-2.5 font-mono">{ex.bsDate}</td>
                    <td className="px-4 py-2.5">{st?.code || ex.storeId}</td>
                    <td className="px-4 py-2.5">{EXPENSE_LABELS[ex.category][language]}</td>
                    <td className="px-4 py-2.5">{ex.description}</td>
                    <td className="px-4 py-2.5 uppercase">{ex.paymentMethod}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                      {formatNPR(ex.amount, language)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No expenses recorded for this period.
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
