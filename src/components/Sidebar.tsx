import {
  LayoutDashboard,
  Store,
  Package,
  Boxes,
  ClipboardCheck,
  ShoppingCart,
  Globe,
  FileText,
  Users,
  CreditCard,
  Truck,
  ShoppingBag,
  ArrowLeftRight,
  AlertTriangle,
  Receipt,
  BarChart3,
  UserCog,
  Settings,
  CalendarCheck2,
  Gift,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { NAV_LABELS } from '../lib/i18n';
import type { ModuleKey } from '../types/erp';

const NAV_ITEMS: Array<{ key: ModuleKey; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'dashboard', icon: LayoutDashboard },
  { key: 'stores', icon: Store },
  { key: 'products', icon: Package },
  { key: 'inventory', icon: Boxes },
  { key: 'stock_count', icon: ClipboardCheck },
  { key: 'sales', icon: ShoppingCart },
  { key: 'combo_offers', icon: Gift },
  { key: 'day_close', icon: CalendarCheck2 },
  { key: 'orders', icon: Globe },
  { key: 'invoices', icon: FileText },
  { key: 'customers', icon: Users },
  { key: 'credit_management', icon: CreditCard },
  { key: 'suppliers', icon: Truck },
  { key: 'purchases', icon: ShoppingBag },
  { key: 'stock_transfers', icon: ArrowLeftRight },
  { key: 'expiry_damage', icon: AlertTriangle },
  { key: 'expenses', icon: Receipt },
  { key: 'reports', icon: BarChart3 },
  { key: 'employees', icon: UserCog },
  { key: 'settings', icon: Settings },
];

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { activeModule, setActiveModule, language, employee, settings } = useApp();

  const canAccess = (mod: ModuleKey): boolean => {
    if (!employee) return false;
    if (employee.role === 'owner') return true;
    const p = employee.permissions;
    switch (mod) {
      case 'employees':
        return p.canManageUsers;
      case 'expenses':
        return p.canManageExpenses;
      case 'credit_management':
        return p.canManageCredit;
      case 'reports':
        return p.canViewProfitReports || p.canViewFinancialRecords || employee.role === 'store_manager';
      case 'day_close':
        return ['store_manager', 'cashier', 'accountant'].includes(employee.role);
      case 'settings':
        return false;
      default:
        return true;
    }
  };

  const navContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 w-64 border-r border-slate-800">
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800 shrink-0">
        <span className="font-display font-bold text-sm tracking-tight text-white truncate">
          {language === 'ne' ? settings.businessNameNe || settings.businessName : settings.businessName}
        </span>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {NAV_ITEMS.filter((item) => canAccess(item.key)).map((item, idx) => {
          const Icon = item.icon;
          const active = activeModule === item.key;
          return (
            <button
              key={item.key}
              onClick={() => {
                setActiveModule(item.key);
                onClose();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-teal-700 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {String(idx + 1).padStart(2, '0')}. {NAV_LABELS[item.key][language]}
              </span>
            </button>
          );
        })}
      </nav>

      {employee && (
        <div className="p-3.5 border-t border-slate-800 text-xs text-slate-400 space-y-0.5 shrink-0">
          <div className="font-medium text-slate-200 truncate">{employee.displayName}</div>
          <div className="capitalize text-slate-400 truncate">
            {employee.role.replace('_', ' ')}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 no-print">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="fixed inset-0 bg-slate-950/60" onClick={onClose} />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
}
