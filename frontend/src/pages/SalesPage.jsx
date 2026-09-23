import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Printer, CreditCard, Download, IndianRupee, CheckCircle2, AlertCircle, RefreshCw, X, Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import { salesAPI } from '../services/api'
import { Pagination, TableSkeleton, EmptyState, SearchInput, StatusBadge, Amount, Modal, DatePicker, GlassSelect } from '../components/ui'
import { format } from 'date-fns'

export default function SalesPage() {
  const navigate = useNavigate()
  const [sales, setSales]     = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')
  const [status, setStatus]     = useState('')
  const [filterDuesOnly, setFilterDuesOnly] = useState(false)
  const [payModal, setPayModal] = useState(null)
  const [payAmt, setPayAmt]     = useState('')
  const [payMode, setPayMode]   = useState('cash')
  const [savingPayment, setSavingPayment] = useState(false)
  const limit = 50

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await salesAPI.list({
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        status: status || undefined,
        page,
        limit
      })
      setSales(data.items)
      setTotal(data.total)
    } catch {
      toast.error('Failed to load sales')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [fromDate, toDate, status, page])

  // Filtered sales in memory (search by invoice or customer name, dues-only toggle)
  const displayedSales = sales.filter(s => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const matchInv = (s.invoice_number || '').toLowerCase().includes(q)
      const matchCust = (s.customer_name || '').toLowerCase().includes(q)
      if (!matchInv && !matchCust) return false
    }
    if (filterDuesOnly && (s.balance_amount || 0) <= 0) {
      return false
    }
    return true
  })

  // Executive KPI summary computations
  const totalBilled = sales.reduce((acc, s) => acc + (s.total_amount || 0), 0)
  const totalCollected = sales.reduce((acc, s) => acc + (s.paid_amount || 0), 0)
  const totalOutstanding = sales.reduce((acc, s) => acc + (s.balance_amount || 0), 0)
  const pendingInvoicesCount = sales.filter(s => (s.balance_amount || 0) > 0).length

  const openPdf = async (id) => {
    try {
      const blobUrl = await salesAPI.getPdfBlob(id)
      const win = window.open(blobUrl, '_blank')
      if (win) {
        win.addEventListener('load', () => {
          setTimeout(() => { win.focus(); win.print() }, 400)
        })
      }
    } catch (e) {
      toast.error('Failed to load invoice PDF')
    }
  }

  const downloadPdf = async (id, invNo) => {
    try {
      const blobUrl = await salesAPI.getPdfBlob(id)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `Invoice-${invNo}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
    } catch (e) {
      toast.error('Failed to download invoice PDF')
    }
  }

  const submitPayment = async () => {
    if (!payAmt || parseFloat(payAmt) <= 0) return toast.error('Enter valid amount')
    setSavingPayment(true)
    try {
      await salesAPI.payment(payModal.id, parseFloat(payAmt), payMode)
      toast.success('Payment recorded successfully')
      setPayModal(null)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to record payment')
    } finally {
      setSavingPayment(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            Sales Invoices
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Manage customer bills, track receipts, and print GST compliant tax invoices
          </p>
        </div>
        <button
          onClick={() => navigate('/sales/new')}
          className="btn-primary gap-2 cursor-pointer shadow-lg shadow-blue-500/20"
        >
          <Plus size={16} /> New Sale
          <span className="text-[10px] opacity-75 font-normal px-1.5 py-0.2 rounded bg-white/20">Smart Cart</span>
        </button>
      </div>

      {/* 4 Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Invoices */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Invoices</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 dark:border-blue-400/25">
              <FileText size={16} className="text-[#0071e3] dark:text-[#0a84ff]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {total}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">Recorded sales bills</p>
          </div>
        </div>

        {/* Total Billed Revenue */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Gross Sales</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 dark:border-blue-400/25">
              <IndianRupee size={16} className="text-[#0071e3] dark:text-[#0a84ff]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              <Amount value={totalBilled} />
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">Current page volume</p>
          </div>
        </div>

        {/* Total Collected */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Collected</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-400/15 border border-emerald-500/20 dark:border-emerald-400/25">
              <CheckCircle2 size={16} className="text-[#34c759] dark:text-[#30d158]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-[#34c759] dark:text-[#30d158]">
              <Amount value={totalCollected} />
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">Received inward cash</p>
          </div>
        </div>

        {/* Pending Balance / Dues Filter Card */}
        <div
          onClick={() => setFilterDuesOnly(prev => !prev)}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group select-none ${
            filterDuesOnly ? 'ring-2 ring-amber-500/40 border-amber-500/50 bg-amber-500/[0.04]' : ''
          }`}
          title="Click to toggle filter for invoices with pending balance"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pending Dues</span>
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
              <Amount value={totalOutstanding} />
            </div>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1 font-medium">
              {filterDuesOnly ? 'Filter active (click to clear)' : `${pendingInvoicesCount} unpaid/partial bills`}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Glass Bar */}
      <div className="filter-glass-bar">
        <SearchInput
          value={search}
          onChange={v => setSearch(v)}
          placeholder="Search by invoice no. or customer name…"
          className="flex-1 min-w-[200px]"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <DatePicker className="w-36 flex-shrink-0" value={fromDate} onChange={v => { setFromDate(v); setPage(1) }} />
          <DatePicker className="w-36 flex-shrink-0" value={toDate} onChange={v => { setToDate(v); setPage(1) }} />

          <GlassSelect
            value={status}
            onChange={v => { setStatus(v); setPage(1) }}
            options={[
              { value: '', label: 'All Status' },
              { value: 'paid', label: 'Paid' },
              { value: 'partial', label: 'Partial' },
              { value: 'unpaid', label: 'Unpaid' }
            ]}
            placeholder="All Status"
            className="w-36"
          />

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
            <span>With Dues</span>
          </button>

          {(fromDate || toDate || status || search || filterDuesOnly) && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); setStatus(''); setSearch(''); setFilterDuesOnly(false); setPage(1) }}
              className="btn-secondary text-xs py-1.5 px-3 cursor-pointer"
            >
              Clear
            </button>
          )}

          <button onClick={load} className="filter-icon-glass ml-auto cursor-pointer" title="Refresh sales">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="relative">
        <div className="table-container relative overflow-hidden">
          {loading && sales.length > 0 && (
            <div className="table-loading-bar-container">
              <div className="table-loading-bar" />
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
                <th>Payment Mode</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && sales.length === 0 ? (
                <tr><td colSpan={9} className="p-0"><TableSkeleton rows={8} cols={9} /></td></tr>
              ) : displayedSales.length === 0 ? (
                <tr><td colSpan={9}>
                  <EmptyState
                    icon={FileText}
                    title="No sales invoices found"
                    action={<button onClick={() => navigate('/sales/new')} className="btn-primary">Create First Sale</button>}
                  />
                </td></tr>
              ) : displayedSales.map(s => (
                <tr key={s.id} className="animate-fade-in">
                  <td>
                    <span className="font-mono text-xs font-semibold text-[#0071e3] dark:text-[#0a84ff] bg-[#0071e3]/8 dark:bg-[#0a84ff]/10 px-2 py-0.5 rounded-md border border-[#0071e3]/20 dark:border-[#0a84ff]/25">
                      {s.invoice_number}
                    </span>
                  </td>
                  <td className="text-sm text-gray-600 dark:text-gray-300">
                    {format(new Date(s.sale_date), 'dd/MM/yy')}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 border border-[#0071e3]/20 dark:border-[#0a84ff]/25 text-[#0071e3] dark:text-[#0a84ff] flex-shrink-0">
                        {s.customer_name ? s.customer_name.charAt(0).toUpperCase() : 'C'}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white truncate max-w-[160px]">
                        {s.customer_name}
                      </span>
                    </div>
                  </td>
                  <td className="text-right font-bold text-gray-900 dark:text-white">
                    <Amount value={s.total_amount} />
                  </td>
                  <td className="text-right text-[#34c759] dark:text-[#30d158] font-medium">
                    <Amount value={s.paid_amount} />
                  </td>
                  <td className="text-right">
                    <span className={s.balance_amount > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-400'}>
                      {s.balance_amount > 0 ? <Amount value={s.balance_amount} /> : '—'}
                    </span>
                  </td>
                  <td>
                    <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/[0.03] dark:bg-white/[0.05] text-gray-700 dark:text-gray-300 border border-black/[0.04] dark:border-white/[0.06]">
                      {s.payment_mode}
                    </span>
                  </td>
                  <td><StatusBadge status={s.status} /></td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openPdf(s.id)}
                        className="btn-icon text-gray-600 dark:text-gray-300 hover:text-[#0071e3] dark:hover:text-[#0a84ff] cursor-pointer"
                        title="Print Tax Invoice"
                      >
                        <Printer size={14} />
                      </button>
                      <button
                        onClick={() => downloadPdf(s.id, s.invoice_number)}
                        className="btn-icon text-gray-500 hover:text-gray-800 dark:hover:text-white cursor-pointer"
                        title="Download PDF"
                      >
                        <Download size={14} />
                      </button>
                      {s.balance_amount > 0 && (
                        <button
                          onClick={() => { setPayModal(s); setPayAmt(s.balance_amount.toFixed(2)) }}
                          className="btn-icon text-[#34c759] dark:text-[#30d158] hover:bg-emerald-500/10 cursor-pointer"
                          title="Record Customer Payment"
                        >
                          <CreditCard size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      {/* Record Payment Modal */}
      <Modal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        title="Record Customer Payment"
        size="sm"
        footer={<>
          <button onClick={() => setPayModal(null)} className="btn-secondary cursor-pointer">Cancel</button>
          <button onClick={submitPayment} disabled={savingPayment} className="btn-primary cursor-pointer">
            {savingPayment ? 'Saving…' : 'Record Payment'}
          </button>
        </>}
      >
        {payModal && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.08] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Invoice</span>
                <span className="font-mono font-semibold text-[#0071e3] dark:text-[#0a84ff]">{payModal.invoice_number}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Customer</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">{payModal.customer_name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Total Billed</span>
                <span className="font-bold text-gray-900 dark:text-white">₹{payModal.total_amount?.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-black/[0.04] dark:border-white/[0.06]">
                <span className="text-amber-600 dark:text-amber-400 font-medium">Pending Balance</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">₹{payModal.balance_amount?.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <label className="label text-xs">Amount Received (₹)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input font-semibold text-sm"
                value={payAmt}
                onChange={e => setPayAmt(e.target.value)}
                placeholder="Enter amount"
              />
            </div>

            <div>
              <label className="label text-xs">Payment Mode</label>
              <GlassSelect
                value={payMode}
                onChange={setPayMode}
                options={['cash','upi','card','cheque','neft'].map(m => ({ value: m, label: m.toUpperCase() }))}
                className="w-full"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

