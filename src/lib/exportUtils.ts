import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BaseUnit, ComboOffer, DayClose, Product, SalesInvoice, Store, TaxType } from '../types/erp';
import { formatNPR } from './bsDate';
import { COMBO_OFFER_TYPE_LABELS } from './i18n';

export function exportToExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const escapeCell = (val: string | number): string => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportReportPdf(
  filename: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text('Bishal Roshni Kirana Pasal', 40, 36);
  doc.setFontSize(11);
  doc.text(title, 40, 54);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(subtitle, 40, 70);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 84,
    head: [headers],
    body: rows.map((r) => r.map((c) => String(c ?? ''))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42] },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export function exportInvoicePdf(invoice: SalesInvoice, store?: Store, businessName = 'Bishal Roshni Kirana Pasal'): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text(businessName, 40, 42);
  doc.setFontSize(10);
  doc.text(store ? `${store.name} (${store.code}) - ${store.address}` : `Store ID: ${invoice.storeId}`, 40, 58);
  if (store?.panVatNo) {
    doc.text(`PAN/VAT: ${store.panVatNo}`, 40, 72);
  }

  doc.setFontSize(11);
  doc.text(`Invoice: ${invoice.invoiceNo}`, 380, 42);
  doc.setFontSize(9);
  doc.text(`Date (BS): ${invoice.bsDate}`, 380, 58);
  doc.text(`Status: ${invoice.status.toUpperCase()}`, 380, 72);

  doc.text(`Customer: ${invoice.customerName || (invoice.customerCategory === 'small_retail' ? 'Walk-in Small Retail' : 'Anonymous Retail')}`, 40, 96);
  if (invoice.customerMobile) {
    doc.text(`Mobile: ${invoice.customerMobile}`, 40, 110);
  }
  doc.text(`Channel: ${invoice.channel.toUpperCase()}   |   Payment: ${invoice.primaryPaymentMethod.toUpperCase()}`, 40, 124);

  autoTable(doc, {
    startY: 140,
    head: [['Code', 'Product', 'Qty', 'Unit', 'Rate', 'Disc', 'Tax', 'Total']],
    body: invoice.items.map((item) => [
      item.itemCode,
      item.productName,
      String(item.qty),
      item.unit,
      item.unitPrice.toFixed(2),
      item.discount.toFixed(2),
      item.taxAmount.toFixed(2),
      item.lineTotal.toFixed(2),
    ]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [15, 118, 110] },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 300;
  doc.setFontSize(10);
  doc.text(`Subtotal: ${formatNPR(invoice.subtotal)}`, 360, finalY + 24);
  doc.text(`Discount: ${formatNPR(invoice.discountAmount)}`, 360, finalY + 40);
  doc.text(`VAT/Tax: ${formatNPR(invoice.taxAmount)}`, 360, finalY + 56);
  doc.setFontSize(12);
  doc.text(`Net Total: ${formatNPR(invoice.netTotal)}`, 360, finalY + 76);
  doc.setFontSize(10);
  doc.text(`Amount Paid: ${formatNPR(invoice.amountPaid)}`, 360, finalY + 96);
  doc.text(`Outstanding Credit: ${formatNPR(invoice.creditAmount)}`, 360, finalY + 112);

  doc.save(`${invoice.invoiceNo}.pdf`);
}

export function exportDayClosePdf(
  dc: DayClose,
  store?: Store,
  businessName = 'Bishal Roshni Kirana Pasal'
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text(businessName, 40, 42);
  doc.setFontSize(11);
  doc.text('Daily Day Close (EOD) Reconciliation Report', 40, 60);
  doc.setFontSize(9);
  doc.text(`Ref: ${dc.closeRef}`, 40, 78);
  doc.text(`BS Date: ${dc.bsDate} (AD: ${dc.adDate})`, 220, 78);
  doc.text(`Status: ${dc.status.toUpperCase()}`, 420, 78);
  doc.text(
    `Store: ${store ? `${store.name} (${store.code})` : dc.storeId}`,
    40,
    94
  );
  doc.text(`Closed By: ${dc.closedByName}`, 220, 94);
  if (dc.verifiedByName) {
    doc.text(`Verified By: ${dc.verifiedByName}`, 420, 94);
  }

  autoTable(doc, {
    startY: 112,
    head: [['Metric / Cash Flow Component', 'Amount / Value']],
    body: [
      ['Confirmed Invoices / Reversed', `${dc.invoiceCount} / ${dc.reversedCount}`],
      ['Gross Sales Total', formatNPR(dc.grossSalesTotal)],
      ['Gross Profit (FIFO)', formatNPR(dc.grossProfitTotal)],
      ['Cash Sales', formatNPR(dc.cashSales)],
      ['QR Payment Sales', formatNPR(dc.qrSales)],
      ['Bank Transfer Sales', formatNPR(dc.bankTransferSales)],
      ['Mobile Wallet Sales', formatNPR(dc.mobileWalletSales)],
      ['Credit (Udharo) Issued', formatNPR(dc.creditSales)],
      ['Cash Credit Recoveries (+)', formatNPR(dc.cashRecoveries)],
      ['Digital Credit Recoveries', formatNPR(dc.digitalRecoveries)],
      ['Cash Expenses (-)', formatNPR(dc.cashExpenses)],
      ['Total Expenses (All Methods)', formatNPR(dc.totalExpenses)],
      ['Cash Supplier Payments (-)', formatNPR(dc.cashSupplierPayments)],
      ['Opening Cash Float (+)', formatNPR(dc.openingCash)],
      ['Expected Cash in Drawer', formatNPR(dc.expectedCash)],
      ['Actual Physical Cash Counted', formatNPR(dc.actualCashCounted)],
      ['Cash Variance (Over / Short)', formatNPR(dc.cashVariance)],
      ['Bank Deposit / Owner Handover', formatNPR(dc.bankDepositAmount)],
      ['Closing Cash Float Retained', formatNPR(dc.closingCashRetained)],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [15, 118, 110] },
  });

  if (dc.notes) {
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 520;
    doc.setFontSize(9);
    doc.text(`Remarks: ${dc.notes}`, 40, finalY + 24);
  }

  doc.save(`${dc.closeRef}.pdf`);
}

export function exportComboOfferPdf(
  offer: ComboOffer,
  store?: Store,
  businessName = 'Bishal Roshni Kirana Pasal'
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text(businessName, 40, 42);
  doc.setFontSize(12);
  doc.text(`${offer.name}${offer.nameNe ? ` (${offer.nameNe})` : ''}`, 40, 62);
  doc.setFontSize(9);
  doc.setTextColor(90);
  const storeText = offer.storeId === 'all' ? 'All Stores' : store ? `${store.name} (${store.code})` : offer.storeId;
  const typeLabel = COMBO_OFFER_TYPE_LABELS[offer.offerType]?.en || offer.offerType;
  const validity =
    offer.validFromBs || offer.validToBs
      ? `Valid (BS): ${offer.validFromBs || '...'} to ${offer.validToBs || '...'}`
      : 'Valid: Anytime / On-Demand';
  doc.text(`Code: ${offer.offerCode}   |   Type: ${typeLabel}${offer.campaignTag ? ` (${offer.campaignTag})` : ''}`, 40, 78);
  doc.text(`Branch: ${storeText}   |   ${validity}`, 40, 92);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 110,
    head: [['Item Code', 'Item Name', 'Fixed Qty', 'Unit', 'Regular Rate', 'Regular Value']],
    body: offer.items.map((it) => [
      it.itemCode,
      it.productName,
      String(it.fixedQty),
      it.unit,
      it.regularUnitPrice.toFixed(2),
      (it.fixedQty * it.regularUnitPrice).toFixed(2),
    ]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [15, 118, 110] },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 300;
  doc.setFontSize(10);
  doc.text(`Regular Items Total: ${formatNPR(offer.regularTotal)}`, 340, finalY + 26);
  doc.setFontSize(13);
  doc.text(`Special Combo Rate: ${formatNPR(offer.offerRate)}`, 340, finalY + 46);
  doc.setFontSize(10);
  const pct = offer.regularTotal > 0 ? ((offer.savingsAmount / offer.regularTotal) * 100).toFixed(1) : '0.0';
  doc.text(`Total Family Savings: ${formatNPR(offer.savingsAmount)} (${pct}%)`, 340, finalY + 66);

  if (offer.notes) {
    doc.setFontSize(9);
    doc.text(`Notes: ${offer.notes}`, 40, finalY + 94);
  }

  doc.save(`${offer.offerCode}.pdf`);
}

export interface ParsedProductImportRow {
  itemCode: string;
  barcode?: string;
  name: string;
  nameNe?: string;
  category: string;
  subcategory?: string;
  brand?: string;
  baseUnit: BaseUnit;
  purchasePrice: number;
  sellingPrice: number;
  wholesalePrice: number;
  taxType: TaxType;
  minStock: number;
  maxStock: number;
  tracksExpiry: boolean;
}

const VALID_UNITS: BaseUnit[] = ['pcs', 'pkt', 'box', 'carton', 'kg', 'g', 'l', 'ml'];

export async function parseProductExcelFile(file: File): Promise<ParsedProductImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  return rawRows
    .map((row): ParsedProductImportRow | null => {
      const itemCode = String(row.itemCode || row['Item Code'] || row.Code || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '');
      const name = String(row.name || row['Product Name'] || row.Name || '').trim();
      if (!itemCode || !name) return null;

      const unitRaw = String(row.baseUnit || row.Unit || 'pcs').trim().toLowerCase() as BaseUnit;
      const baseUnit: BaseUnit = VALID_UNITS.includes(unitRaw) ? unitRaw : 'pcs';
      const taxRaw = String(row.taxType || row.Tax || 'vat_13').trim().toLowerCase();
      const taxType: TaxType = taxRaw.includes('exempt') || taxRaw === '0' ? 'exempt' : 'vat_13';

      return {
        itemCode,
        barcode: String(row.barcode || row.Barcode || '').trim() || undefined,
        name,
        nameNe: String(row.nameNe || row['Nepali Name'] || '').trim() || undefined,
        category: String(row.category || row.Category || 'Groceries').trim() || 'Groceries',
        subcategory: String(row.subcategory || row.Subcategory || '').trim() || undefined,
        brand: String(row.brand || row.Brand || '').trim() || undefined,
        baseUnit,
        purchasePrice: Math.max(0, Number(row.purchasePrice || row['Purchase Price'] || 0) || 0),
        sellingPrice: Math.max(0, Number(row.sellingPrice || row['Selling Price'] || 0) || 0),
        wholesalePrice: Math.max(0, Number(row.wholesalePrice || row['Wholesale Price'] || 0) || 0),
        taxType,
        minStock: Math.max(0, Number(row.minStock || row['Min Stock'] || 5) || 0),
        maxStock: Math.max(0, Number(row.maxStock || row['Max Stock'] || 100) || 0),
        tracksExpiry: Boolean(row.tracksExpiry === true || String(row.tracksExpiry || row['Tracks Expiry'] || '').toLowerCase() === 'yes'),
      };
    })
    .filter((r): r is ParsedProductImportRow => r !== null);
}

export function exportProductsToExcel(products: Product[]): void {
  exportToExcel(
    'BishalRoshni_Products',
    'Products',
    [
      'Item Code',
      'Barcode',
      'Product Name',
      'Nepali Name',
      'Category',
      'Subcategory',
      'Brand',
      'Unit',
      'Purchase Price',
      'Selling Price',
      'Wholesale Price',
      'Tax Type',
      'Min Stock',
      'Max Stock',
      'Tracks Expiry',
      'Status',
    ],
    products.map((p) => [
      p.itemCode,
      p.barcode ?? '',
      p.name,
      p.nameNe ?? '',
      p.category,
      p.subcategory ?? '',
      p.brand ?? '',
      p.baseUnit,
      p.purchasePrice,
      p.sellingPrice,
      p.wholesalePrice,
      p.taxType,
      p.minStock,
      p.maxStock,
      p.tracksExpiry ? 'Yes' : 'No',
      p.status,
    ])
  );
}
