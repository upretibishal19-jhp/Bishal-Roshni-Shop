import { useMemo, useState } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { UserPlus, Shield, History, Trash2, Edit2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { appendAuditLog, inviteOrUpdateEmployee } from '../lib/erpService';
import { formatBsDate } from '../lib/bsDate';
import { exportToCsv } from '../lib/exportUtils';
import {
  DEFAULT_ROLE_PERMISSIONS,
  type Employee,
  type EmployeeInvite,
  type EmployeeRole,
  type RolePermissions,
} from '../types/erp';

const ROLE_OPTIONS: Array<{ value: EmployeeRole; label: string }> = [
  { value: 'owner', label: 'Owner (Super Admin)' },
  { value: 'store_manager', label: 'Store Manager' },
  { value: 'cashier', label: 'Cashier / Billing' },
  { value: 'inventory_controller', label: 'Inventory Controller' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'delivery_staff', label: 'Delivery Staff' },
];

const PERMISSION_META: Array<{ key: keyof RolePermissions; label: string }> = [
  { key: 'canViewPurchasePrice', label: 'View Purchase Cost & Margins' },
  { key: 'canViewProfitReports', label: 'View Gross/Net Profit Reports' },
  { key: 'canManageExpenses', label: 'Record & Manage Expenses' },
  { key: 'canManageCredit', label: 'Manage Customer Credit & Udharo' },
  { key: 'canApproveStockAdjustments', label: 'Approve Weekly Stock Counts' },
  { key: 'canManageUsers', label: 'Manage Staff & Permissions' },
  { key: 'canViewFinancialRecords', label: 'View Financial & Tax Ledgers' },
  { key: 'canReverseSales', label: 'Reverse Confirmed Sales Invoices' },
];

export function EmployeesView() {
  const { employees, employeeInvites, stores, auditLogs, employee, notify, language } = useApp();
  const [tab, setTab] = useState<'staff' | 'audit'>('staff');

  const [showForm, setShowForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<EmployeeRole>('cashier');
  const [storeId, setStoreId] = useState('');
  const [permissions, setPermissions] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS.cashier);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const [auditQuery, setAuditQuery] = useState('');

  const isOwner = employee?.role === 'owner';

  const openNewInvite = () => {
    setEditingEmp(null);
    setEmail('');
    setDisplayName('');
    setPhone('');
    setRole('cashier');
    setStoreId(stores[0]?.id || '');
    setPermissions({ ...DEFAULT_ROLE_PERMISSIONS.cashier });
    setActive(true);
    setShowForm(true);
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmp(emp);
    setEmail(emp.email);
    setDisplayName(emp.displayName);
    setPhone(emp.phone || '');
    setRole(emp.role);
    setStoreId(emp.storeId || '');
    setPermissions({ ...emp.permissions });
    setActive(emp.active);
    setShowForm(true);
  };

  const openEditInvite = (inv: EmployeeInvite) => {
    setEditingEmp(null);
    setEmail(inv.emailLower);
    setDisplayName(inv.displayName);
    setPhone(inv.phone || '');
    setRole(inv.role);
    setStoreId(inv.storeId || '');
    setPermissions({ ...inv.permissions });
    setActive(inv.active);
    setShowForm(true);
  };

  const handleRoleChange = (nextRole: EmployeeRole) => {
    setRole(nextRole);
    if (!editingEmp) {
      setPermissions({ ...DEFAULT_ROLE_PERMISSIONS[nextRole] });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    if (!isOwner) {
      notify('error', 'Only the Owner can create or modify staff profiles and invites.');
      return;
    }
    setBusy(true);
    try {
      await inviteOrUpdateEmployee(employee, {
        existingEmployee: editingEmp || undefined,
        email,
        displayName,
        phone,
        role,
        storeId: storeId || undefined,
        permissions,
        active,
      });
      notify(
        'success',
        editingEmp
          ? `Updated permissions for ${displayName}.`
          : `Saved Google sign-in invite for ${email.toLowerCase()}.`
      );
      setShowForm(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save staff record.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteInvite = async (inv: EmployeeInvite) => {
    if (!employee || !isOwner) return;
    try {
      await deleteDoc(doc(db, 'employeeInvites', inv.id));
      await appendAuditLog(
        employee,
        'DELETE_INVITE',
        'employee_invite',
        inv.id,
        `Revoked pending invite for ${inv.emailLower}`
      );
      notify('success', `Revoked invite for ${inv.emailLower}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `employeeInvites/${inv.id}`);
    }
  };

  const filteredLogs = useMemo(() => {
    const q = auditQuery.trim().toLowerCase();
    return [...auditLogs]
      .sort((a, b) => b.bsDate.localeCompare(a.bsDate) || b.id.localeCompare(a.id))
      .filter((log) => {
        if (!q) return true;
        return (
          log.actorEmail.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          log.entityType.toLowerCase().includes(q) ||
          log.summary.toLowerCase().includes(q)
        );
      })
      .slice(0, 150);
  }, [auditLogs, auditQuery]);

  const storeName = (id?: string) => {
    if (!id) return 'All Stores';
    const st = stores.find((s) => s.id === id);
    return st ? `${st.code} · ${st.name}` : id;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('staff')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
              tab === 'staff'
                ? 'bg-teal-700 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Staff &amp; Role Access ({employees.length})
          </button>
          <button
            onClick={() => setTab('audit')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
              tab === 'audit'
                ? 'bg-teal-700 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Audit Logs ({auditLogs.length})
          </button>
        </div>

        {tab === 'staff' && isOwner && (
          <button
            onClick={openNewInvite}
            className="px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite Staff by Google Email
          </button>
        )}
      </div>

      {tab === 'staff' && (
        <>
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
            >
              <div className="text-sm font-semibold">
                {editingEmp ? `Edit Staff: ${editingEmp.displayName}` : 'Invite Staff Member (Google Sign-In)'}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="space-y-1 block">
                  <span className="text-slate-600 dark:text-slate-400">Google Email *</span>
                  <input
                    required
                    type="email"
                    disabled={Boolean(editingEmp)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@gmail.com"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-60"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-slate-600 dark:text-slate-400">Full Name *</span>
                  <input
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Sita Adhikari"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-slate-600 dark:text-slate-400">Mobile / Phone</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="98XXXXXXXX"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-slate-600 dark:text-slate-400">Role *</span>
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value as EmployeeRole)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 block">
                  <span className="text-slate-600 dark:text-slate-400">Assigned Store</span>
                  <select
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="">All Stores (Central Access)</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  <span>Account Active</span>
                </label>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Granular Role Permissions
                  </span>
                  <button
                    type="button"
                    onClick={() => setPermissions({ ...DEFAULT_ROLE_PERMISSIONS[role] })}
                    className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    Reset to Role Defaults
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {PERMISSION_META.map((pm) => (
                    <label
                      key={pm.key}
                      className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={permissions[pm.key]}
                        onChange={(e) =>
                          setPermissions((prev) => ({ ...prev, [pm.key]: e.target.checked }))
                        }
                      />
                      <span>{pm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-teal-700 text-white font-medium cursor-pointer disabled:opacity-50"
                >
                  {busy ? 'Saving...' : editingEmp ? 'Update Employee' : 'Save Staff Invite'}
                </button>
              </div>
            </form>
          )}

          {/* Active Employees Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
              Authorized Staff Accounts
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Staff Name</th>
                    <th className="text-left px-4 py-2.5 font-medium">Google Email</th>
                    <th className="text-left px-4 py-2.5 font-medium">Role</th>
                    <th className="text-left px-4 py-2.5 font-medium">Store Scope</th>
                    <th className="text-left px-4 py-2.5 font-medium">Permissions</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    {isOwner && <th className="text-right px-4 py-2.5 font-medium">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {employees.map((emp) => {
                    const enabledCount = Object.values(emp.permissions).filter(Boolean).length;
                    return (
                      <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{emp.displayName}</div>
                          {emp.phone && <div className="font-mono text-slate-500">{emp.phone}</div>}
                        </td>
                        <td className="px-4 py-2.5 font-mono">{emp.email}</td>
                        <td className="px-4 py-2.5 capitalize">{emp.role.replace('_', ' ')}</td>
                        <td className="px-4 py-2.5">{storeName(emp.storeId)}</td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {enabledCount} / 8 enabled
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={emp.active ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-red-600'}>
                            {emp.active ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        {isOwner && (
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => openEditEmployee(emp)}
                              className="text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" /> Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pending Invites */}
          {isOwner && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-semibold">Pending Google Email Invites</span>
                <span className="text-xs text-slate-500">
                  Staff gain access automatically upon signing in with their invited Google account
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Invited Email</th>
                      <th className="text-left px-4 py-2.5 font-medium">Display Name</th>
                      <th className="text-left px-4 py-2.5 font-medium">Role</th>
                      <th className="text-left px-4 py-2.5 font-medium">Store</th>
                      <th className="text-left px-4 py-2.5 font-medium">Status</th>
                      <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {employeeInvites.map((inv) => (
                      <tr key={inv.id}>
                        <td className="px-4 py-2.5 font-mono">{inv.emailLower}</td>
                        <td className="px-4 py-2.5">{inv.displayName}</td>
                        <td className="px-4 py-2.5 capitalize">{inv.role.replace('_', ' ')}</td>
                        <td className="px-4 py-2.5">{storeName(inv.storeId)}</td>
                        <td className="px-4 py-2.5">
                          <span className={inv.active ? 'text-emerald-700' : 'text-slate-500'}>
                            {inv.active ? 'Ready' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right space-x-3">
                          <button
                            onClick={() => openEditInvite(inv)}
                            className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteInvite(inv)}
                            className="text-red-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" /> Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                    {employeeInvites.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                          No pending email invites. Click &ldquo;Invite Staff by Google Email&rdquo; to authorize cashiers, store managers, or accountants.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'audit' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold">Immutable Security &amp; ERP Audit Trail</span>
            <div className="flex items-center gap-2">
              <input
                value={auditQuery}
                onChange={(e) => setAuditQuery(e.target.value)}
                placeholder="Filter by email, action, entity..."
                className="h-8 w-64 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
              <button
                onClick={() =>
                  exportToCsv(
                    'ERP_Audit_Logs',
                    ['BS Date', 'Actor Email', 'Role', 'Action', 'Entity Type', 'Entity ID', 'Summary'],
                    filteredLogs.map((l) => [
                      l.bsDate,
                      l.actorEmail,
                      l.actorRole,
                      l.action,
                      l.entityType,
                      l.entityId,
                      l.summary,
                    ])
                  )
                }
                className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Export CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">BS Date</th>
                  <th className="text-left px-4 py-2 font-medium">Actor</th>
                  <th className="text-left px-4 py-2 font-medium">Role</th>
                  <th className="text-left px-4 py-2 font-medium">Action</th>
                  <th className="text-left px-4 py-2 font-medium">Entity</th>
                  <th className="text-left px-4 py-2 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2 font-mono whitespace-nowrap">
                      {formatBsDate(log.bsDate, language)}
                    </td>
                    <td className="px-4 py-2 font-mono">{log.actorEmail}</td>
                    <td className="px-4 py-2 capitalize">{log.actorRole.replace('_', ' ')}</td>
                    <td className="px-4 py-2 font-mono font-medium">{log.action}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {log.entityType} · <span className="font-mono">{log.entityId.slice(0, 14)}</span>
                    </td>
                    <td className="px-4 py-2">{log.summary}</td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      No audit log entries match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
