import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { saveStore } from '../lib/erpService';
import { formatNPR } from '../lib/bsDate';
import type { Store, TaxMode } from '../types/erp';

export function StoresView() {
  const { stores, salesInvoices, stockBatches, expenses, employee, notify, language } = useApp();
  const [editing, setEditing] = useState<Store | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameNe, setNameNe] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [panVatNo, setPanVatNo] = useState('');
  const [taxMode, setTaxMode] = useState<TaxMode>('vat_13');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    setEditing(null);
    setCode('');
    setName('');
    setNameNe('');
    setAddress('');
    setPhone('');
    setPanVatNo('');
    setTaxMode('vat_13');
    setActive(true);
    setShowForm(true);
  };

  const openEdit = (s: Store) => {
    setEditing(s);
    setCode(s.code);
    setName(s.name);
    setNameNe(s.nameNe || '');
    setAddress(s.address);
    setPhone(s.phone || '');
    setPanVatNo(s.panVatNo || '');
    setTaxMode(s.taxMode);
    setActive(s.active);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setBusy(true);
    try {
      await saveStore(employee, {
        id: editing?.id,
        code,
        name,
        nameNe,
        address,
        phone,
        panVatNo,
        taxMode,
        active,
      });
      notify('success', editing ? 'Store updated.' : 'Store created.');
      setShowForm(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save store.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Multi-Store Branches</h2>
          <p className="text-xs text-slate-500">Manage branches, tax registration mode, and live branch metrics.</p>
        </div>
        {employee?.role === 'owner' && (
          <button
            onClick={openNew}
            className="px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Store
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div className="text-sm font-semibold">{editing ? `Edit ${editing.code}` : 'New Store Branch'}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Store Code *</span>
              <input
                required
                disabled={Boolean(editing)}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="BRKP-02"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Store Name (EN) *</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Baneswor Supermarket Branch"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Store Name (नेपाली)</span>
              <input
                value={nameNe}
                onChange={(e) => setNameNe(e.target.value)}
                placeholder="बानेश्वर शाखा"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Address *</span>
              <input
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Kathmandu"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Phone</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01-4400000"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">PAN / VAT No.</span>
              <input
                value={panVatNo}
                onChange={(e) => setPanVatNo(e.target.value)}
                placeholder="600123456"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Tax Mode</span>
              <select
                value={taxMode}
                onChange={(e) => setTaxMode(e.target.value as TaxMode)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="vat_13">13% VAT + Exempt Staples</option>
                <option value="pan_only">PAN-Only (No VAT)</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pt-5">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span>Store Active</span>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save Store'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Code</th>
                <th className="text-left px-4 py-2.5 font-medium">Store Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Address</th>
                <th className="text-left px-4 py-2.5 font-medium">Tax Mode</th>
                <th className="text-right px-4 py-2.5 font-medium">Stock Valuation</th>
                <th className="text-right px-4 py-2.5 font-medium">Total Sales</th>
                <th className="text-right px-4 py-2.5 font-medium">Expenses</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                {employee?.role === 'owner' && <th className="text-right px-4 py-2.5 font-medium">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {stores.map((s) => {
                const stockVal = stockBatches
                  .filter((b) => b.storeId === s.id)
                  .reduce((sum, b) => sum + b.qtyRemaining * b.unitCost, 0);
                const salesTotal = salesInvoices
                  .filter((i) => i.status === 'confirmed' && i.storeId === s.id)
                  .reduce((sum, i) => sum + i.netTotal, 0);
                const expTotal = expenses
                  .filter((e) => e.storeId === s.id)
                  .reduce((sum, e) => sum + e.amount, 0);
                return (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-mono font-medium">{s.code}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{s.name}</div>
                      {s.nameNe && <div className="text-slate-500">{s.nameNe}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{s.address}</td>
                    <td className="px-4 py-2.5">{s.taxMode === 'vat_13' ? '13% VAT' : 'PAN Only'}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNPR(stockVal, language)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNPR(salesTotal, language)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNPR(expTotal, language)}</td>
                    <td className="px-4 py-2.5">
                      <span className={s.active ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-500'}>
                        {s.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {employee?.role === 'owner' && (
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => openEdit(s)} className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer">
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
