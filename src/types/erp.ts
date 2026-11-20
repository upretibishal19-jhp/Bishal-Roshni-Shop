export const BUSINESS_ID = 'bishal_roshni';
export const BOOTSTRAPPED_OWNER_EMAIL = 'upretibishal19@gmail.com';

export type Language = 'en' | 'ne';
export type TaxMode = 'vat_13' | 'pan_only';
export type TaxType = 'vat_13' | 'exempt';
export type BaseUnit = 'pcs' | 'pkt' | 'box' | 'carton' | 'kg' | 'g' | 'l' | 'ml';

export type EmployeeRole =
  | 'owner'
  | 'store_manager'
  | 'cashier'
  | 'inventory_controller'
  | 'accountant'
  | 'delivery_staff';

export interface RolePermissions {
  canViewPurchasePrice: boolean;
  canViewProfitReports: boolean;
  canManageExpenses: boolean;
  canManageCredit: boolean;
  canApproveStockAdjustments: boolean;
  canManageUsers: boolean;
  canViewFinancialRecords: boolean;
  canReverseSales: boolean;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<EmployeeRole, RolePermissions> = {
  owner: {
    canViewPurchasePrice: true,
    canViewProfitReports: true,
    canManageExpenses: true,
    canManageCredit: true,
    canApproveStockAdjustments: true,
    canManageUsers: true,
    canViewFinancialRecords: true,
    canReverseSales: true,
  },
  store_manager: {
    canViewPurchasePrice: true,
    canViewProfitReports: true,
    canManageExpenses: true,
    canManageCredit: true,
    canApproveStockAdjustments: true,
    canManageUsers: false,
    canViewFinancialRecords: true,
    canReverseSales: true,
  },
  cashier: {
    canViewPurchasePrice: false,
    canViewProfitReports: false,
    canManageExpenses: false,
    canManageCredit: true,
    canApproveStockAdjustments: false,
    canManageUsers: false,
    canViewFinancialRecords: false,
    canReverseSales: false,
  },
  inventory_controller: {
    canViewPurchasePrice: true,
    canViewProfitReports: false,
    canManageExpenses: false,
    canManageCredit: false,
    canApproveStockAdjustments: false,
    canManageUsers: false,
    canViewFinancialRecords: false,
    canReverseSales: false,
  },
  accountant: {
    canViewPurchasePrice: true,
    canViewProfitReports: true,
    canManageExpenses: true,
    canManageCredit: true,
    canApproveStockAdjustments: false,
    canManageUsers: false,
    canViewFinancialRecords: true,
    canReverseSales: false,
  },
  delivery_staff: {
    canViewPurchasePrice: false,
    canViewProfitReports: false,
    canManageExpenses: false,
    canManageCredit: false,
    canApproveStockAdjustments: false,
    canManageUsers: false,
    canViewFinancialRecords: false,
    canReverseSales: false,
  },
};

export interface BusinessSettings {
  id: string;
  businessId: string;
  businessName: string;
  businessNameNe?: string;
  panVatNo?: string;
  taxMode: TaxMode;
  defaultVatRate: number;
  smallRetailThreshold: number;
  allowAnonymousRetail: boolean;
  fiscalYearStartMonth: number;
  updatedAt?: unknown;
}

export interface Employee {
  id: string;
  businessId: string;
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  role: EmployeeRole;
  storeId?: string;
  permissions: RolePermissions;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EmployeeInvite {
  id: string;
  businessId: string;
  emailLower: string;
  displayName: string;
  phone?: string;
  role: EmployeeRole;
  storeId?: string;
  permissions: RolePermissions;
  active: boolean;
  invitedByUid: string;
  createdAt?: unknown;
}

export interface Store {
  id: string;
  businessId: string;
  code: string;
  name: string;
  nameNe?: string;
  address: string;
  phone?: string;
  panVatNo?: string;
  taxMode: TaxMode;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Product {
  id: string;
  businessId: string;
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
  defaultSupplierId?: string;
  tracksExpiry: boolean;
  defaultExpiryDateBs?: string;
  status: 'active' | 'inactive';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StockBatch {
  id: string;
  businessId: string;
  storeId: string;
  productId: string;
  itemCode: string;
  batchNo: string;
  expiryDateBs?: string;
  expiryDateAd?: string;
  unitCost: number;
  qtyReceived: number;
  qtyRemaining: number;
  supplierId?: string;
  grnId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type StockMovementType =
  | 'opening'
  | 'purchase_grn'
  | 'sale'
  | 'sale_reversal'
  | 'transfer_out'
  | 'transfer_in'
  | 'damage'
  | 'expiry'
  | 'supplier_return'
  | 'customer_return'
  | 'count_adjustment'
  | 'manual_adjustment';

export interface StockLedgerEntry {
  id: string;
  businessId: string;
  storeId: string;
  productId: string;
  itemCode: string;
  productName: string;
  batchId?: string;
  movementType: StockMovementType;
  qtyDelta: number;
  unitCost: number;
  totalValue: number;
  referenceType: string;
  referenceId: string;
  referenceNo?: string;
  reason: string;
  actorUid: string;
  actorName: string;
  bsDate: string;
  adDate: string;
  createdAt?: unknown;
}

export interface StockCount {
  id: string;
  businessId: string;
  countRef: string;
  storeId: string;
  bsDate: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  totalItems: number;
  shortageCount: number;
  excessCount: number;
  netVarianceValue: number;
  createdByUid: string;
  createdByName: string;
  approvedByUid?: string;
  approvedByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StockCountLine {
  id: string;
  businessId: string;
  stockCountId: string;
  productId: string;
  itemCode: string;
  productName: string;
  systemQty: number;
  physicalQty: number;
  varianceQty: number;
  unitCost: number;
  varianceValue: number;
  reason?: string;
  adjustmentPosted: boolean;
  updatedAt?: unknown;
}

export interface Customer {
  id: string;
  businessId: string;
  customerCode: string;
  name: string;
  mobile: string;
  address?: string;
  customerType: 'retail' | 'wholesale';
  creditLimit: number;
  currentBalance: number;
  defaultDueDays: number;
  storeId?: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type SalesChannel =
  | 'walk_in'
  | 'phone'
  | 'whatsapp'
  | 'messenger'
  | 'online'
  | 'wholesale';

export type PaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'qr'
  | 'mobile_wallet'
  | 'credit'
  | 'partial'
  | 'multiple';

export type PaymentAllocationMethod =
  | 'cash'
  | 'bank_transfer'
  | 'qr'
  | 'mobile_wallet'
  | 'credit';

export interface PaymentAllocation {
  method: PaymentAllocationMethod;
  amount: number;
  referenceNo?: string;
}

export interface SalesLineItem {
  productId: string;
  itemCode: string;
  productName: string;
  unit: BaseUnit;
  qty: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  fifoCogs: number;
  batchDeductions: Array<{ batchId: string; qty: number; unitCost: number }>;
}

export interface SalesInvoice {
  id: string;
  businessId: string;
  invoiceNo: string;
  clientRequestId: string;
  storeId: string;
  bsDate: string;
  adDate: string;
  channel: SalesChannel;
  customerId?: string;
  customerName?: string;
  customerMobile?: string;
  customerCategory: 'small_retail' | 'registered' | 'anonymous';
  items: SalesLineItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  netTotal: number;
  totalCogs: number;
  grossProfit: number;
  amountPaid: number;
  creditAmount: number;
  primaryPaymentMethod: PaymentMethod;
  paymentAllocations: PaymentAllocation[];
  status: 'confirmed' | 'reversed';
  reversedByUid?: string;
  reversedReason?: string;
  createdByUid: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CustomerCreditEntry {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  storeId: string;
  invoiceId?: string;
  invoiceNo?: string;
  entryType: 'credit_sale' | 'payment_recovery' | 'reversal';
  amount: number;
  method: 'cash' | 'bank_transfer' | 'qr' | 'mobile_wallet' | 'credit' | 'reversal';
  referenceNo?: string;
  dueDateBs?: string;
  notes?: string;
  bsDate: string;
  actorUid: string;
  actorName: string;
  createdAt?: unknown;
}

export interface Supplier {
  id: string;
  businessId: string;
  name: string;
  contactPerson?: string;
  phone: string;
  address?: string;
  panVatNo?: string;
  paymentTerms?: string;
  currentPayable: number;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PurchaseOrderItem {
  productId: string;
  itemCode: string;
  productName: string;
  unit: BaseUnit;
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  businessId: string;
  poNo: string;
  storeId: string;
  supplierId: string;
  supplierName: string;
  bsDate: string;
  status: 'draft' | 'submitted' | 'partial' | 'completed' | 'cancelled';
  items: PurchaseOrderItem[];
  totalOrderedAmount: number;
  totalReceivedAmount: number;
  createdByUid: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GoodsReceiptItem {
  productId: string;
  itemCode: string;
  productName: string;
  orderedQty: number;
  receivedQty: number;
  varianceQty: number;
  unitCost: number;
  batchNo: string;
  expiryDateBs?: string;
  expiryDateAd?: string;
  lineTotal: number;
}

export interface GoodsReceipt {
  id: string;
  businessId: string;
  grnNo: string;
  poId: string;
  poNo: string;
  storeId: string;
  supplierId: string;
  supplierName: string;
  bsDate: string;
  status: 'pending_approval' | 'approved';
  items: GoodsReceiptItem[];
  totalReceivedAmount: number;
  createdByUid: string;
  approvedByUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SupplierPayment {
  id: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  storeId: string;
  grnId?: string;
  method: 'cash' | 'bank_transfer' | 'qr' | 'mobile_wallet';
  amount: number;
  referenceNo?: string;
  notes?: string;
  bsDate: string;
  actorUid: string;
  actorName: string;
  createdAt?: unknown;
}

export interface StockTransferItem {
  productId: string;
  itemCode: string;
  productName: string;
  qtyDispatched: number;
  qtyReceived: number;
  unitCost: number;
  batchNo: string;
  expiryDateBs?: string;
  expiryDateAd?: string;
}

export interface StockTransfer {
  id: string;
  businessId: string;
  transferRef: string;
  fromStoreId: string;
  toStoreId: string;
  bsDate: string;
  status: 'dispatched' | 'received' | 'cancelled';
  items: StockTransferItem[];
  dispatchedByUid: string;
  dispatchedByName: string;
  receivedByUid?: string;
  receivedByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type OnlineOrderStatus =
  | 'received'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'payment_completed';

export interface OnlineOrderItem {
  productId: string;
  itemCode: string;
  productName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OnlineOrder {
  id: string;
  businessId: string;
  orderNo: string;
  storeId: string;
  channel: 'phone' | 'whatsapp' | 'messenger' | 'online';
  customerId?: string;
  customerName: string;
  mobile: string;
  deliveryAddress: string;
  deliveryCharge: number;
  items: OnlineOrderItem[];
  subtotal: number;
  discountAmount: number;
  netTotal: number;
  orderStatus: OnlineOrderStatus;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paymentMethod: PaymentAllocationMethod;
  assignedDeliveryUid?: string;
  assignedDeliveryName?: string;
  linkedInvoiceId?: string;
  notes?: string;
  bsDate: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WasteRecord {
  id: string;
  businessId: string;
  storeId: string;
  productId: string;
  itemCode: string;
  productName: string;
  batchId?: string;
  batchNo?: string;
  wasteType: 'damaged' | 'expired';
  qty: number;
  unitCost: number;
  financialLoss: number;
  reason: string;
  bsDate: string;
  actorUid: string;
  actorName: string;
  createdAt?: unknown;
}

export type ExpenseCategory =
  | 'rent'
  | 'electricity'
  | 'salaries'
  | 'delivery'
  | 'transportation'
  | 'maintenance'
  | 'other';

export interface Expense {
  id: string;
  businessId: string;
  storeId: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'qr' | 'mobile_wallet';
  description: string;
  referenceNo?: string;
  bsDate: string;
  actorUid: string;
  actorName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuditLog {
  id: string;
  businessId: string;
  actorUid: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  bsDate: string;
  createdAt?: unknown;
}

export interface DayClose {
  id: string;
  businessId: string;
  closeRef: string;
  storeId: string;
  bsDate: string;
  adDate: string;
  status: 'closed' | 'verified';
  invoiceCount: number;
  reversedCount: number;
  grossSalesTotal: number;
  grossProfitTotal: number;
  cashSales: number;
  qrSales: number;
  bankTransferSales: number;
  mobileWalletSales: number;
  creditSales: number;
  cashRecoveries: number;
  digitalRecoveries: number;
  cashExpenses: number;
  totalExpenses: number;
  cashSupplierPayments: number;
  openingCash: number;
  expectedCash: number;
  actualCashCounted: number;
  cashVariance: number;
  bankDepositAmount: number;
  closingCashRetained: number;
  denominations?: Record<string, number>;
  notes?: string;
  closedByUid: string;
  closedByName: string;
  verifiedByUid?: string;
  verifiedByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ComboOfferType = 'monthly_family' | 'weekend' | 'festival' | 'custom_offer';

export interface ComboOfferItem {
  productId: string;
  itemCode: string;
  productName: string;
  unit: BaseUnit;
  fixedQty: number;
  regularUnitPrice: number;
}

export interface ComboOffer {
  id: string;
  businessId: string;
  offerCode: string;
  name: string;
  nameNe?: string;
  offerType: ComboOfferType;
  campaignTag?: string;
  storeId: string;
  items: ComboOfferItem[];
  regularTotal: number;
  offerRate: number;
  savingsAmount: number;
  validFromBs?: string;
  validToBs?: string;
  active: boolean;
  notes?: string;
  createdByUid: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ModuleKey =
  | 'dashboard'
  | 'stores'
  | 'products'
  | 'inventory'
  | 'stock_count'
  | 'sales'
  | 'combo_offers'
  | 'day_close'
  | 'orders'
  | 'invoices'
  | 'customers'
  | 'credit_management'
  | 'suppliers'
  | 'purchases'
  | 'stock_transfers'
  | 'expiry_damage'
  | 'expenses'
  | 'reports'
  | 'employees'
  | 'settings';
