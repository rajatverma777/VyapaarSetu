import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { Plus, Edit2, Trash2, Users, BookOpen, RefreshCw, LayoutGrid, List, Phone, ShieldCheck, MapPin, AlertCircle, CheckCircle2, IndianRupee } from 'lucide-react'
import toast from 'react-hot-toast'
import { customerAPI, reportAPI } from '../services/api'
import {
  Modal, ConfirmDialog, Pagination, EmptyState,
  SearchInput, LoadingScreen, TableSkeleton, Amount, FormField, StatusBadge, Spinner
} from '../components/ui'
import { format } from 'date-fns'
import { INDIAN_STATES } from '../services/constants'

const EMPTY = {
  name: '', mobile: '', email: '', gstin: '',
  address: { street: '', city: '', state: '', pincode: '' },
  credit_limit: 0, opening_balance: 0, price_level: 'retail', is_active: true
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [viewMode, setViewMode]   = useState('grid')
  const [filterDuesOnly, setFilterDuesOnly] = useState(false)
  const [outstandingStats, setOutstandingStats] = useState({ parties: [], total_outstanding: 0 })

  const [showForm, setShowForm]         = useState(false)
  const [editItem, setEditItem]         = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [saving, setSaving]             = useState(false)
  const [form, setForm]                 = useState(EMPTY)

  const [ledgerModal, setLedgerModal]   = useState(null)
  const [ledger, setLedger]             = useState(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)

  const limit = 50

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await customerAPI.list({ search: search || undefined, page, limit })
      setCustomers(data.items)
      setTotal(data.total)
    } catch { toast.error('Failed to load customers') }
    finally { setLoading(false) }
  }

  const loadStats = async () => {
    try {
      const { data } = await reportAPI.outstanding({ party_type: 'customer' })
      setOutstandingStats(data || { parties: [], total_outstanding: 0 })
    } catch {}
  }

  useEffect(() => { load() }, [search, page])
  useEffect(() => { loadStats() }, [])

  const openAdd = () => { setForm(EMPTY); setEditItem(null); setShowForm(true) }
  const openEdit = (c) => {
    setForm({
      name: c.name, mobile: c.mobile || '', email: c.email || '',
      gstin: c.gstin || '',
      address: c.address || { street: '', city: '', state: '', pincode: '' },
      credit_limit: c.credit_limit || 0, opening_balance: 0,
      price_level: c.price_level || 'retail', is_active: c.is_active
    })
    setEditItem(c)
    setShowForm(true)
  }

  const openLedger = async (c) => {
    setLedgerModal(c)
    setLedgerLoading(true)
    try {
      const { data } = await customerAPI.ledger(c.id)
      setLedger(data)
    } catch { toast.error('Failed to load ledger') }
    finally { setLedgerLoading(false) }
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setAddr = (k, v) => setForm(f => ({ ...f, address: { ...f.address, [k]: v } }))

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Customer name required')
    setSaving(true)
    try {
      if (editItem) {
        await customerAPI.update(editItem.id, form)
        toast.success('Customer updated')
      } else {
        await customerAPI.create(form)
        toast.success('Customer created')
      }
      setShowForm(false)
      load()
      loadStats()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try {
      await customerAPI.delete(id)
      toast.success('Customer deleted')
      load()
      loadStats()
    } catch { toast.error('Delete failed') }
  }

  const displayedCustomers = filterDuesOnly
    ? customers.filter(c => (c.current_balance || 0) > 0)
    : customers

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="page-title">Customers</h1>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={16} /> Add Customer
        </button>
      </div>

      {/* Customer KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Customers</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 dark:border-blue-400/25">
              <Users size={16} className="text-[#0071e3] dark:text-[#0a84ff]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {total}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">Registered buyer accounts</p>
          </div>
        </div>

        <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Receivables</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-500/10 dark:bg-amber-400/15 border border-amber-500/20 dark:border-amber-400/25">
              <IndianRupee size={16} className="text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              <Amount value={outstandingStats.total_outstanding || 0} />
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">Pending payments to collect</p>
          </div>
        </div>

        <div 
          onClick={() => setFilterDuesOnly(prev => !prev)}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group select-none ${
            filterDuesOnly ? 'ring-2 ring-amber-500/40 border-amber-500/50 bg-amber-500/[0.04]' : ''
          }`}
          title="Click to toggle filter for customers with dues"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pending Dues</span>
              {filterDuesOnly && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-rose-500/10 dark:bg-rose-400/15 border border-rose-500/20 dark:border-rose-400/25 group-hover:scale-105 transition-transform">
              <AlertCircle size={16} className="text-rose-600 dark:text-rose-400" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {(outstandingStats.parties || []).length}
            </div>
            <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-1 font-medium">
              {filterDuesOnly ? 'Filter active (click to clear)' : 'Click to filter list'}
            </p>
          </div>
        </div>

        <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Active Accounts</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-400/15 border border-emerald-500/20 dark:border-emerald-400/25">
              <CheckCircle2 size={16} className="text-[#34c759] dark:text-[#30d158]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-[#34c759] dark:text-[#30d158]">
              {customers.filter(c => c.is_active).length}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">Enabled for transactions</p>
          </div>
        </div>
      </div>

      {/* Filters & View Switcher */}
      <div className="filter-glass-bar">
        <SearchInput
          value={search}
          onChange={v => { setSearch(v); setPage(1) }}
          placeholder="Search name, mobile, GSTIN…"
          className="flex-1 min-w-[200px]"
        />

        {/* Dues Only Filter Pill */}
        <button
          type="button"
          onClick={() => setFilterDuesOnly(v => !v)}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold transition-all duration-200 border cursor-pointer ${
            filterDuesOnly
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400 shadow-sm ring-2 ring-amber-500/20'
              : 'bg-white/40 dark:bg-white/5 border-black/5 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10'
          }`}
          title={filterDuesOnly ? "Showing only customers with outstanding dues" : "Filter customers with dues"}
        >
          <span className={`w-2 h-2 rounded-full transition-colors ${filterDuesOnly ? 'bg-amber-500 animate-pulse' : 'bg-gray-400 dark:bg-gray-500'}`} />
          <span>With Dues</span>
          {(outstandingStats.parties || []).length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${filterDuesOnly ? 'bg-amber-500 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
              {(outstandingStats.parties || []).length}
            </span>
          )}
        </button>

        {/* View Mode Toggle: Cards vs Table */}
        <div className="flex items-center p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.08]">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-white dark:bg-white/15 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
            title="Card Grid View"
          >
            <LayoutGrid size={14} />
            <span className="hidden sm:inline">Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-white dark:bg-white/15 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
            title="Table View"
          >
            <List size={14} />
            <span className="hidden sm:inline">Table</span>
          </button>
        </div>

        <button onClick={() => { load(); loadStats() }} className="filter-icon-glass" title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Main Content: Card Grid or Table View */}
      {viewMode === 'grid' ? (
        <div>
          {loading && displayedCustomers.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="card p-5 animate-pulse space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-black/[0.05] dark:bg-white/[0.05]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-black/[0.05] dark:bg-white/[0.05] rounded w-3/4" />
                      <div className="h-3 bg-black/[0.05] dark:bg-white/[0.05] rounded w-1/3" />
                    </div>
                  </div>
                  <div className="h-16 bg-black/[0.03] dark:bg-white/[0.03] rounded-xl" />
                </div>
              ))}
            </div>
          ) : displayedCustomers.length === 0 ? (
            <div className="card p-8">
              <EmptyState
                icon={Users}
                title={filterDuesOnly ? "No customers with outstanding dues" : "No customers found"}
                description={filterDuesOnly ? "All customers have zero pending balance!" : "Add your first customer to get started"}
                action={!filterDuesOnly && <button onClick={openAdd} className="btn-primary">Add Customer</button>}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayedCustomers.map(c => (
                <div 
                  key={c.id} 
                  className="card p-5 flex flex-col justify-between hover:border-blue-500/30 transition-all duration-300 group"
                >
                  <div>
                    {/* Card Header: Avatar Initial + Name & Status */}
                    <div className="flex items-start justify-between gap-3 mb-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-base bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 border border-[#0071e3]/20 dark:border-[#0a84ff]/25 text-[#0071e3] dark:text-[#0a84ff] shadow-sm flex-shrink-0 group-hover:scale-105 transition-transform">
                          {c.name ? c.name.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-white text-base leading-tight truncate group-hover:text-[#0071e3] dark:group-hover:text-[#0a84ff] transition-colors" title={c.name}>
                            {c.name}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 border border-black/[0.05] dark:border-white/[0.08]">
                              {c.price_level || 'retail'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <StatusBadge status={c.is_active ? 'active' : 'inactive'} />
                    </div>

                    {/* Contact Information */}
                    <div className="space-y-2 py-3 border-y border-black/[0.05] dark:border-white/[0.06] text-xs">
                      <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                        <span className="flex items-center gap-1.5">
                          <Phone size={13} className="text-gray-400" />
                          Mobile
                        </span>
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {c.mobile || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                        <span className="flex items-center gap-1.5">
                          <ShieldCheck size={13} className="text-gray-400" />
                          GSTIN
                        </span>
                        <span className="font-mono text-[11px] text-gray-700 dark:text-gray-300 bg-black/[0.03] dark:bg-white/[0.05] px-1.5 py-0.5 rounded border border-black/[0.03] dark:border-white/[0.04]">
                          {c.gstin || 'Unregistered'}
                        </span>
                      </div>
                      {(c.address?.city || c.address?.state) && (
                        <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                          <span className="flex items-center gap-1.5">
                            <MapPin size={13} className="text-gray-400" />
                            Location
                          </span>
                          <span className="text-gray-700 dark:text-gray-300 truncate max-w-[150px]">
                            {[c.address?.city, c.address?.state].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Balance & Limit Strip */}
                    <div className="mt-3.5">
                      <div className="bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06] rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block mb-0.5">
                            Current Balance
                          </span>
                          <div className={`text-base font-bold ${c.current_balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-[#34c759] dark:text-[#30d158]'}`}>
                            <Amount value={c.current_balance || 0} />
                          </div>
                        </div>
                        {c.credit_limit > 0 && (
                          <div className="text-right">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block mb-0.5">
                              Credit Limit
                            </span>
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                              <Amount value={c.credit_limit} />
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="mt-4 flex items-center justify-between pt-3 border-t border-black/[0.04] dark:border-white/[0.05]">
                    <button
                      onClick={() => openLedger(c)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#0071e3] dark:text-[#0a84ff] bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 hover:bg-[#0071e3]/20 dark:hover:bg-[#0a84ff]/25 transition-colors cursor-pointer"
                    >
                      <BookOpen size={13} /> Ledger
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        className="btn-icon text-gray-600 dark:text-gray-300 hover:text-[#0071e3] dark:hover:text-[#0a84ff]"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="btn-icon text-gray-400 hover:text-rose-500"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Pagination page={page} total={total} limit={limit} onChange={setPage} />
        </div>
      ) : (
        /* Table View */
        <div className="relative">
          <div className="table-container relative overflow-hidden">
            {loading && displayedCustomers.length > 0 && (
              <div className="table-loading-bar-container">
                <div className="table-loading-bar" />
              </div>
            )}
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Mobile</th>
                  <th>GSTIN</th>
                  <th>Price Level</th>
                  <th className="text-right">Credit Limit</th>
                  <th className="text-right">Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && displayedCustomers.length === 0 ? (
                  <tr><td colSpan={8} className="p-0"><TableSkeleton rows={8} cols={8} /></td></tr>
                ) : displayedCustomers.length === 0 ? (
                  <tr><td colSpan={8}>
                    <EmptyState icon={Users} title="No customers found"
                      action={<button onClick={openAdd} className="btn-primary">Add Customer</button>}
                    />
                  </td></tr>
                ) : displayedCustomers.map(c => (
                  <tr key={c.id} className="animate-fade-in">
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 border border-[#0071e3]/20 dark:border-[#0a84ff]/25 text-[#0071e3] dark:text-[#0a84ff] flex-shrink-0">
                          {c.name ? c.name.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white text-sm">{c.name}</p>
                          {c.email && <p className="text-[11px] text-gray-400">{c.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="text-xs text-gray-600 dark:text-gray-400">{c.mobile || '—'}</td>
                    <td>
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-300 bg-black/[0.03] dark:bg-white/[0.05] px-1.5 py-0.5 rounded border border-black/[0.03] dark:border-white/[0.04]">
                        {c.gstin || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 border border-black/[0.05] dark:border-white/[0.08]">
                        {c.price_level || 'retail'}
                      </span>
                    </td>
                    <td className="text-right text-xs"><Amount value={c.credit_limit} /></td>
                    <td className="text-right text-xs">
                      {c.current_balance > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          <Amount value={c.current_balance} />
                        </span>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400 font-medium">
                          <Amount value={0} />
                        </span>
                      )}
                    </td>
                    <td><StatusBadge status={c.is_active ? 'active' : 'inactive'} /></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openLedger(c)} className="btn-icon text-[#0071e3] dark:text-[#0a84ff] hover:bg-blue-500/10" title="Ledger">
                          <BookOpen size={14} />
                        </button>
                        <button onClick={() => openEdit(c)} className="btn-icon text-gray-600 dark:text-gray-300 hover:text-[#0071e3] dark:hover:text-[#0a84ff]" title="Edit">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setDeleteTarget(c)} className="btn-icon text-rose-500 hover:bg-rose-500/10" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} limit={limit} onChange={setPage} />
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)}
        title={editItem ? 'Edit Customer' : 'Add Customer'} size="lg"
        footer={<>
          <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : (editItem ? 'Update' : 'Create')}
          </button>
        </>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <FormField label="Customer Name" required>
              <input className="input" value={form.name} onChange={e => setF('name', e.target.value)} />
            </FormField>
          </div>
          <FormField label="Mobile">
            <input className="input" value={form.mobile} onChange={e => setF('mobile', e.target.value)} />
          </FormField>
          <FormField label="Email">
            <input type="email" className="input" value={form.email} onChange={e => setF('email', e.target.value)} />
          </FormField>
          <FormField label="GSTIN">
            <input 
              className="input font-mono" 
              value={form.gstin} 
              onChange={e => {
                const val = e.target.value.toUpperCase()
                const stateCode = val.slice(0, 2)
                const matchedState = INDIAN_STATES.find(s => s.code === stateCode)
                setForm(prev => ({
                  ...prev,
                  gstin: val,
                  address: {
                    ...(prev.address || {}),
                    state: matchedState ? matchedState.name : (prev.address?.state || '')
                  }
                }))
              }} 
              placeholder="22AAAAA0000A1Z5" 
            />
          </FormField>
          <FormField label="Price Level">
            <select className="select" value={form.price_level} onChange={e => setF('price_level', e.target.value)}>
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
              <option value="distributor">Distributor</option>
            </select>
          </FormField>
          <FormField label="Credit Limit ₹">
            <input type="number" className="input" value={form.credit_limit} onChange={e => setF('credit_limit', parseFloat(e.target.value) || 0)} min="0" />
          </FormField>
          {!editItem && (
            <FormField label="Opening Balance ₹" hint="Positive = receivable, Negative = payable">
              <input type="number" className="input" value={form.opening_balance} onChange={e => setF('opening_balance', parseFloat(e.target.value) || 0)} />
            </FormField>
          )}
          <div className="sm:col-span-2">
            <p className="label mb-2">Address</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input className="input" placeholder="Street" value={form.address?.street || ''} onChange={e => setAddr('street', e.target.value)} />
              </div>
              <input className="input" placeholder="City" value={form.address?.city || ''} onChange={e => setAddr('city', e.target.value)} />
              <select 
                className="select" 
                value={form.address?.state || ''} 
                onChange={e => {
                  const stateName = e.target.value
                  const matched = INDIAN_STATES.find(s => s.name === stateName)
                  setForm(prev => {
                    let updatedGstin = prev.gstin || ''
                    if (matched && (!prev.gstin || /^\d{2}$/.test(prev.gstin.slice(0, 2)) || prev.gstin.length < 2)) {
                      updatedGstin = matched.code + updatedGstin.slice(2)
                    }
                    return {
                      ...prev,
                      gstin: updatedGstin,
                      address: {
                        ...(prev.address || {}),
                        state: stateName
                      }
                    }
                  })
                }}
              >
                <option value="">Select State</option>
                {INDIAN_STATES.map(s => (
                  <option key={s.code + '-' + s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
              <input className="input" placeholder="Pincode" value={form.address?.pincode || ''} onChange={e => setAddr('pincode', e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setF('is_active', e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>
        </div>
      </Modal>

      {/* Ledger Modal */}
      <Modal open={!!ledgerModal} onClose={() => setLedgerModal(null)}
        title={`Ledger: ${ledgerModal?.name}`} size="2xl"
      >
        {ledgerLoading ? <LoadingScreen /> : ledger && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3.5">
              <div className="card p-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#0a84ff]">Current Balance</p>
                <Amount value={ledger.customer?.current_balance || 0} className="text-xl font-bold tracking-tight text-[#0071e3] dark:text-[#0a84ff] mt-1 block" />
              </div>
              <div className="card p-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#34c759] dark:text-[#30d158]">Credit Limit</p>
                <Amount value={ledger.customer?.credit_limit || 0} className="text-xl font-bold tracking-tight text-[#34c759] dark:text-[#30d158] mt-1 block" />
              </div>
              <div className="card p-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Price Level</p>
                <p className="text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400 capitalize mt-1">{ledger.customer?.price_level}</p>
              </div>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Reference</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.entries?.map((e, i) => (
                    <tr key={i}>
                      <td className="text-sm">{e.date ? format(new Date(e.date), 'dd/MM/yy') : '—'}</td>
                      <td className="capitalize"><span className="badge-blue">{e.type}</span></td>
                      <td className="text-sm text-gray-600 dark:text-gray-400">{e.reference}</td>
                      <td className="text-right text-red-600">{e.debit > 0 ? <Amount value={e.debit} /> : '—'}</td>
                      <td className="text-right text-green-600">{e.credit > 0 ? <Amount value={e.credit} /> : '—'}</td>
                      <td className="text-right font-medium"><Amount value={e.balance} /></td>
                    </tr>
                  ))}
                  {!ledger.entries?.length && (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">No ledger entries</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget?.id)}
        title="Delete Customer" message={`Delete "${deleteTarget?.name}"?`} danger
      />
    </div>
  )
}
