import { useMemo, useRef, useState } from 'react';
import { Plus, Upload, Download, Search } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { saveProduct, toggleProductStatus } from '../lib/erpService';
import { exportProductsToExcel, parseProductExcelFile } from '../lib/exportUtils';
import { formatNPR } from '../lib/bsDate';
import { UNIT_LABELS } from '../lib/i18n';
import type { BaseUnit, Product, TaxType } from '../types/erp';

const UNITS: BaseUnit[] = ['pcs', 'pkt', 'box', 'carton', 'kg', 'g', 'l', 'ml'];

export function ProductsView() {
  const { products, suppliers, employee, notify, language } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [itemCode, setItemCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [nameNe, setNameNe] = useState('');
  const [category, setCategory] = useState('Grains & Pulses');
  const [subcategory, setSubcategory] = useState('');
  const [brand, setBrand] = useState('');
  const [baseUnit, setBaseUnit] = useState<BaseUnit>('pcs');
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [wholesalePrice, setWholesalePrice] = useState(0);
  const [taxType, setTaxType] = useState<TaxType>('vat_13');
  const [minStock, setMinStock] = useState(5);
  const [maxStock, setMaxStock] = useState(100);
  const [defaultSupplierId, setDefaultSupplierId] = useState('');
  const [tracksExpiry, setTracksExpiry] = useState(false);
  const [defaultExpiryDateBs, setDefaultExpiryDateBs] = useState('');
  const [busy, setBusy] = useState(false);

  const canSeePurchase = employee?.role === 'owner' || employee?.permissions.canViewPurchasePrice;
  const canEditCatalog =
    employee && ['owner', 'store_manager', 'inventory_controller'].includes(employee.role);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.itemCode.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.nameNe || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, searchTerm, statusFilter]);

  const openNew = () => {
    setEditing(null);
    setItemCode('');
    setBarcode('');
    setName('');
    setNameNe('');
    setCategory('Grains & Pulses');
    setSubcategory('');
    setBrand('');
    setBaseUnit('pcs');
    setPurchasePrice(0);
    setSellingPrice(0);
    setWholesalePrice(0);
    setTaxType('vat_13');
    setMinStock(5);
    setMaxStock(100);
    setDefaultSupplierId('');
    setTracksExpiry(false);
    setDefaultExpiryDateBs('');
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setItemCode(p.itemCode);
    setBarcode(p.barcode || '');
    setName(p.name);
    setNameNe(p.nameNe || '');
    setCategory(p.category);
    setSubcategory(p.subcategory || '');
    setBrand(p.brand || '');
    setBaseUnit(p.baseUnit);
    setPurchasePrice(p.purchasePrice);
    setSellingPrice(p.sellingPrice);
    setWholesalePrice(p.wholesalePrice);
    setTaxType(p.taxType);
    setMinStock(p.minStock);
    setMaxStock(p.maxStock);
    setDefaultSupplierId(p.defaultSupplierId || '');
    setTracksExpiry(p.tracksExpiry);
    setDefaultExpiryDateBs(p.defaultExpiryDateBs || '');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setBusy(true);
    try {
      await saveProduct(employee, products, {
        id: editing?.id,
        itemCode,
        barcode,
        name,
        nameNe,
        category,
        subcategory,
        brand,
        baseUnit,
        purchasePrice,
        sellingPrice,
        wholesalePrice,
        taxType,
        minStock,
        maxStock,
        defaultSupplierId,
        tracksExpiry,
        defaultExpiryDateBs,
        status: editing?.status || 'active',
      });
      notify('success', editing ? `Updated ${itemCode}` : `Added product ${itemCode.toUpperCase()}`);
      setShowForm(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setBusy(false);
    }
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !employee) return;
    try {
      const rows = await parseProductExcelFile(file);
      let imported = 0;
      let skipped = 0;
      const workingList = [...products];
      for (const row of rows) {
        if (workingList.some((p) => p.itemCode === row.itemCode)) {
          skipped++;
          continue;
        }
        const id = await saveProduct(employee, workingList, {
          ...row,
          status: 'active',
        });
        workingList.push({ ...row, id, businessId: 'bishal_roshni', status: 'active' });
        imported++;
      }
      notify('success', `Imported ${imported} products (${skipped} duplicate codes skipped).`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Excel import failed.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by item code, barcode, or product name..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
          </div>
          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {(['all', 'active', 'inactive'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs rounded-md capitalize cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-medium'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleExcelImport}
            className="hidden"
          />
          {canEditCatalog && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Excel
            </button>
          )}
          <button
            onClick={() => exportProductsToExcel(filtered)}
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
          {canEditCatalog && (
            <button
              onClick={openNew}
              className="h-9 px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Product
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div className="text-sm font-semibold">
            {editing ? `Edit Product (${editing.itemCode})` : 'New Master Product'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
            <label className="space-y-1 block">
              <span>Unique Item Code *</span>
              <input
                required
                disabled={Boolean(editing)}
                value={itemCode}
                onChange={(e) => setItemCode(e.target.value.toUpperCase())}
                placeholder="RICE001"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Barcode</span>
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Product Name (EN) *</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jira Masino Rice 25 KG"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 block">
              <span>Product Name (नेपाली)</span>
              <input
                value={nameNe}
                onChange={(e) => setNameNe(e.target.value)}
                placeholder="जिरा मसिनो चामल २५ केजी"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 block">
              <span>Category *</span>
              <input
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 block">
              <span>Subcategory</span>
              <input
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 block">
              <span>Brand</span>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 block">
              <span>Unit of Measurement *</span>
              <select
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value as BaseUnit)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u][language]} ({u})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Purchase Price (NPR) *</span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Selling Price (NPR) *</span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Wholesale Price (NPR) *</span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Tax Category</span>
              <select
                value={taxType}
                onChange={(e) => setTaxType(e.target.value as TaxType)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="vat_13">13% VATable</option>
                <option value="exempt">VAT Exempt Staple</option>
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Min Stock Level *</span>
              <input
                type="number"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Max Stock Level *</span>
              <input
                type="number"
                min="0"
                value={maxStock}
                onChange={(e) => setMaxStock(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Default Supplier</span>
              <select
                value={defaultSupplierId}
                onChange={(e) => setDefaultSupplierId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                checked={tracksExpiry}
                onChange={(e) => setTracksExpiry(e.target.checked)}
              />
              <span>Tracks Expiry Date</span>
            </div>
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
              {busy ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Item Code</th>
                <th className="text-left px-4 py-2.5 font-medium">Product Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Category / Brand</th>
                <th className="text-left px-4 py-2.5 font-medium">Unit</th>
                {canSeePurchase && <th className="text-right px-4 py-2.5 font-medium">Cost</th>}
                <th className="text-right px-4 py-2.5 font-medium">Retail</th>
                <th className="text-right px-4 py-2.5 font-medium">Wholesale</th>
                <th className="text-right px-4 py-2.5 font-medium">Min / Max</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                {canEditCatalog && <th className="text-right px-4 py-2.5 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-2.5 font-mono font-semibold">{p.itemCode}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.name}</div>
                    {p.nameNe && <div className="text-slate-500">{p.nameNe}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                    {p.category}
                    {p.brand ? ` · ${p.brand}` : ''}
                  </td>
                  <td className="px-4 py-2.5">{UNIT_LABELS[p.baseUnit][language]}</td>
                  {canSeePurchase && (
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatNPR(p.purchasePrice, language)}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                    {formatNPR(p.sellingPrice, language)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatNPR(p.wholesalePrice, language)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {p.minStock} / {p.maxStock}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={p.status === 'active' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}>
                      {p.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canEditCatalog && (
                    <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                      <button onClick={() => openEdit(p)} className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer">
                        Edit
                      </button>
                      <button
                        onClick={() => employee && toggleProductStatus(employee, p)}
                        className="text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
                      >
                        {p.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    No products match your search. Add a product or import an Excel sheet.
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
