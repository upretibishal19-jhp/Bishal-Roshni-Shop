import type { Language, ModuleKey, SalesChannel, PaymentMethod, ExpenseCategory, BaseUnit, ComboOfferType } from '../types/erp';

export const NAV_LABELS: Record<ModuleKey, { en: string; ne: string }> = {
  dashboard: { en: 'Dashboard', ne: 'ड्यासबोर्ड' },
  stores: { en: 'Stores', ne: 'शाखा पसलहरू' },
  products: { en: 'Products', ne: 'सामान सूची' },
  inventory: { en: 'Inventory', ne: 'मौज्दात व्यवस्थापन' },
  stock_count: { en: 'Stock Count', ne: 'साप्ताहिक स्टक गणना' },
  sales: { en: 'Daily Sales', ne: 'दैनिक बिक्री' },
  combo_offers: { en: 'Combo Offers', ne: 'कम्बो र विशेष अफर' },
  day_close: { en: 'Day Close', ne: 'दैनिक बन्द (Day Close)' },
  orders: { en: 'Online Orders', ne: 'अनलाइन अर्डर' },
  invoices: { en: 'Invoices', ne: 'बिल / इनभ्वाइस' },
  customers: { en: 'Customers', ne: 'ग्राहकहरू' },
  credit_management: { en: 'Credit Mgmt', ne: 'उधारो व्यवस्थापन' },
  suppliers: { en: 'Suppliers', ne: 'सप्लायरहरू' },
  purchases: { en: 'Purchases', ne: 'खरिद / PO' },
  stock_transfers: { en: 'Stock Transfers', ne: 'स्टक ट्रान्सफर' },
  expiry_damage: { en: 'Expiry & Damage', ne: 'म्याद र क्षति' },
  expenses: { en: 'Expenses', ne: 'खर्च विवरण' },
  reports: { en: 'Reports', ne: 'रिपोर्टहरू' },
  employees: { en: 'Employees', ne: 'कर्मचारी र पहुँच' },
  settings: { en: 'Settings', ne: 'सेटिङ्स' },
};

export const COMBO_OFFER_TYPE_LABELS: Record<ComboOfferType, { en: string; ne: string }> = {
  monthly_family: { en: 'Monthly Family Stock', ne: 'मासिक पारिवारिक स्टक' },
  weekend: { en: 'Weekend Special', ne: 'सप्ताहन्त विशेष अफर' },
  festival: { en: 'Festival Special', ne: 'चाडपर्व विशेष अफर' },
  custom_offer: { en: 'On-Demand / Custom', ne: 'आवश्यकता अनुसार अफर' },
};

export const CHANNEL_LABELS: Record<SalesChannel, { en: string; ne: string }> = {
  walk_in: { en: 'Walk-in Store', ne: 'पसल ग्राहक' },
  phone: { en: 'Telephone Order', ne: 'फोन अर्डर' },
  whatsapp: { en: 'WhatsApp Order', ne: 'व्हाट्सएप अर्डर' },
  messenger: { en: 'FB Messenger', ne: 'फेसबुक मेसेन्जर' },
  online: { en: 'Other Online', ne: 'अन्य अनलाइन' },
  wholesale: { en: 'Wholesale', ne: 'होलसेल ग्राहक' },
};

export const PAYMENT_LABELS: Record<PaymentMethod, { en: string; ne: string }> = {
  cash: { en: 'Cash', ne: 'नगद' },
  bank_transfer: { en: 'Bank Transfer', ne: 'बैंक ट्रान्सफर' },
  qr: { en: 'QR Payment', ne: 'QR भुक्तानी' },
  mobile_wallet: { en: 'Mobile Wallet', ne: 'मोबाइल वालेट' },
  credit: { en: 'Credit (Udharo)', ne: 'उधारो' },
  partial: { en: 'Partial Payment', ne: 'आंशिक भुक्तानी' },
  multiple: { en: 'Multiple Methods', ne: 'मिश्रित भुक्तानी' },
};

export const EXPENSE_LABELS: Record<ExpenseCategory, { en: string; ne: string }> = {
  rent: { en: 'Rent', ne: 'भाडा' },
  electricity: { en: 'Electricity', ne: 'बिजुली' },
  salaries: { en: 'Salaries', ne: 'तलब' },
  delivery: { en: 'Delivery', ne: 'डेलिभरी खर्च' },
  transportation: { en: 'Transportation', ne: 'ढुवानी' },
  maintenance: { en: 'Maintenance', ne: 'मर्मत सम्भार' },
  other: { en: 'Other', ne: 'अन्य खर्च' },
};

export const UNIT_LABELS: Record<BaseUnit, { en: string; ne: string }> = {
  pcs: { en: 'Pcs', ne: 'थान' },
  pkt: { en: 'Pkt', ne: 'प्याकेट' },
  box: { en: 'Box', ne: 'बक्स' },
  carton: { en: 'Carton', ne: 'कार्टुन' },
  kg: { en: 'Kg', ne: 'के.जी.' },
  g: { en: 'Gm', ne: 'ग्राम' },
  l: { en: 'Ltr', ne: 'लिटर' },
  ml: { en: 'Ml', ne: 'मि.लि.' },
};

export const COMMON_TEXT: Record<string, { en: string; ne: string }> = {
  allStores: { en: 'All Stores', ne: 'सबै शाखाहरू' },
  newSale: { en: 'New Sale', ne: 'नयाँ बिक्री' },
  todaySales: { en: 'Daily Sales', ne: 'आजको बिक्री' },
  weeklySales: { en: 'Weekly Sales', ne: 'साप्ताहिक बिक्री' },
  monthlySales: { en: 'Monthly Sales', ne: 'मासिक बिक्री' },
  yearlySales: { en: 'Yearly Sales', ne: 'वार्षिक बिक्री' },
  grossProfit: { en: 'Gross Profit', ne: 'कुल नाफा' },
  netProfit: { en: 'Est. Net Profit', ne: 'अनुमानित खुद नाफा' },
  cashCollected: { en: 'Cash Collected', ne: 'नगद संकलन' },
  outstandingCredit: { en: 'Receivables (Credit)', ne: 'उधारो असुली बाँकी' },
  supplierPayable: { en: 'Supplier Payable', ne: 'सप्लायर तिर्न बाँकी' },
  avgTransaction: { en: 'Avg. Bill Value', ne: 'औसत बिल रकम' },
  customerCount: { en: 'Customers', ne: 'ग्राहक संख्या' },
  retailSales: { en: 'Retail Sales', ne: 'खुद्रा बिक्री' },
  wholesaleSales: { en: 'Wholesale Sales', ne: 'होलसेल बिक्री' },
  onlineSales: { en: 'Online / Phone Sales', ne: 'अनलाइन र फोन बिक्री' },
  signOut: { en: 'Sign Out', ne: 'लगआउट' },
  save: { en: 'Save', ne: 'सुरक्षित गर्नुहोस्' },
  cancel: { en: 'Cancel', ne: 'रद्द गर्नुहोस्' },
  search: { en: 'Search', ne: 'खोज्नुहोस्' },
  exportExcel: { en: 'Export Excel', ne: 'एक्सेल डाउनलोड' },
  exportPdf: { en: 'Export PDF', ne: 'PDF डाउनलोड' },
  exportCsv: { en: 'Export CSV', ne: 'CSV डाउनलोड' },
  printA4: { en: 'Print A4', ne: 'A4 प्रिन्ट' },
  printThermal: { en: 'Print 80mm Receipt', ne: 'रसिद प्रिन्ट' },
};

export function t(key: string, lang: Language): string {
  return COMMON_TEXT[key]?.[lang] ?? key;
}
