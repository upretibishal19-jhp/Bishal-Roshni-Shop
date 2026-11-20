import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import {
  confirmSaleTransaction,
  saveOnlineOrder,
  updateOnlineOrderStage,
} from '../lib/erpService';
import { formatNPR, todayBs } from '../lib/bsDate';
import type {
  OnlineOrder,
  OnlineOrderItem,
  OnlineOrderStatus,
  PaymentAllocationMethod,
} from '../types/erp';

const STAGES: Array<{ key: OnlineOrderStatus; label: string }> = [
  { key: 'received', label: 'Order Received' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready for Delivery' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'payment_completed', label: 'Payment Completed' },
];

export function OrdersView() {
  const {
    stores,
    products,
    customers,
    employees,
    onlineOrders,
    stockBatches,
    settings,
    selectedStoreId,
    employee,
    notify,
    language,
  } = useApp();

  const [showForm, setShowForm] = useState(false);
  const [storeId, setStoreId] = useState(selectedStoreId !== 'all' ? selectedStoreId : stores[0]?.id || '');
  const [channel, setChannel] = useState<'phone' | 'whatsapp' | 'messenger' | 'online'>('whatsapp');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentAllocationMethod>('cash');
  const [assignedDeliveryUid, setAssignedDeliveryUid] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OnlineOrderItem[]>([]);
  const [pickProductId, setPickProductId] = useState(products[0]?.id || '');
  const [pickQty, setPickQty] = useState(1);
  const [busy, setBusy] = useState(false);

  const deliveryStaff = employees.filter((e) => e.active);

  const addItem = () => {
    const p = products.find((pr) => pr.id === (pickProductId || products[0]?.id));
    if (!p || pickQty <= 0) return;
    setItems((prev) => [
      ...prev,
      {
        productId: p.id,
        itemCode: p.itemCode,
        productName: p.name,
        qty: pickQty,
        unitPrice: p.sellingPrice,
        lineTotal: Number((pickQty * p.sellingPrice).toFixed(2)),
      },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || items.length === 0) return;
    setBusy(true);
    try {
      const delUser = deliveryStaff.find((d) => d.uid === assignedDeliveryUid);
      await saveOnlineOrder(employee, {
        storeId: storeId || stores[0]?.id || '',
        channel,
        customerId: customerId || undefined,
        customerName,
        mobile,
        deliveryAddress,
        deliveryCharge,
        items,
        discountAmount,
        paymentMethod,
        assignedDeliveryUid: delUser?.uid,
        assignedDeliveryName: delUser?.displayName,
        notes,
        bsDate: todayBs(),
      });
      notify('success', 'Manual order recorded.');
      setShowForm(false);
      setItems([]);
      setCustomerName('');
      setMobile('');
      setDeliveryAddress('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save order.');
    } finally {
      setBusy(false);
    }
  };

  const handleStageAdvance = async (order: OnlineOrder, nextStatus: OnlineOrderStatus) => {
    if (!employee) return;
    try {
      let linkedInvoiceId = order.linkedInvoiceId;
      let paymentStatus = order.paymentStatus;
      if (nextStatus === 'payment_completed' && !order.linkedInvoiceId) {
        const st = stores.find((s) => s.id === order.storeId);
        if (st) {
          const cartItems = order.items
            .map((oi) => {
              const prod = products.find((p) => p.id === oi.productId);
              if (!prod) return null;
              return { product: prod, qty: oi.qty, unitPrice: oi.unitPrice, discount: 0 };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);
          if (cartItems.length > 0) {
            const cust = order.customerId ? customers.find((c) => c.id === order.customerId) : undefined;
            const inv = await confirmSaleTransaction(employee, {
              clientRequestId: `ord_${order.id}`,
              store: { id: st.id, code: st.code, taxMode: st.taxMode },
              bsDate: todayBs(),
              channel: order.channel,
              customer: cust,
              isAnonymous: !cust,
              smallRetailThreshold: settings.smallRetailThreshold,
              vatRate: settings.defaultVatRate,
              cartItems,
              invoiceDiscount: order.discountAmount,
              paymentAllocations: [{ method: order.paymentMethod, amount: order.netTotal - order.deliveryCharge }],
              allBatches: stockBatches,
            });
            linkedInvoiceId = inv.id;
            paymentStatus = order.paymentMethod === 'credit' ? 'unpaid' : 'paid';
          }
        }
      }
      await updateOnlineOrderStage(employee, order, {
        orderStatus: nextStatus,
        paymentStatus,
        linkedInvoiceId,
      });
      notify('success', `Order ${order.orderNo} updated to ${nextStatus.replace('_', ' ')}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update order status.');
    }
  };

  const filtered = onlineOrders
    .filter((o) => selectedStoreId === 'all' || o.storeId === selectedStoreId)
    .sort((a, b) => b.bsDate.localeCompare(a.bsDate));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Manual Phone, WhatsApp, Messenger & Online Orders</h2>
          <p className="text-xs text-slate-500">
            Track manual incoming orders from confirmation through delivery and payment completion.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="h-9 px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New Order Entry
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
        >
          <div className="text-sm font-semibold">New Phone / WhatsApp / Messenger Order</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 block">
              <span>Store *</span>
              <select
                value={storeId || stores[0]?.id || ''}
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
              <span>Channel *</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as typeof channel)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="whatsapp">WhatsApp Order</option>
                <option value="phone">Telephone Order</option>
                <option value="messenger">Facebook Messenger</option>
                <option value="online">Other Online Order</option>
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Registered Customer (Optional)</span>
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  const found = customers.find((c) => c.id === e.target.value);
                  if (found) {
                    setCustomerName(found.name);
                    setMobile(found.mobile);
                    if (found.address) setDeliveryAddress(found.address);
                  }
                }}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">Walk-in / New Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.mobile})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Customer Name *</span>
              <input
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 block">
              <span>Mobile *</span>
              <input
                required
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Delivery Address *</span>
              <input
                required
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 block">
              <span>Delivery Charge (NPR)</span>
              <input
                type="number"
                min="0"
                value={deliveryCharge}
                onChange={(e) => setDeliveryCharge(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </label>
            <label className="space-y-1 block">
              <span>Payment Method</span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentAllocationMethod)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="cash">Cash on Delivery</option>
                <option value="qr">QR Payment</option>
                <option value="mobile_wallet">Mobile Wallet</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit">Credit</option>
              </select>
            </label>
            <label className="space-y-1 block">
              <span>Assign Delivery Staff</span>
              <select
                value={assignedDeliveryUid}
                onChange={(e) => setAssignedDeliveryUid(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">Unassigned</option>
                {deliveryStaff.map((d) => (
                  <option key={d.uid} value={d.uid}>
                    {d.displayName} ({d.role})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
            <select
              value={pickProductId}
              onChange={(e) => setPickProductId(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              {products.filter((p) => p.status === 'active').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.itemCode} · {p.name} ({formatNPR(p.sellingPrice)})
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={pickQty}
              onChange={(e) => setPickQty(Number(e.target.value))}
              className="w-20 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
            />
            <button
              type="button"
              onClick={addItem}
              className="h-9 px-3 rounded-lg bg-slate-900 dark:bg-slate-700 text-white cursor-pointer"
            >
              Add Item
            </button>
          </div>

          {items.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-1">
              {items.map((it, i) => (
                <div key={i} className="flex justify-between">
                  <span>
                    {it.itemCode} · {it.productName} x {it.qty}
                  </span>
                  <span className="font-mono">{formatNPR(it.lineTotal, language)}</span>
                </div>
              ))}
            </div>
          )}

          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Delivery notes / landmarks..."
            className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy || items.length === 0} className="px-4 py-1.5 rounded-lg bg-teal-700 text-white font-medium cursor-pointer disabled:opacity-50">
              {busy ? 'Saving...' : 'Save Order'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Order No · Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Channel</th>
                <th className="text-left px-4 py-2.5 font-medium">Customer & Address</th>
                <th className="text-right px-4 py-2.5 font-medium">Net Total</th>
                <th className="text-left px-4 py-2.5 font-medium">Delivery Person</th>
                <th className="text-left px-4 py-2.5 font-medium">Workflow Stage</th>
                <th className="text-left px-4 py-2.5 font-medium">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((ord) => (
                <tr key={ord.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-mono font-semibold">{ord.orderNo}</div>
                    <div className="font-mono text-slate-500">{ord.bsDate}</div>
                  </td>
                  <td className="px-4 py-2.5 uppercase">{ord.channel}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">
                      {ord.customerName} ({ord.mobile})
                    </div>
                    <div className="text-slate-500">{ord.deliveryAddress}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                    {formatNPR(ord.netTotal, language)}
                  </td>
                  <td className="px-4 py-2.5">{ord.assignedDeliveryName || 'Unassigned'}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={ord.orderStatus}
                      disabled={ord.orderStatus === 'payment_completed'}
                      onChange={(e) => handleStageAdvance(ord, e.target.value as OnlineOrderStatus)}
                      className="h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    >
                      {STAGES.map((st) => (
                        <option key={st.key} value={st.key}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 capitalize">
                    {ord.paymentStatus} ({ord.paymentMethod})
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No phone, WhatsApp, Messenger, or online orders recorded yet.
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
