import { useEffect, useState } from 'react';
import { Download, Upload, RefreshCw, Save, Wifi, WifiOff } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import {
  saveBusinessSettings,
  saveCustomer,
  saveProduct,
  saveStore,
  saveSupplier,
} from '../lib/erpService';
import { todayBs } from '../lib/bsDate';
import type { Customer, Product, Store, Supplier, TaxMode } from '../types/erp';

export function SettingsView() {
  const {
    settings,
    stores,
    products,
    stockBatches,
    stockLedger,
    stockCounts,
    customers,
    salesInvoices,
    customerCreditLedger,
    suppliers,
    purchaseOrders,
    goodsReceipts,
    supplierPayments,
    stockTransfers,
    onlineOrders,
    wasteRecords,
    expenses,
    employees,
    auditLogs,
    dayCloses,
    comboOffers,
    employee,
    isOnline,
    offlineQueue,
    syncOfflineSales,
    notify,
  } = useApp();

  const [businessName, setBusinessName] = useState(settings.businessName);
  const [businessNameNe, setBusinessNameNe] = useState(settings.businessNameNe || '');
  const [panVatNo, setPanVatNo] = useState(settings.panVatNo || '');
  const [taxMode, setTaxMode] = useState<TaxMode>(settings.taxMode);
  const [defaultVatRate, setDefaultVatRate] = useState(settings.defaultVatRate);
  const [smallRetailThreshold, setSmallRetailThreshold] = useState(settings.smallRetailThreshold);
  const [allowAnonymousRetail, setAllowAnonymousRetail] = useState(settings.allowAnonymousRetail);
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(settings.fiscalYearStartMonth);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreReport, setRestoreReport] = useState<string | null>(null);

  useEffect(() => {
    setBusinessName(settings.businessName);
    setBusinessNameNe(settings.businessNameNe || '');
    setPanVatNo(settings.panVatNo || '');
    setTaxMode(settings.taxMode);
    setDefaultVatRate(settings.defaultVatRate);
    setSmallRetailThreshold(settings.smallRetailThreshold);
    setAllowAnonymousRetail(settings.allowAnonymousRetail);
    setFiscalYearStartMonth(settings.fiscalYearStartMonth);
  }, [settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setBusy(true);
    try {
      await saveBusinessSettings(employee, {
        businessName,
        businessNameNe,
        panVatNo,
        taxMode,
        defaultVatRate,
        smallRetailThreshold,
        allowAnonymousRetail,
        fiscalYearStartMonth,
      });
      notify('success', 'Business and tax settings saved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setBusy(false);
    }
  };

  const handleExportBackup = () => {
    const snapshot = {
      exportedAtIso: new Date().toISOString(),
      exportedAtBs: todayBs(),
      businessId: settings.businessId,
      settings,
      stores,
      products,
      stockBatches,
      stockLedger,
      stockCounts,
      customers,
      salesInvoices,
      customerCreditLedger,
      suppliers,
      purchaseOrders,
      goodsReceipts,
      supplierPayments,
      stockTransfers,
      onlineOrders,
      wasteRecords,
      expenses,
      employees,
      auditLogs,
      dayCloses,
      comboOffers,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bishal_Roshni_ERP_Backup_${todayBs()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('success', 'Full ERP JSON backup downloaded.');
  };

  const handleRestoreMasterJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !employee) return;
    setRestoring(true);
    setRestoreReport(null);

    try {
      const raw = await file.text();
      const data = JSON.parse(raw) as {
        settings?: typeof settings;
        stores?: Store[];
        products?: Product[];
        customers?: Customer[];
        suppliers?: Supplier[];
      };

      let restoredStores = 0;
      let restoredProducts = 0;
      let restoredCustomers = 0;
      let restoredSuppliers = 0;

      if (data.settings && data.settings.businessName) {
        await saveBusinessSettings(employee, {
          businessName: data.settings.businessName,
          businessNameNe: data.settings.businessNameNe,
          panVatNo: data.settings.panVatNo,
          taxMode: data.settings.taxMode || 'vat_13',
          defaultVatRate: Number(data.settings.defaultVatRate ?? 13),
          smallRetailThreshold: Number(data.settings.smallRetailThreshold ?? 500),
          allowAnonymousRetail: Boolean(data.settings.allowAnonymousRetail ?? true),
          fiscalYearStartMonth: Number(data.settings.fiscalYearStartMonth ?? 4),
        });
      }

      if (Array.isArray(data.stores)) {
        for (const s of data.stores) {
          const exists = stores.find((cur) => cur.id === s.id || cur.code === s.code);
          await saveStore(employee, {
            id: exists?.id,
            code: s.code,
            name: s.name,
            nameNe: s.nameNe,
            address: s.address,
            phone: s.phone,
            panVatNo: s.panVatNo,
            taxMode: s.taxMode,
            active: s.active,
          });
          restoredStores++;
        }
      }

      const workingProducts = [...products];
      if (Array.isArray(data.products)) {
        for (const p of data.products) {
          const exists = workingProducts.find((cur) => cur.itemCode === p.itemCode);
          const id = await saveProduct(employee, workingProducts, {
            id: exists?.id,
            itemCode: p.itemCode,
            barcode: p.barcode,
            name: p.name,
            nameNe: p.nameNe,
            category: p.category,
            subcategory: p.subcategory,
            brand: p.brand,
            baseUnit: p.baseUnit,
            purchasePrice: p.purchasePrice,
            sellingPrice: p.sellingPrice,
            wholesalePrice: p.wholesalePrice,
            taxType: p.taxType,
            minStock: p.minStock,
            maxStock: p.maxStock,
            defaultSupplierId: p.defaultSupplierId,
            tracksExpiry: p.tracksExpiry,
            defaultExpiryDateBs: p.defaultExpiryDateBs,
            status: p.status,
          });
          if (!exists) {
            workingProducts.push({ ...p, id });
          }
          restoredProducts++;
        }
      }

      if (Array.isArray(data.customers)) {
        for (const c of data.customers) {
          const exists = customers.find((cur) => cur.customerCode === c.customerCode);
          await saveCustomer(employee, {
            id: exists?.id,
            customerCode: c.customerCode,
            name: c.name,
            mobile: c.mobile,
            address: c.address,
            customerType: c.customerType,
            creditLimit: c.creditLimit,
            defaultDueDays: c.defaultDueDays,
            storeId: c.storeId,
            active: c.active,
          });
          restoredCustomers++;
        }
      }

      if (Array.isArray(data.suppliers)) {
        for (const sup of data.suppliers) {
          const exists = suppliers.find((cur) => cur.name.toLowerCase() === sup.name.toLowerCase());
          await saveSupplier(employee, {
            id: exists?.id,
            name: sup.name,
            contactPerson: sup.contactPerson,
            phone: sup.phone,
            address: sup.address,
            panVatNo: sup.panVatNo,
            paymentTerms: sup.paymentTerms,
            active: sup.active,
          });
          restoredSuppliers++;
        }
      }

      const msg = `Restored ${restoredStores} stores, ${restoredProducts} products, ${restoredCustomers} customers, ${restoredSuppliers} suppliers. Immutable ledgers were preserved safely.`;
      setRestoreReport(msg);
      notify('success', 'Master data restore completed.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Invalid backup JSON file.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <form
        onSubmit={handleSaveSettings}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
      >
        <div>
          <h2 className="text-base font-semibold">Business, Tax &amp; Billing Rules</h2>
          <p className="text-slate-500">
            Configure Nepal IRD VAT/PAN mode, retail customer registration threshold, and BS fiscal year start.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="space-y-1 block">
            <span className="text-slate-600 dark:text-slate-400">Business Name (English) *</span>
            <input
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-slate-600 dark:text-slate-400">Business Name (नेपाली)</span>
            <input
              value={businessNameNe}
              onChange={(e) => setBusinessNameNe(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-slate-600 dark:text-slate-400">Central PAN / VAT Number</span>
            <input
              value={panVatNo}
              onChange={(e) => setPanVatNo(e.target.value)}
              placeholder="600XXXXXX"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-slate-600 dark:text-slate-400">Default Tax Mode</span>
            <select
              value={taxMode}
              onChange={(e) => setTaxMode(e.target.value as TaxMode)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="vat_13">13% VAT + Exempt Staples</option>
              <option value="pan_only">PAN-Only (No VAT)</option>
            </select>
          </label>
          <label className="space-y-1 block">
            <span className="text-slate-600 dark:text-slate-400">Default VAT Rate (%)</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="30"
              value={defaultVatRate}
              onChange={(e) => setDefaultVatRate(Number(e.target.value))}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-slate-600 dark:text-slate-400">Small Retail Threshold (NPR)</span>
            <input
              type="number"
              min="0"
              value={smallRetailThreshold}
              onChange={(e) => setSmallRetailThreshold(Number(e.target.value))}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-slate-600 dark:text-slate-400">BS Fiscal Year Start Month</span>
            <select
              value={fiscalYearStartMonth}
              onChange={(e) => setFiscalYearStartMonth(Number(e.target.value))}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value={4}>04 — Shrawan (Nepal Fiscal Standard)</option>
              <option value={1}>01 — Baishakh (Calendar Year)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 md:col-span-2 pt-5">
            <input
              type="checkbox"
              checked={allowAnonymousRetail}
              onChange={(e) => setAllowAnonymousRetail(e.target.checked)}
            />
            <span>Allow cashiers to explicitly authorize anonymous bills above threshold</span>
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {busy ? 'Saving...' : 'Save Business Settings'}
          </button>
        </div>
      </form>

      {/* Offline Queue & Connectivity */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="w-4 h-4 text-emerald-600" />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-600" />
            )}
            <div>
              <div className="text-sm font-semibold">
                Network &amp; Offline POS Queue ({isOnline ? 'Online' : 'Offline'})
              </div>
              <div className="text-slate-500">
                Sales confirmed while offline are queued locally with idempotency keys and auto-sync when reconnected.
              </div>
            </div>
          </div>
          <button
            onClick={syncOfflineSales}
            disabled={!isOnline || offlineQueue.length === 0}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Queued ({offlineQueue.length})
          </button>
        </div>
        {offlineQueue.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-1.5">
            {offlineQueue.map((item) => (
              <div
                key={item.clientRequestId}
                className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
              >
                <span className="font-mono">
                  {item.clientRequestId} · {item.payload.bsDate} · {item.payload.cartItems.length} item(s)
                </span>
                <span className="font-mono">{item.createdAtIso.slice(0, 19).replace('T', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Backup & Recovery */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
        <div>
          <h3 className="text-sm font-semibold">ERP Backup &amp; Master Data Recovery</h3>
          <p className="text-slate-500">
            Download a complete JSON snapshot of all 18 modules and ledgers, or safely restore master records (settings, stores, products, customers, suppliers).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportBackup}
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download Full JSON Backup
          </button>

          <label className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
            <Upload className="w-3.5 h-3.5" />
            <span>{restoring ? 'Restoring Master Data...' : 'Restore Master Data (.json)'}</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleRestoreMasterJson}
              disabled={restoring}
              className="hidden"
            />
          </label>
        </div>
        {restoreReport && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
            {restoreReport}
          </div>
        )}
      </div>
    </div>
  );
}
