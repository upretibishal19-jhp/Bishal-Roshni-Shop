import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileDown, FileText } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { exportReportPdf, exportToCsv, exportToExcel } from '../lib/exportUtils';
import { addDaysBs, getBsFiscalYearRange, getBsMonthRange, todayBs } from '../lib/bsDate';

type ReportId =
  | 'daily_sales'
  | 'weekly_sales'
  | 'monthly_sales'
  | 'yearly_sales'
  | 'store_sales'
  | 'item_sales'
  | 'category_sales'
  | 'channel_sales'
  | 'payment_method'
  | 'customer_credit'
  | 'supplier_purchase'
  | 'stock_movement'
  | 'stock_variance'
  | 'damaged_expired'
  | 'gross_profit'
  | 'expense_report'
  | 'best_selling'
  | 'slow_moving'
  | 'dead_stock'
  | 'reorder_requirement';

const REPORTS: Array<{ id: ReportId; title: string }> = [
  { id: 'daily_sales', title: '01. Daily Sales Report' },
  { id: 'weekly_sales', title: '02. Weekly Sales Report' },
  { id: 'monthly_sales', title: '03. Monthly Sales Report' },
  { id: 'yearly_sales', title: '04. Yearly Sales Report' },
  { id: 'store_sales', title: '05. Store-wise Sales Report' },
  { id: 'item_sales', title: '06. Item-wise Sales Report' },
  { id: 'category_sales', title: '07. Category-wise Sales Report' },
  { id: 'channel_sales', title: '08. Sales-Channel Report' },
  { id: 'payment_method', title: '09. Payment-Method Report' },
  { id: 'customer_credit', title: '10. Customer Credit Report' },
  { id: 'supplier_purchase', title: '11. Supplier Purchase Report' },
  { id: 'stock_movement', title: '12. Stock Movement Report' },
  { id: 'stock_variance', title: '13. Stock Variance Report' },
  { id: 'damaged_expired', title: '14. Damaged & Expired Report' },
  { id: 'gross_profit', title: '15. Gross Profit Report' },
  { id: 'expense_report', title: '16. Expense Report' },
  { id: 'best_selling', title: '17. Best-Selling Products' },
  { id: 'slow_moving', title: '18. Slow-Moving Products' },
  { id: 'dead_stock', title: '19. Dead Stock Report' },
  { id: 'reorder_requirement', title: '20. Reorder Requirement Report' },
];

export function ReportsView() {
  const {
    stores,
    products,
    stockBatches,
    stockLedger,
    stockCounts,
    salesInvoices,
    customers,
    goodsReceipts,
    wasteRecords,
    expenses,
    selectedStoreId,
    bsStart,
    bsEnd,
  } = useApp();

  const [reportId, setReportId] = useState<ReportId>('daily_sales');
  const currentBs = todayBs();

  const dataset = useMemo((): { headers: string[]; rows: (string | number)[][] } => {
    const storeInv = salesInvoices.filter(
      (i) => i.status === 'confirmed' && (selectedStoreId === 'all' || i.storeId === selectedStoreId)
    );
    const rangeInv = storeInv.filter((i) => i.bsDate >= bsStart && i.bsDate <= bsEnd);

    const stockQtyByProduct: Record<string, number> = {};
    for (const b of stockBatches) {
      if (selectedStoreId === 'all' || b.storeId === selectedStoreId) {
        stockQtyByProduct[b.productId] = (stockQtyByProduct[b.productId] || 0) + b.qtyRemaining;
      }
    }

    switch (reportId) {
      case 'daily_sales':
      case 'weekly_sales':
      case 'monthly_sales':
      case 'yearly_sales': {
        const start =
          reportId === 'daily_sales'
            ? currentBs
            : reportId === 'weekly_sales'
              ? addDaysBs(currentBs, -6)
              : reportId === 'monthly_sales'
                ? getBsMonthRange(currentBs).start
                : getBsFiscalYearRange(currentBs).start;
        const end =
          reportId === 'daily_sales'
            ? currentBs
            : reportId === 'weekly_sales'
              ? currentBs
              : reportId === 'monthly_sales'
                ? getBsMonthRange(currentBs).end
                : getBsFiscalYearRange(currentBs).end;
        return {
          headers: ['Invoice No', 'BS Date', 'Store', 'Channel', 'Customer', 'Net Total', 'Paid', 'Credit'],
          rows: storeInv
            .filter((i) => i.bsDate >= start && i.bsDate <= end)
            .map((i) => [
              i.invoiceNo,
              i.bsDate,
              stores.find((s) => s.id === i.storeId)?.code || i.storeId,
              i.channel,
              i.customerName || i.customerCategory,
              i.netTotal.toFixed(2),
              i.amountPaid.toFixed(2),
              i.creditAmount.toFixed(2),
            ]),
        };
      }

      case 'store_sales':
        return {
          headers: ['Store Code', 'Store Name', 'Invoices', 'Net Sales', 'Cash/Digital', 'Credit', 'Gross Profit'],
          rows: stores.map((s) => {
            const list = salesInvoices.filter(
              (i) => i.status === 'confirmed' && i.storeId === s.id && i.bsDate >= bsStart && i.bsDate <= bsEnd
            );
            return [
              s.code,
              s.name,
              list.length,
              list.reduce((sum, i) => sum + i.netTotal, 0).toFixed(2),
              list.reduce((sum, i) => sum + i.amountPaid, 0).toFixed(2),
              list.reduce((sum, i) => sum + i.creditAmount, 0).toFixed(2),
              list.reduce((sum, i) => sum + i.grossProfit, 0).toFixed(2),
            ];
          }),
        };

      case 'item_sales':
      case 'best_selling':
      case 'slow_moving': {
        const agg: Record<string, { code: string; name: string; qty: number; rev: number; gp: number }> = {};
        for (const p of products) {
          agg[p.id] = { code: p.itemCode, name: p.name, qty: 0, rev: 0, gp: 0 };
        }
        for (const inv of rangeInv) {
          for (const it of inv.items) {
            if (!agg[it.productId]) {
              agg[it.productId] = { code: it.itemCode, name: it.productName, qty: 0, rev: 0, gp: 0 };
            }
            agg[it.productId].qty += it.qty;
            agg[it.productId].rev += it.lineTotal;
            agg[it.productId].gp += it.lineTotal - it.taxAmount - it.fifoCogs;
          }
        }
        const rows = Object.values(agg).sort((a, b) =>
          reportId === 'slow_moving' ? a.qty - b.qty : b.qty - a.qty
        );
        return {
          headers: ['Item Code', 'Product Name', 'Qty Sold', 'Sales Value (NPR)', 'Gross Profit (NPR)'],
          rows: rows.map((r) => [r.code, r.name, r.qty, r.rev.toFixed(2), r.gp.toFixed(2)]),
        };
      }

      case 'category_sales': {
        const catMap: Record<string, { qty: number; rev: number }> = {};
        for (const inv of rangeInv) {
          for (const it of inv.items) {
            const cat = products.find((p) => p.id === it.productId)?.category || 'Other';
            if (!catMap[cat]) catMap[cat] = { qty: 0, rev: 0 };
            catMap[cat].qty += it.qty;
            catMap[cat].rev += it.lineTotal;
          }
        }
        return {
          headers: ['Category', 'Units Sold', 'Sales Value (NPR)'],
          rows: Object.entries(catMap).map(([cat, v]) => [cat, v.qty, v.rev.toFixed(2)]),
        };
      }

      case 'channel_sales': {
        const chMap: Record<string, { count: number; rev: number }> = {};
        for (const inv of rangeInv) {
          if (!chMap[inv.channel]) chMap[inv.channel] = { count: 0, rev: 0 };
          chMap[inv.channel].count++;
          chMap[inv.channel].rev += inv.netTotal;
        }
        return {
          headers: ['Sales Channel', 'Invoices', 'Net Sales (NPR)'],
          rows: Object.entries(chMap).map(([ch, v]) => [ch, v.count, v.rev.toFixed(2)]),
        };
      }

      case 'payment_method': {
        const pmMap: Record<string, number> = {};
        for (const inv of rangeInv) {
          for (const al of inv.paymentAllocations) {
            pmMap[al.method] = (pmMap[al.method] || 0) + al.amount;
          }
        }
        return {
          headers: ['Payment Method', 'Total Amount (NPR)'],
          rows: Object.entries(pmMap).map(([m, amt]) => [m, amt.toFixed(2)]),
        };
      }

      case 'customer_credit':
        return {
          headers: ['Customer Code', 'Name', 'Mobile', 'Type', 'Credit Limit', 'Outstanding Balance'],
          rows: customers.map((c) => [
            c.customerCode,
            c.name,
            c.mobile,
            c.customerType,
            c.creditLimit.toFixed(2),
            c.currentBalance.toFixed(2),
          ]),
        };

      case 'supplier_purchase':
        return {
          headers: ['GRN No', 'PO No', 'BS Date', 'Supplier', 'Received Value (NPR)', 'Status'],
          rows: goodsReceipts
            .filter(
              (g) =>
                (selectedStoreId === 'all' || g.storeId === selectedStoreId) &&
                g.bsDate >= bsStart &&
                g.bsDate <= bsEnd
            )
            .map((g) => [g.grnNo, g.poNo, g.bsDate, g.supplierName, g.totalReceivedAmount.toFixed(2), g.status]),
        };

      case 'stock_movement':
        return {
          headers: ['BS Date', 'Item Code', 'Product', 'Movement', 'Qty Delta', 'Unit Cost', 'Reason'],
          rows: stockLedger
            .filter(
              (l) =>
                (selectedStoreId === 'all' || l.storeId === selectedStoreId) &&
                l.bsDate >= bsStart &&
                l.bsDate <= bsEnd
            )
            .map((l) => [l.bsDate, l.itemCode, l.productName, l.movementType, l.qtyDelta, l.unitCost.toFixed(2), l.reason]),
        };

      case 'stock_variance':
        return {
          headers: ['Count Ref', 'BS Date', 'Store', 'Status', 'Total SKUs', 'Shortages', 'Excess', 'Net Variance (NPR)'],
          rows: stockCounts
            .filter((c) => selectedStoreId === 'all' || c.storeId === selectedStoreId)
            .map((c) => [
              c.countRef,
              c.bsDate,
              stores.find((s) => s.id === c.storeId)?.code || c.storeId,
              c.status,
              c.totalItems,
              c.shortageCount,
              c.excessCount,
              c.netVarianceValue.toFixed(2),
            ]),
        };

      case 'damaged_expired':
        return {
          headers: ['BS Date', 'Type', 'Item Code', 'Product', 'Batch', 'Qty', 'Financial Loss (NPR)', 'Reason'],
          rows: wasteRecords
            .filter((w) => selectedStoreId === 'all' || w.storeId === selectedStoreId)
            .map((w) => [w.bsDate, w.wasteType, w.itemCode, w.productName, w.batchNo || '-', w.qty, w.financialLoss.toFixed(2), w.reason]),
        };

      case 'gross_profit':
        return {
          headers: ['Invoice No', 'BS Date', 'Channel', 'Revenue (Ex-VAT)', 'FIFO COGS', 'Gross Profit'],
          rows: rangeInv.map((i) => [
            i.invoiceNo,
            i.bsDate,
            i.channel,
            (i.netTotal - i.taxAmount).toFixed(2),
            i.totalCogs.toFixed(2),
            i.grossProfit.toFixed(2),
          ]),
        };

      case 'expense_report':
        return {
          headers: ['BS Date', 'Store', 'Category', 'Method', 'Description', 'Amount (NPR)'],
          rows: expenses
            .filter(
              (e) =>
                (selectedStoreId === 'all' || e.storeId === selectedStoreId) &&
                e.bsDate >= bsStart &&
                e.bsDate <= bsEnd
            )
            .map((e) => [
              e.bsDate,
              stores.find((s) => s.id === e.storeId)?.code || e.storeId,
              e.category,
              e.paymentMethod,
              e.description,
              e.amount.toFixed(2),
            ]),
        };

      case 'dead_stock': {
        const soldProductIds = new Set(rangeInv.flatMap((i) => i.items.map((it) => it.productId)));
        return {
          headers: ['Item Code', 'Product Name', 'Current Stock', 'Unit Cost', 'Tied Capital (NPR)'],
          rows: products
            .filter((p) => !soldProductIds.has(p.id) && (stockQtyByProduct[p.id] || 0) > 0)
            .map((p) => {
              const qty = stockQtyByProduct[p.id] || 0;
              return [p.itemCode, p.name, qty, p.purchasePrice.toFixed(2), (qty * p.purchasePrice).toFixed(2)];
            }),
        };
      }

      case 'reorder_requirement':
        return {
          headers: ['Item Code', 'Product Name', 'Current Stock', 'Min Level', 'Max Level', 'Suggested Reorder Qty'],
          rows: products
            .filter((p) => p.status === 'active' && (stockQtyByProduct[p.id] || 0) <= p.minStock)
            .map((p) => {
              const qty = stockQtyByProduct[p.id] || 0;
              return [p.itemCode, p.name, qty, p.minStock, p.maxStock, Math.max(0, p.maxStock - qty)];
            }),
        };
    }
  }, [
    reportId,
    salesInvoices,
    stockBatches,
    stockLedger,
    stockCounts,
    products,
    customers,
    goodsReceipts,
    wasteRecords,
    expenses,
    stores,
    selectedStoreId,
    bsStart,
    bsEnd,
    currentBs,
  ]);

  const activeTitle = REPORTS.find((r) => r.id === reportId)?.title || 'Report';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-0.5 max-h-[75vh] overflow-y-auto">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            onClick={() => setReportId(r.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${
              reportId === r.id
                ? 'bg-teal-700 text-white'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {r.title}
          </button>
        ))}
      </div>

      <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{activeTitle}</h3>
            <p className="text-xs font-mono text-slate-500">
              {dataset.rows.length} row(s) · BS Range: {bsStart} to {bsEnd}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToExcel(reportId, activeTitle, dataset.headers, dataset.rows)}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              Excel
            </button>
            <button
              onClick={() => exportReportPdf(reportId, activeTitle, `Period: ${bsStart} BS - ${bsEnd} BS`, dataset.headers, dataset.rows)}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-red-600" />
              PDF
            </button>
            <button
              onClick={() => exportToCsv(reportId, dataset.headers, dataset.rows)}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                {dataset.headers.map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {dataset.rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-4 py-2 font-mono tabular-nums whitespace-nowrap">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
              {dataset.rows.length === 0 && (
                <tr>
                  <td colSpan={dataset.headers.length} className="px-4 py-10 text-center text-slate-500">
                    No records found for this report criteria.
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
