import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ShoppingBag, IndianRupee, CheckCircle2, AlertCircle, RefreshCw, Truck } from 'lucide-react'
import toast from 'react-hot-toast'
import { purchaseAPI } from '../services/api'
import { Pagination, TableSkeleton, EmptyState, StatusBadge, Amount, SearchInput, DatePicker } from '../components/ui'
import { format } from 'date-fns'

export default function PurchasesPage() {
  const navigate = useNavigate()
  const [purchases, setPurchases] = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [fromDate, setFromDate]   = useState('')
  const [toDate, setToDate]       = useState('')
  const [filterDuesOnly, setFilterDuesOnly] = useState(false)
  const limit = 50

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await purchaseAPI.list({
        from_date: fromDate || undefined,
        to_date:   toDate   || undefined,
        page,
        limit
      })
      setPurchases(data.items)
      setTotal(data.total)
    } catch {
      toast.error('Failed to load purchases')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [fromDate, toDate, page])

  // Filtered purchases in memory (search by invoice or supplier name, dues-only toggle)
  const displayedPurchases = purchases.filter(p => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const matchSys = (p.sys_invoice_number || '').toLowerCase().includes(q)
      const matchInv = (p.invoice_number || '').toLowerCase().includes(q)
      const matchSupp = (p.supplier_name || '').toLowerCase().includes(q)
      if (!matchSys && !matchInv && !matchSupp) return false
    }
    if (filterDuesOnly && (p.balance_amount || 0) <= 0) {
      return false
    }
    return true
  })

  // Executive KPI summary computations
  const totalInwardValue = purchases.reduce((acc, p) => acc + (p.total_amount || 0), 0)
  const totalPaid = purchases.reduce((acc, p) => acc + (p.paid_amount || 0), 0)
  const totalPayables = purchases.reduce((acc, p) => acc + (p.balance_amount || 0), 0)
  const pendingBillsCount = purchases.filter(p => (p.balance_amount || 0) > 0).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            Inward Purchases
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Track inward vendor shipments, manage stock additions, and settle supplier balances
          </p>
        </div>
        <button
          onClick={() => navigate('/purchases/new')}
          className="btn-primary gap-2 cursor-pointer shadow-lg shadow-blue-500/20"
        >
          <Plus size={16} /> New Purchase
        </button>
      </div>

      {/* 4 Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Inward Bills */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Purchases</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 dark:border-blue-400/25">
              <ShoppingBag size={16} className="text-[#0071e3] dark:text-[#0a84ff]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {total}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">Inward bill records</p>
          </div>
        </div>

        {/* Total Inward Valuation */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Inward Value</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 dark:border-blue-400/25">
              <IndianRupee size={16} className="text-[#0071e3] dark:text-[#0a84ff]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              <Amount value={totalInwardValue} />
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">Current page volume</p>
          </div>
        </div>

        {/* Total Paid to Vendors */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Paid to Vendors</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-400/15 border border-emerald-500/20 dark:border-emerald-400/25">
              <CheckCircle2 size={16} className="text-[#34c759] dark:text-[#30d158]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-[#34c759] dark:text-[#30d158]">
              <Amount value={totalPaid} />
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">Disbursed payouts</p>
          </div>
        </div>

        {/* Pending Payables Filter Card */}
        <div
          onClick={() => setFilterDuesOnly(prev => !prev)}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group select-none ${
            filterDuesOnly ? 'ring-2 ring-amber-500/40 border-amber-500/50 bg-amber-500/[0.04]' : ''
          }`}
          title="Click to toggle filter for purchases with pending payables"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pending Payables</span>
              {filterDuesOnly && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-500/10 dark:bg-amber-400/15 border border-amber-500/20 dark:border-amber-400/25 group-hover:scale-105 transition-transform">
              <AlertCircle size={16} className="text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              <Amount value={totalPayables} />
            </div>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1 font-medium">
              {filterDuesOnly ? 'Filter active (click to clear)' : `${pendingBillsCount} pending payables`}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Glass Bar */}
      <div className="filter-glass-bar">
        <SearchInput
          value={search}
          onChange={v => setSearch(v)}
          placeholder="Search by invoice no. or supplier name…"
          className="flex-1 min-w-[200px]"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <DatePicker className="w-36 flex-shrink-0" value={fromDate} onChange={v => { setFromDate(v); setPage(1) }} />
          <DatePicker className="w-36 flex-shrink-0" value={toDate} onChange={v => { setToDate(v); setPage(1) }} />

          {/* Dues Only Filter Button */}
          <button
            type="button"
            onClick={() => setFilterDuesOnly(v => !v)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 border cursor-pointer ${
              filterDuesOnly
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400 shadow-sm'
                : 'bg-black/[0.03] dark:bg-white/[0.05] border-black/5 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-black/[0.06] dark:hover:bg-white/10'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${filterDuesOnly ? 'bg-amber-500 animate-pulse' : 'bg-gray-400'}`} />
            <span>With Payables</span>
          </button>

          {(fromDate || toDate || search || filterDuesOnly) && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); setSearch(''); setFilterDuesOnly(false); setPage(1) }}
              className="btn-secondary text-xs py-1.5 px-3 cursor-pointer"
            >
              Clear
            </button>
          )}

          <button onClick={load} className="filter-icon-glass ml-auto cursor-pointer" title="Refresh purchases">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="relative">
        <div className="table-container relative overflow-hidden">
          {loading && purchases.length > 0 && (
            <div className="table-loading-bar-container">
              <div className="table-loading-bar" />
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Supplier Bill</th>
                <th>Date</th>
                <th>Supplier</th>
                <th className="text-right">Inward Total</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && purchases.length === 0 ? (
                <tr><td colSpan={8} className="p-0"><TableSkeleton rows={8} cols={8} /></td></tr>
              ) : displayedPurchases.length === 0 ? (
                <tr><td colSpan={8}>
                  <EmptyState
                    icon={ShoppingBag}
                    title="No purchases found"
                    action={<button onClick={() => navigate('/purchases/new')} className="btn-primary">New Purchase</button>}
                  />
                </td></tr>
              ) : displayedPurchases.map(p => (
                <tr key={p.id} className="animate-fade-in">
                  <td>
                    <span className="font-mono text-xs font-semibold text-[#0071e3] dark:text-[#0a84ff] bg-[#0071e3]/8 dark:bg-[#0a84ff]/10 px-2 py-0.5 rounded-md border border-[#0071e3]/20 dark:border-[#0a84ff]/25">
                      {p.sys_invoice_number}
                    </span>
                  </td>
                  <td className="text-sm font-mono text-gray-500 dark:text-gray-400">
                    {p.invoice_number !== p.sys_invoice_number ? p.invoice_number : '—'}
                  </td>
                  <td className="text-sm text-gray-600 dark:text-gray-300">
                    {format(new Date(p.purchase_date), 'dd/MM/yy')}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 border border-[#0071e3]/20 dark:border-[#0a84ff]/25 text-[#0071e3] dark:text-[#0a84ff] flex-shrink-0">
                        {p.supplier_name ? p.supplier_name.charAt(0).toUpperCase() : 'S'}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white truncate max-w-[180px]">
                        {p.supplier_name}
                      </span>
                    </div>
                  </td>
                  <td className="text-right font-bold text-gray-900 dark:text-white">
                    <Amount value={p.total_amount} />
                  </td>
                  <td className="text-right text-[#34c759] dark:text-[#30d158] font-medium">
                    <Amount value={p.paid_amount} />
                  </td>
                  <td className="text-right">
                    <span className={p.balance_amount > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-400'}>
                      {p.balance_amount > 0 ? <Amount value={p.balance_amount} /> : '—'}
                    </span>
                  </td>
                  <td><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>
    </div>
  )
}

