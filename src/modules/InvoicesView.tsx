import { useMemo, useState } from 'react';
import {
  Search,
  Printer,
  Plus,
  Trash2,
  FileCheck2,
  X,
  ListChecks,
  FileText,
  FileSpreadsheet,
  FileDown,
  Gift,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { formatNPR, todayBs } from '../lib/bsDate';
import { CHANNEL_LABELS, PAYMENT_LABELS, UNIT_LABELS } from '../lib/i18n';
import { exportReportPdf, exportToCsv, exportToExcel } from '../lib/exportUtils';
import { expandComboOfferLines, generateCustomerInvoice } from '../lib/erpService';
import { InvoiceModal } from '../components/InvoiceModal';
import type {
  BaseUnit,
  PaymentAllocationMethod,
  SalesChannel,
  SalesInvoice,
  TaxType,
} from '../types/erp';

interface InvoiceDraftRow {
  rowKey: string;
  itemCode: string;
  productName: string;
  qty: number;
  unit: BaseUnit;
  rate: number;
  discount: number;
  taxType: TaxType;
}

const ALL_UNITS: BaseUnit[] = ['pcs', 'pkt', 'box', 'carton', 'kg', 'g', 'l', 'ml'];

function makeEmptyRow(): InvoiceDraftRow {
  return {
    rowKey: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    itemCode: '',
    productName: '',
    qty: 1,
    unit: 'pcs',
    rate: 0,
    discount: 0,
    taxType: 'exempt',
  };
}

export function InvoicesView() {
  const {
    salesInvoices,
    stores,
    products,
    stockBatches,
    customers,
    comboOffers,
    settings,
    selectedStoreId,
    bsStart,
    bsEnd,
    employee,
    notify,
    language,
  } = useApp();

  const [queryText, setQueryText] = useState('');
  const [selected, setSelected] = useState<SalesInvoice | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [recordTab, setRecordTab] = useState<'invoices' | 'sold_items'>('sold_items');
  const [useDateRange, setUseDateRange] = useState(false);
  const [onlyConfirmed, setOnlyConfirmed] = useState(true);

  // Invoice Generator state
  const [storeId, setStoreId] = useState(
    selectedStoreId !== 'all' ? selectedStoreId : stores[0]?.id || ''
  );
  const [bsDate, setBsDate] = useState(todayBs());
  const [channel, setChannel] = useState<SalesChannel>('walk_in');
  const [customerId, setCustomerId] = useState('');
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualCustomerMobile, setManualCustomerMobile] = useState('');
  const [rows, setRows] = useState<InvoiceDraftRow[]>([makeEmptyRow()]);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [applyVat, setApplyVat] = useState(settings.taxMode === 'vat_13');
  const [paymentMethod, setPaymentMethod] = useState<PaymentAllocationMethod>('cash');
  const [customPaidAmount, setCustomPaidAmount] = useState<string>('');
  const [deductStock, setDeductStock] = useState(false);
  const [selectedComboId, setSelectedComboId] = useState('');
  const [comboPacks, setComboPacks] = useState(1);
  const [busy, setBusy] = useState(false);

  const activeStore = stores.find((s) => s.id === (storeId || stores[0]?.id));
  const activeCustomer = customers.find((c) => c.id === customerId);
  const canCreate =
    employee?.role === 'owner' ||
    employee?.role === 'store_manager' ||
    employee?.role === 'cashier';

  const stockMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!activeStore) return map;
    for (const b of stockBatches) {
      if (b.storeId === activeStore.id) {
        map[b.productId] = (map[b.productId] || 0) + b.qtyRemaining;
      }
    }
    return map;
  }, [stockBatches, activeStore]);

  const productByCode = useMemo(() => {
    const map = new Map<string, (typeof products)[number]>();
    for (const p of products) {
      map.set(p.itemCode.toUpperCase(), p);
    }
    return map;
  }, [products]);

  const handleItemCodeChange = (rowKey: string, rawCode: string) => {
    const upper = rawCode.toUpperCase();
    const matched = productByCode.get(upper.trim());
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowKey !== rowKey) return r;
        if (matched) {
          return {
            ...r,
            itemCode: upper,
            productName: matched.name,
            unit: matched.baseUnit,
            rate: channel === 'wholesale' ? matched.wholesalePrice : matched.sellingPrice,
            taxType: matched.taxType,
          };
        }
        return { ...r, itemCode: upper };
      })
    );
  };

  const updateRow = <K extends keyof InvoiceDraftRow>(
    rowKey: string,
    field: K,
    value: InvoiceDraftRow[K]
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, [field]: value } : r))
    );
  };

  const activeComboOffers = useMemo(() => {
    return comboOffers.filter(
      (o) => o.active && (o.storeId === 'all' || !activeStore || o.storeId === activeStore.id)
    );
  }, [comboOffers, activeStore]);

  const handleAddComboToInvoice = () => {
    const offer = activeComboOffers.find((o) => o.id === selectedComboId);
    if (!offer) return;
    const packs = Math.max(1, Math.floor(comboPacks || 1));
    const expanded = expandComboOfferLines(offer, packs, products);
    const newRows: InvoiceDraftRow[] = expanded.map((l, idx) => ({
      rowKey: `combo_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
      itemCode: l.itemCode,
      productName: l.productName,
      qty: l.qty,
      unit: l.unit,
      rate: l.unitPrice,
      discount: l.discount,
      taxType: l.taxType,
    }));
    setRows((prev) => {
      const nonEmpty = prev.filter((r) => r.itemCode.trim() !== '');
      return [...nonEmpty, ...newRows];
    });
    notify('success', `Loaded ${packs}x ${offer.name} into invoice.`);
    setSelectedComboId('');
    setComboPacks(1);
  };

  const summary = useMemo(() => {
    let subtotal = 0;
    let lineDiscounts = 0;
    let taxAmount = 0;
    let totalUnits = 0;
    const vatRate = settings.defaultVatRate || 13;

    for (const r of rows) {
      const qty = Math.max(0, Number(r.qty) || 0);
      const rate = Math.max(0, Number(r.rate) || 0);
      const disc = Math.max(0, Number(r.discount) || 0);
      const gross = qty * rate;
      const taxable = Math.max(0, gross - disc);
      const ratePct =
        applyVat && activeStore?.taxMode === 'vat_13' && r.taxType === 'vat_13'
          ? vatRate
          : 0;
      const tax = (taxable * ratePct) / 100;
      subtotal += gross;
      lineDiscounts += disc;
      taxAmount += tax;
      totalUnits += qty;
    }

    const totalDiscount = lineDiscounts + Math.max(0, Number(invoiceDiscount) || 0);
    const netTotal = Math.max(0, subtotal - totalDiscount + taxAmount);

    return {
      totalUnits: Number(totalUnits.toFixed(2)),
      subtotal: Number(subtotal.toFixed(2)),
      totalDiscount: Number(totalDiscount.toFixed(2)),
      taxAmount: Number(taxAmount.toFixed(2)),
      netTotal: Number(netTotal.toFixed(2)),
    };
  }, [rows, invoiceDiscount, applyVat, activeStore, settings.defaultVatRate]);

  const parsedPaid =
    paymentMethod === 'credit'
      ? 0
      : customPaidAmount.trim() === ''
        ? summary.netTotal
        : Math.max(0, Number(customPaidAmount) || 0);
  const balanceDue = Math.max(0, Number((summary.netTotal - parsedPaid).toFixed(2)));

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !activeStore) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bsDate.trim())) {
      notify('error', 'BS Date must be in YYYY-MM-DD format (e.g. 2083-08-03).');
      return;
    }

    const validRows = rows.filter((r) => r.itemCode.trim() !== '');
    if (validRows.length === 0) {
      notify('error', 'Enter at least one item code, unit, and rate.');
      return;
    }

    setBusy(true);
    try {
      const clientRequestId = `invgen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const created = await generateCustomerInvoice(employee, {
        clientRequestId,
        store: {
          id: activeStore.id,
          code: activeStore.code,
          taxMode: activeStore.taxMode,
        },
        bsDate: bsDate.trim(),
        channel,
        customer: activeCustomer,
        manualCustomerName: activeCustomer ? undefined : manualCustomerName,
        manualCustomerMobile: activeCustomer ? undefined : manualCustomerMobile,
        applyVat,
        vatRate: settings.defaultVatRate || 13,
        items: validRows.map((r) => {
          const matched = productByCode.get(r.itemCode.trim().toUpperCase());
          return {
            product: matched,
            itemCode: r.itemCode.trim().toUpperCase(),
            productName: r.productName.trim() || r.itemCode.trim().toUpperCase(),
            unit: r.unit,
            qty: Number(r.qty),
            unitPrice: Number(r.rate),
            discount: Number(r.discount) || 0,
            taxType: r.taxType,
          };
        }),
        invoiceDiscount: Number(invoiceDiscount) || 0,
        paymentMethod,
        amountPaidInput: customPaidAmount.trim() === '' ? undefined : parsedPaid,
        deductStock,
        allBatches: stockBatches,
      });

      notify('success', `Generated ${created.invoiceNo} · ${formatNPR(created.netTotal, language)}`);
      setSelected(created);
      setRows([makeEmptyRow()]);
      setInvoiceDiscount(0);
      setCustomPaidAmount('');
      setManualCustomerName('');
      setManualCustomerMobile('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to generate invoice.');
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return salesInvoices
      .filter((i) => {
        if (selectedStoreId !== 'all' && i.storeId !== selectedStoreId) return false;
        if (useDateRange && (i.bsDate < bsStart || i.bsDate > bsEnd)) return false;
        if (onlyConfirmed && i.status !== 'confirmed') return false;
        if (!q) return true;
        const matchesItems = i.items.some(
          (it) =>
            it.itemCode.toLowerCase().includes(q) ||
            it.productName.toLowerCase().includes(q)
        );
        return (
          i.invoiceNo.toLowerCase().includes(q) ||
          (i.customerName || '').toLowerCase().includes(q) ||
          (i.customerMobile || '').toLowerCase().includes(q) ||
          matchesItems
        );
      })
      .sort((a, b) => b.bsDate.localeCompare(a.bsDate));
  }, [salesInvoices, selectedStoreId, queryText, useDateRange, bsStart, bsEnd, onlyConfirmed]);

  const soldItemRecords = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const list: Array<{
      invoice: SalesInvoice;
      storeCode: string;
      customerLabel: string;
      itemCode: string;
      productName: string;
      qty: number;
      unit: BaseUnit;
      unitPrice: number;
      discount: number;
      taxAmount: number;
      lineTotal: number;
    }> = [];

    const sortedInvoices = [...salesInvoices].sort((a, b) =>
      b.bsDate.localeCompare(a.bsDate) || b.invoiceNo.localeCompare(a.invoiceNo)
    );

    for (const inv of sortedInvoices) {
      if (selectedStoreId !== 'all' && inv.storeId !== selectedStoreId) continue;
      if (useDateRange && (inv.bsDate < bsStart || inv.bsDate > bsEnd)) continue;
      if (onlyConfirmed && inv.status !== 'confirmed') continue;

      const storeCode = stores.find((s) => s.id === inv.storeId)?.code || inv.storeId;
      const customerLabel =
        inv.customerName ||
        (inv.customerCategory === 'small_retail' ? 'Walk-in Retail' : 'Anonymous');

      for (const it of inv.items) {
        if (q) {
          const hit =
            it.itemCode.toLowerCase().includes(q) ||
            it.productName.toLowerCase().includes(q) ||
            inv.invoiceNo.toLowerCase().includes(q) ||
            customerLabel.toLowerCase().includes(q) ||
            (inv.customerMobile || '').toLowerCase().includes(q);
          if (!hit) continue;
        }
        list.push({
          invoice: inv,
          storeCode,
          customerLabel,
          itemCode: it.itemCode,
          productName: it.productName,
          qty: it.qty,
          unit: it.unit,
          unitPrice: it.unitPrice,
          discount: it.discount,
          taxAmount: it.taxAmount,
          lineTotal: it.lineTotal,
        });
      }
    }
    return list;
  }, [salesInvoices, stores, selectedStoreId, queryText, useDateRange, bsStart, bsEnd, onlyConfirmed]);

  const soldItemsTotals = useMemo(() => {
    const confirmedRows = soldItemRecords.filter((r) => r.invoice.status === 'confirmed');
    return {
      lineCount: confirmedRows.length,
      totalQty: Number(confirmedRows.reduce((s, r) => s + r.qty, 0).toFixed(2)),
      totalValue: Number(confirmedRows.reduce((s, r) => s + r.lineTotal, 0).toFixed(2)),
    };
  }, [soldItemRecords]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search by item code, item name, invoice no, or customer..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRecordTab('sold_items')}
            className={`px-3 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
              recordTab === 'sold_items'
                ? 'bg-slate-900 text-white dark:bg-teal-700'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            All Sold Items ({soldItemRecords.length})
          </button>
          <button
            type="button"
            onClick={() => setRecordTab('invoices')}
            className={`px-3 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
              recordTab === 'invoices'
                ? 'bg-slate-900 text-white dark:bg-teal-700'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Invoices ({filtered.length})
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowBuilder((v) => !v)}
              className="px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              {showBuilder ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showBuilder ? 'Hide Invoice Builder' : 'Generate Customer Invoice'}
            </button>
          )}
        </div>
      </div>

      {canCreate && showBuilder && (
        <form
          onSubmit={handleGenerateInvoice}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold">Generate Customer Invoice</h2>
              <p className="text-slate-500">
                Enter Item Code, Units/Qty, and Rate per item — all item prices and final invoice total update live at the bottom.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={deductStock}
                onChange={(e) => setDeductStock(e.target.checked)}
              />
              <span>Deduct FIFO Store Stock (for stocked items)</span>
            </label>
          </div>

          {/* Customer & Store Header */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Store *</span>
              <select
                value={activeStore?.id || ''}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">BS Date *</span>
              <input
                required
                value={bsDate}
                onChange={(e) => setBsDate(e.target.value)}
                placeholder="YYYY-MM-DD"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Channel</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as SalesChannel)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {(Object.keys(CHANNEL_LABELS) as SalesChannel[]).map((ch) => (
                  <option key={ch} value={ch}>
                    {CHANNEL_LABELS[ch][language]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block lg:col-span-2">
              <span className="text-slate-600 dark:text-slate-400">Registered Customer (Optional)</span>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">Walk-in / Enter Customer Name Below</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customerCode} · {c.name} ({c.mobile})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!customerId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 block">
                <span className="text-slate-600 dark:text-slate-400">Customer Name (Optional)</span>
                <input
                  value={manualCustomerName}
                  onChange={(e) => setManualCustomerName(e.target.value)}
                  placeholder="e.g., Sita Devi / Walk-in Customer"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-slate-600 dark:text-slate-400">Customer Mobile (Optional)</span>
                <input
                  value={manualCustomerMobile}
                  onChange={(e) => setManualCustomerMobile(e.target.value)}
                  placeholder="98XXXXXXXX"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </label>
            </div>
          )}

          {/* Product Code Datalist */}
          <datalist id="invoice-product-codes">
            {products
              .filter((p) => p.status === 'active')
              .map((p) => (
                <option key={p.id} value={p.itemCode}>
                  {p.name} — NPR {channel === 'wholesale' ? p.wholesalePrice : p.sellingPrice}/{p.baseUnit}
                </option>
              ))}
          </datalist>

          {activeComboOffers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <div className="inline-flex items-center gap-1.5 font-medium text-teal-700 dark:text-teal-400 shrink-0">
                <Gift className="w-3.5 h-3.5" />
                <span>Load Combo / Offer Pack:</span>
              </div>
              <select
                value={selectedComboId}
                onChange={(e) => setSelectedComboId(e.target.value)}
                className="flex-1 min-w-[200px] h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">-- Pick Monthly Family / Weekend / Festival / Custom Pack --</option>
                {activeComboOffers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.offerCode} · {o.name} ({o.items.length} items) — {formatNPR(o.offerRate)}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-1 shrink-0">
                <span className="text-slate-500">Packs:</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={comboPacks}
                  onChange={(e) => setComboPacks(Math.max(1, Number(e.target.value) || 1))}
                  className="w-14 h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono"
                />
              </label>
              <button
                type="button"
                disabled={!selectedComboId}
                onClick={handleAddComboToInvoice}
                className="h-8 px-3 rounded bg-teal-700 hover:bg-teal-800 text-white font-medium disabled:opacity-50 cursor-pointer shrink-0"
              >
                Add Combo Items
              </button>
            </div>
          )}

          {/* Line Items Entry Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-36">Item Code *</th>
                  <th className="text-left px-3 py-2 font-medium min-w-[180px]">Item Name / Description</th>
                  <th className="text-right px-3 py-2 font-medium w-24">Qty *</th>
                  <th className="text-left px-3 py-2 font-medium w-24">Unit *</th>
                  <th className="text-right px-3 py-2 font-medium w-28">Rate (NPR) *</th>
                  <th className="text-right px-3 py-2 font-medium w-24">Disc</th>
                  <th className="text-right px-3 py-2 font-medium w-32">Item Price</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => {
                  const matched = productByCode.get(row.itemCode.trim().toUpperCase());
                  const itemGross = (Number(row.qty) || 0) * (Number(row.rate) || 0);
                  const itemNet = Math.max(0, itemGross - (Number(row.discount) || 0));
                  return (
                    <tr key={row.rowKey}>
                      <td className="px-3 py-2 align-top">
                        <input
                          required
                          list="invoice-product-codes"
                          value={row.itemCode}
                          onChange={(e) => handleItemCodeChange(row.rowKey, e.target.value)}
                          placeholder="RICE001"
                          className="w-full h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono uppercase"
                        />
                        {matched && (
                          <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                            Stock: {stockMap[matched.id] || 0} {matched.baseUnit}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          value={row.productName}
                          onChange={(e) => updateRow(row.rowKey, 'productName', e.target.value)}
                          placeholder="Item name (auto-fills if code matches)"
                          className="w-full h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          required
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={row.qty}
                          onChange={(e) => updateRow(row.rowKey, 'qty', Number(e.target.value))}
                          className="w-full h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <select
                          value={row.unit}
                          onChange={(e) => updateRow(row.rowKey, 'unit', e.target.value as BaseUnit)}
                          className="w-full h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          {ALL_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {UNIT_LABELS[u][language]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          required
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.rate}
                          onChange={(e) => updateRow(row.rowKey, 'rate', Number(e.target.value))}
                          className="w-full h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.discount}
                          onChange={(e) => updateRow(row.rowKey, 'discount', Number(e.target.value))}
                          className="w-full h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono tabular-nums font-semibold pt-3">
                        {formatNPR(itemNet, language)}
                      </td>
                      <td className="px-2 py-2 align-top pt-3 text-right">
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setRows((prev) => prev.filter((r) => r.rowKey !== row.rowKey))}
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                            aria-label="Remove item row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, makeEmptyRow()])}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Item Row
            </button>

            <div className="text-slate-500 font-mono tabular-nums">
              {rows.filter((r) => r.itemCode.trim()).length} item(s) · {summary.totalUnits} total units
            </div>
          </div>

          {/* Bottom Coming All Items Price & Payment Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 self-start">
              <label className="space-y-1 block">
                <span className="text-slate-600 dark:text-slate-400">Payment Method</span>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as PaymentAllocationMethod)
                  }
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  {(['cash', 'qr', 'bank_transfer', 'mobile_wallet', 'credit'] as const).map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_LABELS[m][language]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 block">
                <span className="text-slate-600 dark:text-slate-400">
                  Amount Paid (blank = Full Total)
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={paymentMethod === 'credit'}
                  value={paymentMethod === 'credit' ? '0' : customPaidAmount}
                  onChange={(e) => setCustomPaidAmount(e.target.value)}
                  placeholder={summary.netTotal.toFixed(2)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-right disabled:opacity-60"
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-slate-600 dark:text-slate-400">Extra Invoice Discount (NPR)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={invoiceDiscount}
                  onChange={(e) => setInvoiceDiscount(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-right"
                />
              </label>

              <label className="flex items-center gap-2 pt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyVat}
                  onChange={(e) => setApplyVat(e.target.checked)}
                />
                <span>Apply Store VAT ({settings.defaultVatRate || 13}% on VAT items)</span>
              </label>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">All Items Subtotal</span>
                <span className="font-mono tabular-nums">{formatNPR(summary.subtotal, language)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Total Discount</span>
                <span className="font-mono tabular-nums">{formatNPR(summary.totalDiscount, language)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">VAT / Tax</span>
                <span className="font-mono tabular-nums">{formatNPR(summary.taxAmount, language)}</span>
              </div>
              <div className="flex justify-between items-center text-base font-bold border-t border-slate-200 dark:border-slate-700 pt-2">
                <span>All Items Total Price</span>
                <span className="font-mono tabular-nums text-teal-700 dark:text-teal-400">
                  {formatNPR(summary.netTotal, language)}
                </span>
              </div>
              {balanceDue > 0 && (
                <div className="flex justify-between text-amber-700 dark:text-amber-400 font-medium">
                  <span>Credit / Balance Due</span>
                  <span className="font-mono tabular-nums">{formatNPR(balanceDue, language)}</span>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <FileCheck2 className="w-4 h-4" />
                  {busy ? 'Generating Invoice...' : 'Generate & Print Customer Invoice'}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {recordTab === 'sold_items' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold">All Sold Items — Invoice Line Records</div>
              <div className="font-mono text-slate-500 tabular-nums">
                {soldItemsTotals.lineCount} sold item line(s) · {soldItemsTotals.totalQty} units · Total:{' '}
                <span className="text-slate-900 dark:text-slate-100 font-semibold">
                  {formatNPR(soldItemsTotals.totalValue, language)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useDateRange}
                  onChange={(e) => setUseDateRange(e.target.checked)}
                />
                <span>BS Range ({bsStart} – {bsEnd})</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyConfirmed}
                  onChange={(e) => setOnlyConfirmed(e.target.checked)}
                />
                <span>Confirmed Only</span>
              </label>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    exportToExcel(
                      'All_Sold_Items_Invoices',
                      'Sold Items',
                      ['BS Date', 'Invoice No', 'Store', 'Customer', 'Item Code', 'Item Name', 'Qty', 'Unit', 'Rate', 'Discount', 'Tax', 'Item Total', 'Status'],
                      soldItemRecords.map((r) => [
                        r.invoice.bsDate,
                        r.invoice.invoiceNo,
                        r.storeCode,
                        r.customerLabel,
                        r.itemCode,
                        r.productName,
                        r.qty,
                        r.unit,
                        r.unitPrice.toFixed(2),
                        r.discount.toFixed(2),
                        r.taxAmount.toFixed(2),
                        r.lineTotal.toFixed(2),
                        r.invoice.status,
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
                    exportReportPdf(
                      'All_Sold_Items_Invoices',
                      'All Sold Items Invoice Register',
                      `${soldItemRecords.length} sold item record(s)`,
                      ['BS Date', 'Invoice No', 'Customer', 'Item Code', 'Item Name', 'Qty', 'Unit', 'Rate', 'Total'],
                      soldItemRecords.map((r) => [
                        r.invoice.bsDate,
                        r.invoice.invoiceNo,
                        r.customerLabel,
                        r.itemCode,
                        r.productName,
                        r.qty,
                        r.unit,
                        r.unitPrice.toFixed(2),
                        r.lineTotal.toFixed(2),
                      ])
                    )
                  }
                  className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5 text-red-600" /> PDF
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportToCsv(
                      'All_Sold_Items_Invoices',
                      ['BS Date', 'Invoice No', 'Store', 'Customer', 'Item Code', 'Item Name', 'Qty', 'Unit', 'Rate', 'Discount', 'Tax', 'Item Total', 'Status'],
                      soldItemRecords.map((r) => [
                        r.invoice.bsDate,
                        r.invoice.invoiceNo,
                        r.storeCode,
                        r.customerLabel,
                        r.itemCode,
                        r.productName,
                        r.qty,
                        r.unit,
                        r.unitPrice.toFixed(2),
                        r.discount.toFixed(2),
                        r.taxAmount.toFixed(2),
                        r.lineTotal.toFixed(2),
                        r.invoice.status,
                      ])
                    )
                  }
                  className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" /> CSV
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">BS Date</th>
                  <th className="text-left px-4 py-2.5 font-medium">Invoice No</th>
                  <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                  <th className="text-left px-4 py-2.5 font-medium">Item Code</th>
                  <th className="text-left px-4 py-2.5 font-medium">Item Name</th>
                  <th className="text-right px-4 py-2.5 font-medium">Qty / Unit</th>
                  <th className="text-right px-4 py-2.5 font-medium">Rate</th>
                  <th className="text-right px-4 py-2.5 font-medium">Disc</th>
                  <th className="text-right px-4 py-2.5 font-medium">Tax</th>
                  <th className="text-right px-4 py-2.5 font-medium">Item Total</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {soldItemRecords.map((rec, idx) => (
                  <tr key={`${rec.invoice.id}_${rec.itemCode}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2 font-mono whitespace-nowrap">{rec.invoice.bsDate}</td>
                    <td className="px-4 py-2 font-mono whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelected(rec.invoice)}
                        className="text-teal-700 dark:text-teal-400 font-semibold hover:underline cursor-pointer"
                      >
                        {rec.invoice.invoiceNo}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <div>{rec.customerLabel}</div>
                      {rec.invoice.customerMobile && (
                        <div className="font-mono text-[11px] text-slate-500">{rec.invoice.customerMobile}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono font-medium">{rec.itemCode}</td>
                    <td className="px-4 py-2">{rec.productName}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                      {rec.qty} {rec.unit}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {rec.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {rec.discount.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {rec.taxAmount.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">
                      {formatNPR(rec.lineTotal, language)}
                    </td>
                    <td className="px-4 py-2 capitalize">
                      <span className={rec.invoice.status === 'confirmed' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}>
                        {rec.invoice.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {soldItemRecords.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                      No sold item records match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Invoice No</th>
                  <th className="text-left px-4 py-2.5 font-medium">BS Date</th>
                  <th className="text-left px-4 py-2.5 font-medium">Store</th>
                  <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                  <th className="text-left px-4 py-2.5 font-medium">Sold Items</th>
                  <th className="text-left px-4 py-2.5 font-medium">Channel · Payment</th>
                  <th className="text-right px-4 py-2.5 font-medium">Net Total</th>
                  <th className="text-right px-4 py-2.5 font-medium">Paid</th>
                  <th className="text-right px-4 py-2.5 font-medium">Balance</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium">Print / PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((inv) => {
                  const st = stores.find((s) => s.id === inv.storeId);
                  return (
                    <tr key={inv.id}>
                      <td className="px-4 py-2.5 font-mono font-semibold">{inv.invoiceNo}</td>
                      <td className="px-4 py-2.5 font-mono">{inv.bsDate}</td>
                      <td className="px-4 py-2.5">{st?.code || inv.storeId}</td>
                      <td className="px-4 py-2.5">{inv.customerName || inv.customerCategory}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                        {inv.items.length} item(s):{' '}
                        <span className="font-mono text-[11px]">
                          {inv.items.map((it) => `${it.itemCode}(${it.qty}${it.unit})`).join(', ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {CHANNEL_LABELS[inv.channel]?.[language]} · {PAYMENT_LABELS[inv.primaryPaymentMethod]?.[language]}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                        {formatNPR(inv.netTotal, language)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                        {formatNPR(inv.amountPaid, language)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-700">
                        {formatNPR(inv.creditAmount, language)}
                      </td>
                      <td className="px-4 py-2.5 capitalize">{inv.status}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => setSelected(inv)}
                          className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Open / Reprint
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                      No invoices found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && <InvoiceModal invoice={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
