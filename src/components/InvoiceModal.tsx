import { useState } from 'react';
import { Printer, FileDown, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { formatNPR, formatBsDate } from '../lib/bsDate';
import { exportInvoicePdf } from '../lib/exportUtils';
import { CHANNEL_LABELS, PAYMENT_LABELS, t } from '../lib/i18n';
import type { SalesInvoice } from '../types/erp';

export function InvoiceModal({
  invoice,
  onClose,
}: {
  invoice: SalesInvoice;
  onClose: () => void;
}) {
  const { stores, settings, language } = useApp();
  const [mode, setMode] = useState<'a4' | 'thermal'>('a4');
  const store = stores.find((s) => s.id === invoice.storeId);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-3xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('a4')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                mode === 'a4'
                  ? 'bg-slate-900 text-white dark:bg-teal-700'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              A4 Format
            </button>
            <button
              onClick={() => setMode('thermal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                mode === 'thermal'
                  ? 'bg-slate-900 text-white dark:bg-teal-700'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              80mm Thermal
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportInvoicePdf(invoice, store, settings.businessName)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              {t('exportPdf', language)}
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              {mode === 'a4' ? t('printA4', language) : t('printThermal', language)}
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto bg-white text-slate-900">
          {mode === 'a4' ? (
            <div className="a4-invoice space-y-5">
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-xl font-bold">{settings.businessName}</h2>
                  <p className="text-xs text-slate-600">
                    {store ? `${store.name} (${store.code}) · ${store.address}` : invoice.storeId}
                  </p>
                  {(store?.panVatNo || settings.panVatNo) && (
                    <p className="text-xs font-mono text-slate-600">
                      PAN/VAT: {store?.panVatNo || settings.panVatNo}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs space-y-1">
                  <div className="font-mono font-semibold text-sm">{invoice.invoiceNo}</div>
                  <div>Date (BS): {formatBsDate(invoice.bsDate, language)}</div>
                  <div>Status: {invoice.status.toUpperCase()}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs border-b border-slate-200 pb-3">
                <div>
                  <div className="text-slate-500">Customer</div>
                  <div className="font-medium">
                    {invoice.customerName ||
                      (invoice.customerCategory === 'small_retail' ? 'Walk-in Small Retail' : 'Anonymous Retail')}
                  </div>
                  {invoice.customerMobile && <div className="font-mono">{invoice.customerMobile}</div>}
                </div>
                <div className="text-right">
                  <div className="text-slate-500">Channel & Payment</div>
                  <div className="font-medium">
                    {CHANNEL_LABELS[invoice.channel]?.[language]} · {PAYMENT_LABELS[invoice.primaryPaymentMethod]?.[language]}
                  </div>
                  <div className="text-slate-500">Cashier: {invoice.createdByName}</div>
                </div>
              </div>

              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 text-left">
                    <th className="py-2">Code</th>
                    <th className="py-2">Item</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Rate</th>
                    <th className="py-2 text-right">Disc</th>
                    <th className="py-2 text-right">Tax</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((it, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-1.5 font-mono">{it.itemCode}</td>
                      <td className="py-1.5">{it.productName}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        {it.qty} {it.unit}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{it.unitPrice.toFixed(2)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{it.discount.toFixed(2)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{it.taxAmount.toFixed(2)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums font-medium">{it.lineTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-64 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="font-mono tabular-nums">{formatNPR(invoice.subtotal, language)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Discount</span>
                    <span className="font-mono tabular-nums">{formatNPR(invoice.discountAmount, language)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">VAT / Tax</span>
                    <span className="font-mono tabular-nums">{formatNPR(invoice.taxAmount, language)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm border-t border-slate-300 pt-1.5">
                    <span>Net Total</span>
                    <span className="font-mono tabular-nums">{formatNPR(invoice.netTotal, language)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>Amount Paid</span>
                    <span className="font-mono tabular-nums">{formatNPR(invoice.amountPaid, language)}</span>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span>Credit Balance</span>
                    <span className="font-mono tabular-nums">{formatNPR(invoice.creditAmount, language)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="thermal-receipt mx-auto w-[300px] border border-dashed border-slate-300 p-4 font-mono text-[11px] space-y-2">
              <div className="text-center border-b border-dashed border-slate-300 pb-2">
                <div className="font-bold text-xs">{settings.businessName}</div>
                <div>{store?.name || invoice.storeId}</div>
                {store?.phone && <div>Tel: {store.phone}</div>}
                {store?.panVatNo && <div>PAN: {store.panVatNo}</div>}
              </div>
              <div className="space-y-0.5 border-b border-dashed border-slate-300 pb-2">
                <div>Bill: {invoice.invoiceNo}</div>
                <div>BS Date: {invoice.bsDate}</div>
                <div>Cust: {invoice.customerName || 'Walk-in Retail'}</div>
              </div>
              <div className="space-y-1 border-b border-dashed border-slate-300 pb-2">
                {invoice.items.map((it, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between">
                      <span className="truncate max-w-[170px]">{it.productName}</span>
                      <span>{it.lineTotal.toFixed(2)}</span>
                    </div>
                    <div className="text-[10px] text-slate-600">
                      {it.itemCode} · {it.qty} {it.unit} x {it.unitPrice.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span>Discount:</span>
                  <span>{invoice.discountAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax:</span>
                  <span>{invoice.taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-xs pt-1 border-t border-dashed border-slate-300">
                  <span>NET TOTAL:</span>
                  <span>{formatNPR(invoice.netTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid ({invoice.primaryPaymentMethod}):</span>
                  <span>{invoice.amountPaid.toFixed(2)}</span>
                </div>
                {invoice.creditAmount > 0 && (
                  <div className="flex justify-between font-bold">
                    <span>Udharo Credit:</span>
                    <span>{invoice.creditAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="text-center pt-2 text-[10px] border-t border-dashed border-slate-300">
                Thank you for shopping at Bishal Roshni Kirana Pasal!
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
