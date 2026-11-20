import { Menu, Plus, Sun, Moon, LogOut, RefreshCw } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { NAV_LABELS, t } from '../lib/i18n';
import { formatBsDate, todayBs } from '../lib/bsDate';

export function TopBar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const {
    activeModule,
    setActiveModule,
    language,
    setLanguage,
    theme,
    toggleTheme,
    stores,
    selectedStoreId,
    setSelectedStoreId,
    bsStart,
    bsEnd,
    setBsRange,
    employee,
    signOut,
    isOnline,
    offlineQueue,
    syncOfflineSales,
  } = useApp();

  return (
    <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4 shrink-0 no-print">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          aria-label="Open menu"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex items-center gap-2 text-sm">
          <span className="font-display font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap truncate">
            {NAV_LABELS[activeModule][language]}
          </span>
          <span className="hidden sm:inline text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="hidden sm:inline font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {formatBsDate(todayBs(), language)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {offlineQueue.length > 0 && (
          <button
            onClick={syncOfflineSales}
            disabled={!isOnline}
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync ({offlineQueue.length})
          </button>
        )}

        <select
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          disabled={Boolean(employee && employee.role !== 'owner' && employee.storeId)}
          aria-label="Store filter"
          className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[160px]"
        >
          <option value="all">{t('allStores', language)}</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
        </select>

        <div className="hidden xl:flex items-center gap-1.5">
          <input
            type="text"
            value={bsStart}
            onChange={(e) => setBsRange(e.target.value, bsEnd)}
            placeholder="YYYY-MM-DD"
            aria-label="BS Start Date"
            className="h-9 w-28 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs text-slate-700 dark:text-slate-200"
          />
          <span className="text-xs text-slate-400">–</span>
          <input
            type="text"
            value={bsEnd}
            onChange={(e) => setBsRange(bsStart, e.target.value)}
            placeholder="YYYY-MM-DD"
            aria-label="BS End Date"
            className="h-9 w-28 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs text-slate-700 dark:text-slate-200"
          />
        </div>

        <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setLanguage('en')}
            className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              language === 'en'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage('ne')}
            className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              language === 'ne'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            ने
          </button>
        </div>

        <button
          onClick={toggleTheme}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

        <button
          onClick={() => setActiveModule('sales')}
          className="h-9 px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('newSale', language)}</span>
        </button>

        <button
          onClick={signOut}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-600 cursor-pointer"
          title={t('signOut', language)}
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
