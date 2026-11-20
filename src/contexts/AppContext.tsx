import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, type User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType, testConnection } from '../lib/firebase';
import { bootstrapUserAndWorkspace, confirmSaleTransaction } from '../lib/erpService';
import { getBsMonthRange, todayBs } from '../lib/bsDate';
import {
  BUSINESS_ID,
  type AuditLog,
  type BusinessSettings,
  type ComboOffer,
  type Customer,
  type CustomerCreditEntry,
  type DayClose,
  type Employee,
  type EmployeeInvite,
  type Expense,
  type GoodsReceipt,
  type Language,
  type ModuleKey,
  type OnlineOrder,
  type Product,
  type PurchaseOrder,
  type SalesInvoice,
  type StockBatch,
  type StockCount,
  type StockLedgerEntry,
  type StockTransfer,
  type Store,
  type Supplier,
  type SupplierPayment,
  type WasteRecord,
} from '../types/erp';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export interface PendingOfflineSale {
  clientRequestId: string;
  createdAtIso: string;
  payload: Parameters<typeof confirmSaleTransaction>[1];
}

interface AppContextValue {
  user: User | null;
  authReady: boolean;
  employee: Employee | null;
  accessDeniedReason: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  language: Language;
  setLanguage: (l: Language) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  activeModule: ModuleKey;
  setActiveModule: (m: ModuleKey) => void;
  selectedStoreId: string;
  setSelectedStoreId: (id: string) => void;
  bsStart: string;
  bsEnd: string;
  setBsRange: (start: string, end: string) => void;
  isOnline: boolean;
  offlineQueue: PendingOfflineSale[];
  queueOfflineSale: (item: PendingOfflineSale) => void;
  syncOfflineSales: () => Promise<void>;
  toasts: ToastMessage[];
  notify: (type: ToastMessage['type'], text: string) => void;
  // Data collections
  settings: BusinessSettings;
  stores: Store[];
  products: Product[];
  stockBatches: StockBatch[];
  stockLedger: StockLedgerEntry[];
  stockCounts: StockCount[];
  customers: Customer[];
  salesInvoices: SalesInvoice[];
  customerCreditLedger: CustomerCreditEntry[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  supplierPayments: SupplierPayment[];
  stockTransfers: StockTransfer[];
  onlineOrders: OnlineOrder[];
  wasteRecords: WasteRecord[];
  expenses: Expense[];
  employees: Employee[];
  employeeInvites: EmployeeInvite[];
  auditLogs: AuditLog[];
  dayCloses: DayClose[];
  comboOffers: ComboOffer[];
  pendingPosCombo: { combo: ComboOffer; packs: number } | null;
  loadComboIntoPos: (combo: ComboOffer, packs?: number) => void;
  clearPendingPosCombo: () => void;
}

const DEFAULT_SETTINGS: BusinessSettings = {
  id: 'global',
  businessId: BUSINESS_ID,
  businessName: 'Bishal Roshni Kirana Pasal',
  businessNameNe: 'बिशाल रोशनी किराना पसल',
  panVatNo: '',
  taxMode: 'vat_13',
  defaultVatRate: 13,
  smallRetailThreshold: 500,
  allowAnonymousRetail: true,
  fiscalYearStartMonth: 4,
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [accessDeniedReason, setAccessDeniedReason] = useState<string | null>(null);

  const [language, setLanguage] = useState<Language>('en');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');

  const currentBs = todayBs();
  const initialRange = getBsMonthRange(currentBs);
  const [bsStart, setBsStart] = useState(initialRange.start);
  const [bsEnd, setBsEnd] = useState(initialRange.end);

  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineQueue, setOfflineQueue] = useState<PendingOfflineSale[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockBatches, setStockBatches] = useState<StockBatch[]>([]);
  const [stockLedger, setStockLedger] = useState<StockLedgerEntry[]>([]);
  const [stockCounts, setStockCounts] = useState<StockCount[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([]);
  const [customerCreditLedger, setCustomerCreditLedger] = useState<CustomerCreditEntry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>([]);
  const [onlineOrders, setOnlineOrders] = useState<OnlineOrder[]>([]);
  const [wasteRecords, setWasteRecords] = useState<WasteRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeInvites, setEmployeeInvites] = useState<EmployeeInvite[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [dayCloses, setDayCloses] = useState<DayClose[]>([]);
  const [comboOffers, setComboOffers] = useState<ComboOffer[]>([]);
  const [pendingPosCombo, setPendingPosCombo] = useState<{ combo: ComboOffer; packs: number } | null>(null);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', next === 'dark');
      return next;
    });
  }, []);

  const setBsRange = useCallback((start: string, end: string) => {
    setBsStart(start);
    setBsEnd(end);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    testConnection();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAccessDeniedReason(null);
      if (u) {
        try {
          const emp = await bootstrapUserAndWorkspace(u);
          if (!emp || !emp.active) {
            setEmployee(null);
            setAccessDeniedReason(
              `Account ${u.email} is not yet authorized in Bishal Roshni Kirana Pasal ERP. Ask the Owner to invite this email in the Employees module.`
            );
          } else {
            setEmployee(emp);
            if (emp.storeId && emp.role !== 'owner') {
              setSelectedStoreId(emp.storeId);
            }
          }
        } catch (err) {
          setAccessDeniedReason(err instanceof Error ? err.message : 'Unable to verify staff profile.');
          setEmployee(null);
        }
      } else {
        setEmployee(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Real-time Firestore listeners once authenticated and authorized
  useEffect(() => {
    if (!authReady || !employee) return;

    const bizFilter = where('businessId', '==', BUSINESS_ID);
    const unsubs: Array<() => void> = [];

    const listen = <T extends { id: string }>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>
    ) => {
      const q = query(collection(db, colName), bizFilter);
      const u = onSnapshot(
        q,
        (snap) => {
          setter(snap.docs.map((d) => ({ id: d.id, ...d.data() } as T)));
        },
        (error) => handleFirestoreError(error, OperationType.LIST, colName)
      );
      unsubs.push(u);
    };

    listen<Store>('stores', setStores);
    listen<Product>('products', setProducts);
    listen<StockBatch>('stockBatches', setStockBatches);
    listen<StockLedgerEntry>('stockLedger', setStockLedger);
    listen<StockCount>('stockCounts', setStockCounts);
    listen<Customer>('customers', setCustomers);
    listen<SalesInvoice>('salesInvoices', setSalesInvoices);
    listen<CustomerCreditEntry>('customerCreditLedger', setCustomerCreditLedger);
    listen<Supplier>('suppliers', setSuppliers);
    listen<PurchaseOrder>('purchaseOrders', setPurchaseOrders);
    listen<GoodsReceipt>('goodsReceipts', setGoodsReceipts);
    listen<SupplierPayment>('supplierPayments', setSupplierPayments);
    listen<StockTransfer>('stockTransfers', setStockTransfers);
    listen<OnlineOrder>('onlineOrders', setOnlineOrders);
    listen<WasteRecord>('wasteRecords', setWasteRecords);
    listen<Expense>('expenses', setExpenses);
    listen<Employee>('employees', setEmployees);
    listen<AuditLog>('auditLogs', setAuditLogs);
    listen<DayClose>('dayCloses', setDayCloses);
    listen<ComboOffer>('comboOffers', setComboOffers);

    if (employee.role === 'owner') {
      listen<EmployeeInvite>('employeeInvites', setEmployeeInvites);
    }

    const unsubSettings = onSnapshot(
      query(collection(db, 'settings'), bizFilter),
      (snap) => {
        if (!snap.empty) {
          const d = snap.docs[0];
          setSettings({ id: d.id, ...(d.data() as Omit<BusinessSettings, 'id'>) });
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'settings')
    );
    unsubs.push(unsubSettings);

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authReady, employee]);

  const queueOfflineSale = useCallback(
    (item: PendingOfflineSale) => {
      setOfflineQueue((prev) => [...prev, item]);
      notify('info', 'Offline mode: sale queued with idempotency key for automatic sync.');
    },
    [notify]
  );

  const syncOfflineSales = useCallback(async () => {
    if (!employee || offlineQueue.length === 0 || !isOnline) return;
    const remaining: PendingOfflineSale[] = [];
    let syncedCount = 0;
    for (const item of offlineQueue) {
      try {
        await confirmSaleTransaction(employee, { ...item.payload, allBatches: stockBatches });
        syncedCount++;
      } catch {
        remaining.push(item);
      }
    }
    setOfflineQueue(remaining);
    if (syncedCount > 0) {
      notify('success', `Synchronized ${syncedCount} queued offline sale(s) safely.`);
    }
  }, [employee, offlineQueue, isOnline, stockBatches, notify]);

  useEffect(() => {
    if (isOnline && offlineQueue.length > 0 && employee) {
      syncOfflineSales();
    }
  }, [isOnline, offlineQueue.length, employee, syncOfflineSales]);

  const signIn = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
    setEmployee(null);
  }, []);

  const loadComboIntoPos = useCallback((combo: ComboOffer, packs = 1) => {
    setPendingPosCombo({ combo, packs: Math.max(1, packs) });
    setActiveModule('sales');
  }, []);

  const clearPendingPosCombo = useCallback(() => {
    setPendingPosCombo(null);
  }, []);

  return (
    <AppContext.Provider
      value={{
        user,
        authReady,
        employee,
        accessDeniedReason,
        signIn,
        signOut,
        language,
        setLanguage,
        theme,
        toggleTheme,
        activeModule,
        setActiveModule,
        selectedStoreId,
        setSelectedStoreId,
        bsStart,
        bsEnd,
        setBsRange,
        isOnline,
        offlineQueue,
        queueOfflineSale,
        syncOfflineSales,
        toasts,
        notify,
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
        employeeInvites,
        auditLogs,
        dayCloses,
        comboOffers,
        pendingPosCombo,
        loadComboIntoPos,
        clearPendingPosCombo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
