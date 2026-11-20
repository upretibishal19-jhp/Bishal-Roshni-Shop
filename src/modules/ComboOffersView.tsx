import { useMemo, useState } from 'react';
import {
  FileDown,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { formatNPR, todayBs } from '../lib/bsDate';
import { saveComboOffer, toggleComboOfferStatus } from '../lib/erpService';
import { exportComboOfferPdf, exportToCsv, exportToExcel } from '../lib/exportUtils';
import { COMBO_OFFER_TYPE_LABELS, UNIT_LABELS } from '../lib/i18n';
import type { ComboOffer, ComboOfferItem, ComboOfferType } from '../types/erp';

const OFFER_TYPES: ComboOfferType[] = [
  'monthly_family',
  'weekend',
  'festival',
  'custom_offer',
];

export function ComboOffersView() {
  const {
    comboOffers,
    products,
    stores,
    stockBatches,
    selectedStoreId,
    settings,
    employee,
    notify,
    loadComboIntoPos,
    language,
  } = useApp();

  const canManage =
    employee?.role === 'owner' ||
    employee?.role === 'store_manager' ||
    employee?.role === 'inventory_controller';
  const canSeeCost = Boolean(
    employee?.role === 'owner' || employee?.permissions.canViewPurchasePrice
  );

  const [typeFilter, setTypeFilter] = useState<'all' | ComboOfferType>('all');
  const [searchText, setSearchText] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Builder form state
  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ComboOffer | null>(null);
  const [offerCode, setOfferCode] = useState('');
  const [name, setName] = useState('');
  const [nameNe, setNameNe] = useState('');
  const [offerType, setOfferType] = useState<ComboOfferType>('monthly_family');
  const [campaignTag, setCampaignTag] = useState('');
  const [storeId, setStoreId] = useState(
    selectedStoreId !== 'all' ? selectedStoreId : 'all'
  );
  const [validFromBs, setValidFromBs] = useState('');
  const [validToBs, setValidToBs] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [bundleItems, setBundleItems] = useState<ComboOfferItem[]>([]);
  const [offerRate, setOfferRate] = useState<number>(0);

  // Quick product picker inside builder
  const [pickerQuery, setPickerQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const resetForm = () => {
    setEditingOffer(null);
    setOfferCode('');
    setName('');
    setNameNe('');
    setOfferType('monthly_family');
    setCampaignTag('');
    setStoreId(selectedStoreId !== 'all' ? selectedStoreId : 'all');
    setValidFromBs('');
    setValidToBs('');
    setNotes('');
    setActive(true);
    setBundleItems([]);
    setOfferRate(0);
    setPickerQuery('');
  };

  const openNewOffer = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditOffer = (offer: ComboOffer) => {
    setEditingOffer(offer);
    setOfferCode(offer.offerCode);
    setName(offer.name);
    setNameNe(offer.nameNe || '');
    setOfferType(offer.offerType);
    setCampaignTag(offer.campaignTag || '');
    setStoreId(offer.storeId);
    setValidFromBs(offer.validFromBs || '');
    setValidToBs(offer.validToBs || '');
    setNotes(offer.notes || '');
    setActive(offer.active);
    setBundleItems(offer.items.map((it) => ({ ...it })));
    setOfferRate(offer.offerRate);
    setPickerQuery('');
    setShowForm(true);
  };

  const stockByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of stockBatches) {
      if (storeId === 'all' || b.storeId === storeId) {
        map[b.productId] = (map[b.productId] || 0) + b.qtyRemaining;
      }
    }
    return map;
  }, [stockBatches, storeId]);

  const pickerMatches = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.status === 'active' &&
          (p.itemCode.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            (p.barcode || '').toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [products, pickerQuery]);

  const addProductToBundle = (p: (typeof products)[number]) => {
    setBundleItems((prev) => {
      const exists = prev.find((it) => it.productId === p.id);
      if (exists) {
        return prev.map((it) =>
          it.productId === p.id ? { ...it, fixedQty: Number((it.fixedQty + 1).toFixed(2)) } : it
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          itemCode: p.itemCode,
          productName: p.name,
          unit: p.baseUnit,
          fixedQty: 1,
          regularUnitPrice: p.sellingPrice,
        },
      ];
    });
    setPickerQuery('');
  };

  const builderSummary = useMemo(() => {
    const regularTotal = Number(
      bundleItems
        .reduce((sum, it) => sum + it.fixedQty * it.regularUnitPrice, 0)
        .toFixed(2)
    );
    const totalCost = Number(
      bundleItems
        .reduce((sum, it) => {
          const prod = products.find((p) => p.id === it.productId);
          return sum + it.fixedQty * (prod?.purchasePrice || 0);
        }, 0)
        .toFixed(2)
    );
    const savings = Number((regularTotal - offerRate).toFixed(2));
    const savingsPct = regularTotal > 0 ? Number(((savings / regularTotal) * 100).toFixed(1)) : 0;
    const estProfit = Number((offerRate - totalCost).toFixed(2));
    return { regularTotal, totalCost, savings, savingsPct, estProfit };
  }, [bundleItems, offerRate, products]);

  const handleSaveOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setBusy(true);
    try {
      await saveComboOffer(employee, comboOffers, {
        id: editingOffer?.id,
        offerCode,
        name,
        nameNe,
        offerType,
        campaignTag,
        storeId,
        items: bundleItems,
        offerRate,
        validFromBs,
        validToBs,
        active,
        notes,
      });
      notify(
        'success',
        editingOffer
          ? `Updated combo offer ${offerCode.toUpperCase()}.`
          : `Created combo offer ${offerCode.toUpperCase()}.`
      );
      setShowForm(false);
      resetForm();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save combo offer.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async (offer: ComboOffer) => {
    if (!employee) return;
    setBusy(true);
    try {
      await toggleComboOfferStatus(employee, offer);
      notify(
        'success',
        `${offer.offerCode} ${offer.active ? 'deactivated' : 'activated'}.`
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update offer status.');
    } finally {
      setBusy(false);
    }
  };

  const currentBs = todayBs();

  const filteredOffers = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return comboOffers
      .filter((o) => {
        if (!showInactive && !o.active) return false;
        if (typeFilter !== 'all' && o.offerType !== typeFilter) return false;
        if (
          selectedStoreId !== 'all' &&
          o.storeId !== 'all' &&
          o.storeId !== selectedStoreId
        ) {
          return false;
        }
        if (!q) return true;
        const itemHit = o.items.some(
          (it) =>
            it.itemCode.toLowerCase().includes(q) ||
            it.productName.toLowerCase().includes(q)
        );
        return (
          o.offerCode.toLowerCase().includes(q) ||
          o.name.toLowerCase().includes(q) ||
          (o.nameNe || '').toLowerCase().includes(q) ||
          (o.campaignTag || '').toLowerCase().includes(q) ||
          itemHit
        );
      })
      .sort((a, b) => a.offerCode.localeCompare(b.offerCode));
  }, [comboOffers, showInactive, typeFilter, selectedStoreId, searchText]);

  const kpis = useMemo(() => {
    const activeOffers = comboOffers.filter((o) => o.active);
    const familyCount = activeOffers.filter((o) => o.offerType === 'monthly_family').length;
    const weekendOrCustom = activeOffers.filter(
      (o) => o.offerType === 'weekend' || o.offerType === 'custom_offer'
    ).length;
    const festivalCount = activeOffers.filter((o) => o.offerType === 'festival').length;
    const avgSavingsPct =
      activeOffers.length > 0
        ? activeOffers.reduce(
            (sum, o) =>
              sum + (o.regularTotal > 0 ? (o.savingsAmount / o.regularTotal) * 100 : 0),
            0
          ) / activeOffers.length
        : 0;
    return {
      totalActive: activeOffers.length,
      familyCount,
      weekendOrCustom,
      festivalCount,
      avgSavingsPct: Number(avgSavingsPct.toFixed(1)),
    };
  }, [comboOffers]);

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Active Combo Packs</div>
          <div className="text-xl font-bold font-mono tabular-nums mt-1">
            {kpis.totalActive}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Ready to bill anytime in POS &amp; Invoices
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Monthly Family Stock Packs</div>
          <div className="text-xl font-bold font-mono tabular-nums mt-1">
            {kpis.familyCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Home ration &amp; household bundles
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Weekend, Festival &amp; On-Demand</div>
          <div className="text-xl font-bold font-mono tabular-nums mt-1">
            {kpis.weekendOrCustom} / {kpis.festivalCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Weekend &amp; custom / Festival offers
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Average Customer Savings</div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
            {kpis.avgSavingsPct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Discount below regular shelf total
          </div>
        </div>
      </div>

      {/* Controls & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[230px] flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search offer code, name, occasion, or item..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1.5 rounded-md font-medium whitespace-nowrap cursor-pointer ${
                typeFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              All
            </button>
            {OFFER_TYPES.map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => setTypeFilter(tp)}
                className={`px-2.5 py-1.5 rounded-md font-medium whitespace-nowrap cursor-pointer ${
                  typeFilter === tp
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {COMBO_OFFER_TYPE_LABELS[tp][language]}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            <span>Show Inactive</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() =>
              exportToExcel(
                'Combo_Special_Offers',
                'Combo Offers',
                [
                  'Offer Code',
                  'Offer Name',
                  'Type',
                  'Occasion / Tag',
                  'Store',
                  'Included Items (Fixed Qty)',
                  'Regular Total',
                  'Offer Rate',
                  'Savings',
                  'Valid From BS',
                  'Valid To BS',
                  'Status',
                ],
                filteredOffers.map((o) => [
                  o.offerCode,
                  o.name,
                  COMBO_OFFER_TYPE_LABELS[o.offerType]?.en || o.offerType,
                  o.campaignTag || '',
                  o.storeId === 'all'
                    ? 'All Stores'
                    : stores.find((s) => s.id === o.storeId)?.code || o.storeId,
                  o.items.map((it) => `${it.fixedQty} ${it.unit} ${it.productName}`).join(', '),
                  o.regularTotal.toFixed(2),
                  o.offerRate.toFixed(2),
                  o.savingsAmount.toFixed(2),
                  o.validFromBs || 'Anytime',
                  o.validToBs || 'Anytime',
                  o.active ? 'active' : 'inactive',
                ])
              )
            }
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" /> Excel
          </button>
          <button
            type="button"
            onClick={() =>
              exportToCsv(
                'Combo_Special_Offers',
                [
                  'Offer Code',
                  'Offer Name',
                  'Type',
                  'Occasion',
                  'Items',
                  'Regular Total',
                  'Offer Rate',
                  'Savings',
                  'Active',
                ],
                filteredOffers.map((o) => [
                  o.offerCode,
                  o.name,
                  o.offerType,
                  o.campaignTag || '',
                  o.items.map((it) => `${it.fixedQty}${it.unit} ${it.itemCode}`).join(' + '),
                  o.regularTotal.toFixed(2),
                  o.offerRate.toFixed(2),
                  o.savingsAmount.toFixed(2),
                  o.active ? 'Yes' : 'No',
                ])
              )
            }
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" /> CSV
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => (showForm ? setShowForm(false) : openNewOffer())}
              className="h-9 px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showForm ? 'Close Builder' : 'Create Combo Offer'}
            </button>
          )}
        </div>
      </div>

      {/* Create / Edit Combo Offer Form */}
      {canManage && showForm && (
        <form
          onSubmit={handleSaveOffer}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold">
                {editingOffer
                  ? `Edit Combo Offer · ${editingOffer.offerCode}`
                  : 'Create Special Combo Offer Pack'}
              </h2>
              <p className="text-slate-500">
                Combine multiple grocery items with fixed quantities and set a single special rate for families, weekends, festivals, or whenever needed.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <span>Offer Active</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Offer Code *</span>
              <input
                required
                disabled={Boolean(editingOffer)}
                value={offerCode}
                onChange={(e) => setOfferCode(e.target.value.toUpperCase())}
                placeholder="FAM-MONTH-01"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono uppercase disabled:opacity-60"
              />
            </label>

            <label className="space-y-1 block lg:col-span-2">
              <span className="text-slate-600 dark:text-slate-400">Combo Offer Name (English) *</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Monthly Family Home Stock Pack / Weekend Mega Combo"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Nepali Name (नेपाली)</span>
              <input
                value={nameNe}
                onChange={(e) => setNameNe(e.target.value)}
                placeholder="मासिक घरायसी प्याक"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Offer Type *</span>
              <select
                value={offerType}
                onChange={(e) => setOfferType(e.target.value as ComboOfferType)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {OFFER_TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {COMBO_OFFER_TYPE_LABELS[tp][language]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Occasion / Tag (Optional)</span>
              <input
                value={campaignTag}
                onChange={(e) => setCampaignTag(e.target.value)}
                placeholder="Weekend Special / Dashain / Home Stock"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-slate-600 dark:text-slate-400">Store Scope *</span>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="all">All Stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 block">
                <span className="text-slate-600 dark:text-slate-400">Valid From (BS)</span>
                <input
                  value={validFromBs}
                  onChange={(e) => setValidFromBs(e.target.value)}
                  placeholder="Optional"
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-slate-600 dark:text-slate-400">Valid To (BS)</span>
                <input
                  value={validToBs}
                  onChange={(e) => setValidToBs(e.target.value)}
                  placeholder="Optional"
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </label>
            </div>
          </div>

          {/* Product Picker */}
          <div className="space-y-2">
            <div className="font-semibold text-slate-700 dark:text-slate-300">
              Add Items &amp; Fixed Quantities Included in This Pack
            </div>
            <div className="relative">
              <input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search item code, barcode, or product name to add to combo pack..."
                className="w-full h-9 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              {pickerMatches.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {pickerMatches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProductToBundle(p)}
                      className="w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <div>
                        <span className="font-mono font-semibold">{p.itemCode}</span> · {p.name}
                      </div>
                      <div className="font-mono tabular-nums text-slate-500">
                        Stock: {stockByProduct[p.id] || 0} {p.baseUnit} · {formatNPR(p.sellingPrice)}/{p.baseUnit}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Item Code</th>
                    <th className="text-left px-3 py-2 font-medium">Product Name</th>
                    <th className="text-right px-3 py-2 font-medium">Fixed Qty *</th>
                    <th className="text-left px-3 py-2 font-medium">Unit</th>
                    <th className="text-right px-3 py-2 font-medium">Regular Rate</th>
                    <th className="text-right px-3 py-2 font-medium">Regular Value</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {bundleItems.map((it, idx) => (
                    <tr key={it.productId}>
                      <td className="px-3 py-2 font-mono font-semibold">{it.itemCode}</td>
                      <td className="px-3 py-2">{it.productName}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          required
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={it.fixedQty}
                          onChange={(e) =>
                            setBundleItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, fixedQty: Number(e.target.value) } : row
                              )
                            )
                          }
                          className="w-20 h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2">{UNIT_LABELS[it.unit]?.[language] || it.unit}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatNPR(it.regularUnitPrice, language)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-medium">
                        {formatNPR(it.fixedQty * it.regularUnitPrice, language)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setBundleItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-red-600 cursor-pointer"
                          aria-label="Remove item from bundle"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {bundleItems.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                        Search products above to add items with fixed quantities to this combo pack.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pricing, Savings & Margin Check */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="space-y-3">
              <label className="space-y-1 block">
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  Special Fixed Combo Rate (NPR) *
                </span>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={offerRate}
                  onChange={(e) => setOfferRate(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-bold font-mono text-right"
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-slate-600 dark:text-slate-400">Offer Notes / Details</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Ideal 1-month kitchen stock for family of 4; free local delivery..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </label>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Regular Retail Total ({bundleItems.length} items)</span>
                <span className="font-mono tabular-nums">
                  {formatNPR(builderSummary.regularTotal, language)}
                </span>
              </div>
              <div className="flex justify-between font-semibold text-base">
                <span>Special Combo Rate</span>
                <span className="font-mono tabular-nums text-teal-700 dark:text-teal-400">
                  {formatNPR(offerRate, language)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer Savings</span>
                <span
                  className={`font-mono tabular-nums font-medium ${
                    builderSummary.savings >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'
                  }`}
                >
                  {formatNPR(builderSummary.savings, language)} ({builderSummary.savingsPct}%)
                </span>
              </div>
              {canSeeCost && (
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                  <span className="text-slate-500">
                    Est. Purchase Cost: {formatNPR(builderSummary.totalCost, language)}
                  </span>
                  <span
                    className={`font-mono tabular-nums font-medium ${
                      builderSummary.estProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    Est. Profit: {formatNPR(builderSummary.estProfit, language)}
                  </span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || bundleItems.length === 0}
                  className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-medium disabled:opacity-50 cursor-pointer"
                >
                  {busy ? 'Saving...' : editingOffer ? 'Update Combo Offer' : 'Save Combo Offer'}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Combo Offers Register Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">
              Combo Packs &amp; Special Offers Register ({filteredOffers.length})
            </h3>
            <p className="text-xs text-slate-500">
              Family monthly stock packs, weekend deals, festival specials, and custom offers with fixed item quantities &amp; bundle rates.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Offer Code &amp; Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Type &amp; Scope</th>
                <th className="text-left px-4 py-2.5 font-medium">Included Items (Fixed Qty)</th>
                <th className="text-right px-4 py-2.5 font-medium">Regular Total</th>
                <th className="text-right px-4 py-2.5 font-medium">Combo Rate</th>
                <th className="text-right px-4 py-2.5 font-medium">Savings</th>
                <th className="text-left px-4 py-2.5 font-medium">Validity (BS)</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredOffers.map((offer) => {
                const storeObj =
                  offer.storeId === 'all'
                    ? undefined
                    : stores.find((s) => s.id === offer.storeId);
                const pct =
                  offer.regularTotal > 0
                    ? ((offer.savingsAmount / offer.regularTotal) * 100).toFixed(1)
                    : '0.0';
                const withinDates =
                  (!offer.validFromBs || currentBs >= offer.validFromBs) &&
                  (!offer.validToBs || currentBs <= offer.validToBs);
                return (
                  <tr
                    key={offer.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/30 align-top"
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold">{offer.offerCode}</div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {language === 'ne' && offer.nameNe ? offer.nameNe : offer.name}
                      </div>
                      {offer.campaignTag && (
                        <div className="text-[11px] text-slate-500">{offer.campaignTag}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div>{COMBO_OFFER_TYPE_LABELS[offer.offerType]?.[language]}</div>
                      <div className="text-[11px] text-slate-500">
                        {offer.storeId === 'all'
                          ? 'All Stores'
                          : storeObj?.code || offer.storeId}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="space-y-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                        {offer.items.map((it, idx) => (
                          <div key={idx} className="font-mono">
                            <span className="font-semibold">{it.fixedQty} {it.unit}</span> · {it.itemCode} ({it.productName})
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500 line-through whitespace-nowrap">
                      {formatNPR(offer.regularTotal, language)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-teal-700 dark:text-teal-400 whitespace-nowrap">
                      {formatNPR(offer.offerRate, language)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      {formatNPR(offer.savingsAmount, language)} ({pct}%)
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] whitespace-nowrap">
                      {offer.validFromBs || offer.validToBs ? (
                        <div>
                          <div>{offer.validFromBs || '...'} – {offer.validToBs || '...'}</div>
                          {!withinDates && (
                            <div className="text-amber-700">Outside date window</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500">Anytime</span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span
                        className={
                          offer.active
                            ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                            : 'text-slate-500'
                        }
                      >
                        {offer.active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-2.5">
                      {offer.active && (
                        <button
                          type="button"
                          onClick={() => loadComboIntoPos(offer, 1)}
                          className="text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1 font-medium cursor-pointer"
                        >
                          <ShoppingCart className="w-3 h-3" /> Bill in POS
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          exportComboOfferPdf(offer, storeObj, settings.businessName)
                        }
                        className="text-slate-700 dark:text-slate-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <FileDown className="w-3 h-3" /> PDF
                      </button>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditOffer(offer)}
                            className="text-slate-700 dark:text-slate-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(offer)}
                            className="text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                          >
                            {offer.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredOffers.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    No combo offers found. Create a Monthly Family Stock, Weekend Special, Festival, or Custom Offer pack to sell fixed-quantity bundles at a special rate.
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
