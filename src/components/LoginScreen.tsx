import { useState } from 'react';
import { Store, ShieldCheck, LogOut } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export function LoginScreen() {
  const { user, signIn, signOut, accessDeniedReason } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSignIn = async () => {
    setBusy(true);
    setErr(null);
    try {
      await signIn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign-in cancelled or failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 space-y-6">
        <div className="space-y-2">
          <div className="w-11 h-11 rounded-lg bg-teal-700 text-white flex items-center justify-center">
            <Store className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Bishal Roshni Kirana Pasal
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Multi-Store Supermarket, Wholesale & Inventory ERP · Bikram Sambat Accounting
          </p>
        </div>

        {(accessDeniedReason || err) && (
          <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300 space-y-2">
            <p>{accessDeniedReason || err}</p>
            {user && (
              <button
                onClick={signOut}
                className="inline-flex items-center gap-1.5 text-xs font-medium underline hover:no-underline"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out ({user.email})
              </button>
            )}
          </div>
        )}

        {!user && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
              <span>
                Protected by role-based multi-store access. Sign in with your authorized Google account to access POS, inventory, and financial ledgers.
              </span>
            </div>

            <button
              onClick={handleSignIn}
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-medium text-sm transition-colors disabled:opacity-60 cursor-pointer"
            >
              {busy ? 'Authenticating...' : 'Sign in with Google'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
