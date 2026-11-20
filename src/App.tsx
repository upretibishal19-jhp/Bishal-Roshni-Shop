import { useState } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardView } from './modules/DashboardView';
import { StoresView } from './modules/StoresView';
import { ProductsView } from './modules/ProductsView';
import { InventoryView } from './modules/InventoryView';
import { StockCountView } from './modules/StockCountView';
import { SalesView } from './modules/SalesView';
import { ComboOffersView } from './modules/ComboOffersView';
import { DayCloseView } from './modules/DayCloseView';
import { OrdersView } from './modules/OrdersView';
import { InvoicesView } from './modules/InvoicesView';
import { CustomersView } from './modules/CustomersView';
import { CreditManagementView } from './modules/CreditManagementView';
import { SuppliersView } from './modules/SuppliersView';
import { PurchasesView } from './modules/PurchasesView';
import { TransfersView } from './modules/TransfersView';
import { ExpiryDamageView } from './modules/ExpiryDamageView';
import { ExpensesView } from './modules/ExpensesView';
import { ReportsView } from './modules/ReportsView';
import { EmployeesView } from './modules/EmployeesView';
import { SettingsView } from './modules/SettingsView';

function AppShell() {
  const { user, authReady, employee, activeModule, toasts } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 text-sm">
        Initializing Bishal Roshni Kirana Pasal ERP...
      </div>
    );
  }

  if (!user || !employee) {
    return <LoginScreen />;
  }

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <DashboardView />;
      case 'stores':
        return <StoresView />;
      case 'products':
        return <ProductsView />;
      case 'inventory':
        return <InventoryView />;
      case 'stock_count':
        return <StockCountView />;
      case 'sales':
        return <SalesView />;
      case 'combo_offers':
        return <ComboOffersView />;
      case 'day_close':
        return <DayCloseView />;
      case 'orders':
        return <OrdersView />;
      case 'invoices':
        return <InvoicesView />;
      case 'customers':
        return <CustomersView />;
      case 'credit_management':
        return <CreditManagementView />;
      case 'suppliers':
        return <SuppliersView />;
      case 'purchases':
        return <PurchasesView />;
      case 'stock_transfers':
        return <TransfersView />;
      case 'expiry_damage':
        return <ExpiryDamageView />;
      case 'expenses':
        return <ExpensesView />;
      case 'reports':
        return <ReportsView />;
      case 'employees':
        return <EmployeesView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">{renderModule()}</main>
      </div>

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm no-print">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-2.5 rounded-lg text-xs font-medium shadow-lg border ${
                toast.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800'
                  : toast.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                    : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              {toast.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ErrorBoundary>
  );
}
