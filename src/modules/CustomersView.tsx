import { useState } from 'react';
import { Plus, FileDown } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { saveCustomer } from '../lib/erpService';
import { exportReportPdf } from '../lib/exportUtils';
import { formatNPR } from '../lib/bsDate';
import type { Customer } from '../types/erp';

export function CustomersView() {
  const { customers, salesInvoices, customerCreditLedger, stores, employee, notify, language } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);

  const [customerCode, setCustomerCode] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [customerType, setCustomerType] = useState<'retail' | 'wholesale'>('retail');
  const [creditLimit, setCreditLimit] = useState(10000);
  const [defaultDueDays, setDefaultDueDays] = useState(15);
  const [storeId, setStoreId] = useState('');
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    setEditing(null);
    setCustomerCode(`CUST-${String(customers.length + 1).padStart(3, '0')}`);
    setName('');
    setMobile('');
    setAddress('');
    setCustomerType('retail');
    setCreditLimit(10000);
    setDefaultDueDays(15);
    setStoreId('');
    setShowForm(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setCustomerCode(c.customerCode);
    setName(c.name);
    setMobile(c.mobile);
    setAddress(c.address || '');
    setCustomerType(c.customerType);
    setCreditLimit(c.creditLimit);
    setDefaultDueDays(c.defaultDueDays);
    setStoreId(c.storeId || '');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setBusy(true);
    try {
      await saveCustomer(employee, {
        id: editing?.id,
        customerCode,
        name,
        mobile,
        address,
        customerType,
        creditLimit,
        defaultDueDays,
        storeId: storeId || undefined,
        active: true,
      });
      notify('success', editing ? 'Customer updated.' : 'Customer registered.');
      setShowForm(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save customer.');
    } finally {
      setBusy(false);
    }
  };

  const downloadStatement = (c: Customer) => {
    const rows = customerCreditLedger
      .filter((e) => e.customerId === c.id)
      .sort((a, b) => a.bsDate.localeCompare(b.bsDate))
      .map((e) => [
        e.bsDate,
        e.entryType,
        e.invoiceNo || e.referenceNo || '-',
        e.method,
        e.entryType === 'credit_sale' ? `+${e.amount.toFixed(2)}` : `-${e.amount.toFixed(2)}`,
        e.notes || '',
      ]);
    exportReportPdf(
      `Statement_${c.customerCode}`,
      `Customer Statement: ${c.name} (${c.customerCode})`,
      `Mobile: ${c.mobile} | Credit Limit: ${formatNPR(c.creditLimit)} | Current Balance: ${formatNPR(c.currentBalance)}`,
      ['BS Date', 'Entry Type', 'Reference', 'Method', 'Amount (NPR)', 'Notes'],
      rows
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Registered Customers (Retail & Wholesale)</h2>
          <p className="text-xs text-slate-500">Customer directory, credit limits, and transaction statements.</p>
        </div>
        <button
          onClick={openNew}
          className="h-9 px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Register Customer
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
        >
          <div className="text-sm font-semibold">{editing ? `Edit ${editing.name}` : 'New Registered Customer'}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <label className="space-y-1 block">
              <span>Customer ID *</span>
              <input
                required
                disabled={Boolean(editing)}
                value={customerCode}
                onChange={(e) => setCustomerCode(e.target.value.toUpperCase())}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Full Name *</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 block">
              <span>Mobile Number *</span>
              <input
                required
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Address</span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 block">
              <span>Category</span>
              <select
                value={customerType}
                onChange={(e) => setCustomerType(e.target.value as 'retail' | 'wholesale')}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="retail">Retail Customer</option>
                <option value="wholesale">Wholesale Customer</option>
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Credit Limit (NPR)</span>
              <input
                type="number"
                min="0"
                value={creditLimit}
                onChange={(e) => setCreditLimit(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Default Due Days</span>
              <input
                type="number"
                min="0"
                value={defaultDueDays}
                onChange={(e) => setDefaultDueDays(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Primary Store</span>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">All Branches</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-teal-700 text-white font-medium cursor-pointer">
              {busy ? 'Saving...' : 'Save Customer'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Customer ID</th>
                <th className="text-left px-4 py-2.5 font-medium">Name & Mobile</th>
                <th className="text-left px-4 py-2.5 font-medium">Type</th>
                <th className="text-right px-4 py-2.5 font-medium">Total Purchases</th>
                <th className="text-right px-4 py-2.5 font-medium">Credit Limit</th>
                <th className="text-right px-4 py-2.5 font-medium">Outstanding</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {customers.map((c) => {
                const totalBought = salesInvoices
                  .filter((i) => i.status === 'confirmed' && i.customerId === c.id)
                  .reduce((s, i) => s + i.netTotal, 0);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-mono font-semibold">{c.customerCode}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{c.name}</div>
                      <div className="font-mono text-slate-500">
                        {c.mobile}
                        {c.address ? ` · ${c.address}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 capitalize">{c.customerType}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatNPR(totalBought, language)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatNPR(c.creditLimit, language)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono tabular-nums font-semibold ${
                        c.currentBalance > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700'
                      }`}
                    >
                      {formatNPR(c.currentBalance, language)}
                    </td>
                    <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                      <button onClick={() => setStatementCustomer(c)} className="text-slate-700 dark:text-slate-300 hover:underline cursor-pointer">
                        History
                      </button>
                      <button onClick={() => downloadStatement(c)} className="text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer">
                        <FileDown className="w-3 h-3" /> Statement
                      </button>
                      <button onClick={() => openEdit(c)} className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer">
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No registered customers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {statementCustomer && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Transaction History — {statementCustomer.name} ({statementCustomer.customerCode})
            </h3>
            <button onClick={() => setStatementCustomer(null)} className="text-xs text-slate-500 hover:underline cursor-pointer">
              Close
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {salesInvoices
              .filter((i) => i.customerId === statementCustomer.id)
              .map((inv) => (
                <div key={inv.id} className="py-2 flex justify-between">
                  <span>
                    <span className="font-mono font-medium">{inv.invoiceNo}</span> · {inv.bsDate} ({inv.status})
                  </span>
                  <span className="font-mono tabular-nums">
                    Total: {formatNPR(inv.netTotal, language)} · Paid: {formatNPR(inv.amountPaid, language)} · Credit: {formatNPR(inv.creditAmount, language)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
