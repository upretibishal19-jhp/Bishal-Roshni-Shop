import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { recordSupplierPayment, saveSupplier } from '../lib/erpService';
import { formatNPR, todayBs } from '../lib/bsDate';
import type { Supplier } from '../types/erp';

export function SuppliersView() {
  const { suppliers, supplierPayments, stores, selectedStoreId, employee, notify, language } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [panVatNo, setPanVatNo] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 15 Days');
  const [busy, setBusy] = useState(false);

  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'cash' | 'bank_transfer' | 'qr' | 'mobile_wallet'>('bank_transfer');
  const [payRef, setPayRef] = useState('');
  const [payBsDate, setPayBsDate] = useState(todayBs());

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setBusy(true);
    try {
      await saveSupplier(employee, {
        id: editing?.id,
        name,
        contactPerson,
        phone,
        address,
        panVatNo,
        paymentTerms,
        active: true,
      });
      notify('success', editing ? 'Supplier updated.' : 'Supplier added.');
      setShowForm(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save supplier.');
    } finally {
      setBusy(false);
    }
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !paySupplier) return;
    setBusy(true);
    try {
      await recordSupplierPayment(employee, {
        supplier: paySupplier,
        storeId: selectedStoreId !== 'all' ? selectedStoreId : stores[0]?.id || 'store_main',
        method: payMethod,
        amount: payAmount,
        referenceNo: payRef,
        bsDate: payBsDate,
      });
      notify('success', `Recorded payment of NPR ${payAmount} to ${paySupplier.name}.`);
      setPaySupplier(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Suppliers & Payables</h2>
          <p className="text-xs text-slate-500">Manage wholesale distributors, PAN/VAT numbers, and payable settlements.</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setName('');
            setContactPerson('');
            setPhone('');
            setAddress('');
            setPanVatNo('');
            setPaymentTerms('Net 15 Days');
            setShowForm(true);
          }}
          className="h-9 px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Supplier
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="text-sm font-semibold">{editing ? `Edit ${editing.name}` : 'New Supplier'}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <label className="space-y-1 block">
              <span>Supplier Name *</span>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
            </label>
            <label className="space-y-1 block">
              <span>Contact Person</span>
              <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
            </label>
            <label className="space-y-1 block">
              <span>Phone *</span>
              <input required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            </label>
            <label className="space-y-1 block">
              <span>Address</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
            </label>
            <label className="space-y-1 block">
              <span>PAN / VAT No.</span>
              <input value={panVatNo} onChange={(e) => setPanVatNo(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            </label>
            <label className="space-y-1 block">
              <span>Payment Terms</span>
              <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-teal-700 text-white font-medium cursor-pointer">
              {busy ? 'Saving...' : 'Save Supplier'}
            </button>
          </div>
        </form>
      )}

      {paySupplier && (
        <form onSubmit={handlePay} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="text-sm font-semibold">
            Pay Supplier — {paySupplier.name} (Payable: {formatNPR(paySupplier.currentPayable, language)})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="space-y-1 block">
              <span>Amount (NPR) *</span>
              <input type="number" step="0.01" min="0.01" required value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            </label>
            <label className="space-y-1 block">
              <span>Method</span>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="qr">QR Payment</option>
                <option value="mobile_wallet">Mobile Wallet</option>
              </select>
            </label>
            <label className="space-y-1 block">
              <span>BS Date</span>
              <input required value={payBsDate} onChange={(e) => setPayBsDate(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            </label>
            <label className="space-y-1 block">
              <span>Reference No.</span>
              <input value={payRef} onChange={(e) => setPayRef(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPaySupplier(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-teal-700 text-white font-medium cursor-pointer">
              Record Payment
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Supplier</th>
                <th className="text-left px-4 py-2.5 font-medium">Contact & Phone</th>
                <th className="text-left px-4 py-2.5 font-medium">PAN/VAT · Terms</th>
                <th className="text-right px-4 py-2.5 font-medium">Outstanding Payable</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {suppliers.map((sp) => (
                <tr key={sp.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{sp.name}</div>
                    {sp.address && <div className="text-slate-500">{sp.address}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div>{sp.contactPerson || '-'}</div>
                    <div className="font-mono text-slate-500">{sp.phone}</div>
                  </td>
                  <td className="px-4 py-2.5 font-mono">
                    {sp.panVatNo || 'N/A'} · {sp.paymentTerms || 'Cash'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-red-600 dark:text-red-400">
                    {formatNPR(sp.currentPayable, language)}
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-2">
                    <button
                      onClick={() => {
                        setPaySupplier(sp);
                        setPayAmount(sp.currentPayable);
                      }}
                      className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                    >
                      Pay
                    </button>
                    <button
                      onClick={() => {
                        setEditing(sp);
                        setName(sp.name);
                        setContactPerson(sp.contactPerson || '');
                        setPhone(sp.phone);
                        setAddress(sp.address || '');
                        setPanVatNo(sp.panVatNo || '');
                        setPaymentTerms(sp.paymentTerms || '');
                        setShowForm(true);
                      }}
                      className="text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No suppliers added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {supplierPayments.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2 text-xs">
          <div className="font-semibold">Recent Supplier Settlements</div>
          {supplierPayments.slice(0, 10).map((p) => (
            <div key={p.id} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span>
                <span className="font-mono">{p.bsDate}</span> · {p.supplierName} ({p.method})
              </span>
              <span className="font-mono tabular-nums font-medium">{formatNPR(p.amount, language)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
