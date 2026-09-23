import { useState, useEffect, useRef } from 'react'
import { Plus, CreditCard, Search, ArrowDownLeft, ArrowUpRight, Receipt, IndianRupee, RefreshCw, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { paymentAPI, customerAPI, supplierAPI } from '../services/api'
import { Modal, Pagination, EmptyState, TableSkeleton, Amount, FormField, DatePicker, GlassSelect, SearchInput } from '../components/ui'
import { format } from 'date-fns'

export default function PaymentsPage() {
  const [payments, setPayments] = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [partyType, setPartyType] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState({
    party_type: 'customer', party_id: '', amount: '', payment_mode: 'cash',
    reference_no: '', payment_date: new Date().toISOString().slice(0,10), notes: ''
  })
  const [partySearch, setPartySearch] = useState('')
  const [partyResults, setPartyResults] = useState([])
  const [selectedParty, setSelectedParty] = useState(null)
  const partyRef = useRef()

  const triggerSearchAllParties = async () => {
    try {
      const api = form.party_type === 'customer' ? customerAPI : supplierAPI
      const { data } = await api.list({ search: '', limit: 50 })
      setPartyResults(data.items)
    } catch { /**/ }
  }

  useEffect(() => {
    const h = (e) => { if (!partyRef.current?.contains(e.target)) setPartyResults([]) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const limit = 50

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await paymentAPI.list({ party_type: partyType || undefined, page, limit })
      setPayments(data.items)
      setTotal(data.total)
    } catch {
      toast.error('Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [partyType, page])

  useEffect(() => {
    if (partySearch.length < 1) { setPartyResults([]); return }
    const t = setTimeout(async () => {
      const api = form.party_type === 'customer' ? customerAPI : supplierAPI
      const { data } = await api.list({ search: partySearch, limit: 12 })
      setPartyResults(data.items)
    }, 200)
    return () => clearTimeout(t)
  }, [partySearch, form.party_type])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Filter in memory by search query
  const displayedPayments = payments.filter(p => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const matchParty = (p.party_name || '').toLowerCase().includes(q)
    const matchRef = (p.reference_no || '').toLowerCase().includes(q)
    const matchNotes = (p.notes || '').toLowerCase().includes(q)
    return matchParty || matchRef || matchNotes
  })

  // Executive KPI summary calculations
  const customerReceiptsTotal = payments
    .filter(p => p.party_type === 'customer')
    .reduce((s, p) => s + (p.amount || 0), 0)

  const supplierPayoutsTotal = payments
    .filter(p => p.party_type === 'supplier')
    .reduce((s, p) => s + (p.amount || 0), 0)

  const totalVolume = customerReceiptsTotal + supplierPayoutsTotal

  const handleSave = async () => {
    if (!form.party_id) return toast.error('Select a party')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      await paymentAPI.create({ ...form, amount: parseFloat(form.amount) })
      toast.success('Payment recorded successfully')
      setShowForm(false)
      setSelectedParty(null)
      setPartySearch('')
      setForm({ party_type: 'customer', party_id: '', amount: '', payment_mode: 'cash', reference_no: '', payment_date: new Date().toISOString().slice(0,10), notes: '' })
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            Payment Transactions
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Audit customer inward receipts and vendor inward payments in one unified ledger
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary gap-2 cursor-pointer shadow-lg shadow-blue-500/20"
        >
          <Plus size={16}/> Record Payment
        </button>
      </div>

      {/* 4 Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Transactions */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Entries</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 dark:border-blue-400/25">
              <Receipt size={16} className="text-[#0071e3] dark:text-[#0a84ff]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {total}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">Recorded payment logs</p>
          </div>
        </div>

        {/* Customer Receipts (Inflow) */}
        <div
          onClick={() => { setPartyType('customer'); setPage(1) }}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group select-none ${
            partyType === 'customer' ? 'ring-2 ring-emerald-500/40 border-emerald-500/50 bg-emerald-500/[0.04]' : ''
          }`}
          title="Click to view customer receipts"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Customer Receipts</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-400/15 border border-emerald-500/20 dark:border-emerald-400/25 group-hover:scale-105 transition-transform">
              <ArrowDownLeft size={16} className="text-[#34c759] dark:text-[#30d158]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-[#34c759] dark:text-[#30d158]">
              <Amount value={customerReceiptsTotal} />
            </div>
            <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1 font-medium">Inward collections</p>
          </div>
        </div>

        {/* Supplier Payouts (Outflow) */}
        <div
          onClick={() => { setPartyType('supplier'); setPage(1) }}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group select-none ${
            partyType === 'supplier' ? 'ring-2 ring-amber-500/40 border-amber-500/50 bg-amber-500/[0.04]' : ''
          }`}
          title="Click to view supplier payouts"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Vendor Payouts</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-500/10 dark:bg-amber-400/15 border border-amber-500/20 dark:border-amber-400/25 group-hover:scale-105 transition-transform">
              <ArrowUpRight size={16} className="text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              <Amount value={supplierPayoutsTotal} />
            </div>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1 font-medium">Disbursed outlays</p>
          </div>
        </div>

        {/* Gross Movement */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Transacted</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 dark:border-blue-400/25">
              <IndianRupee size={16} className="text-[#0071e3] dark:text-[#0a84ff]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              <Amount value={totalVolume} />
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">Current page turnover</p>
          </div>
        </div>
      </div>

      {/* Filter Glass Bar & Segmented Party Toggle */}
      <div className="filter-glass-bar">
        <SearchInput
          value={search}
          onChange={v => setSearch(v)}
          placeholder="Search by party name, reference, or notes…"
          className="flex-1 min-w-[200px]"
        />

        {/* Apple Segmented Party Selector */}
        <div className="flex items-center p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.08]">
          {[
            { key: '', label: 'All Transactions' },
            { key: 'customer', label: 'Receipts (In)' },
            { key: 'supplier', label: 'Payouts (Out)' }
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setPartyType(tab.key); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                partyType === tab.key
                  ? 'bg-white dark:bg-white/15 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button onClick={load} className="filter-icon-glass ml-auto cursor-pointer" title="Refresh payments">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Table Container */}
      <div className="relative">
        <div className="table-container relative overflow-hidden">
          {loading && payments.length > 0 && (
            <div className="table-loading-bar-container">
              <div className="table-loading-bar" />
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Party Name</th>
                <th>Transaction Type</th>
                <th>Payment Mode</th>
                <th className="text-right">Amount</th>
                <th>Reference No.</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading && payments.length === 0 ? (
                <tr><td colSpan={7} className="p-0"><TableSkeleton rows={8} cols={7} /></td></tr>
              ) : displayedPayments.length === 0 ? (
                <tr><td colSpan={7}>
                  <EmptyState
                    icon={CreditCard}
                    title="No payments recorded"
                    action={<button onClick={() => setShowForm(true)} className="btn-primary">Record Payment</button>}
                  />
                </td></tr>
              ) : displayedPayments.map(p => {
                const isCustomer = p.party_type === 'customer'
                return (
                  <tr key={p.id} className="animate-fade-in">
                    <td className="text-sm text-gray-600 dark:text-gray-300">
                      {p.payment_date ? format(new Date(p.payment_date), 'dd/MM/yy') : '—'}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 border border-[#0071e3]/20 dark:border-[#0a84ff]/25 text-[#0071e3] dark:text-[#0a84ff] flex-shrink-0">
                          {p.party_name ? p.party_name.charAt(0).toUpperCase() : (isCustomer ? 'C' : 'S')}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                          {p.party_name}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        isCustomer
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-[#34c759] dark:text-[#30d158]'
                          : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                      }`}>
                        {isCustomer ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                        {isCustomer ? 'Customer Receipt' : 'Supplier Payout'}
                      </span>
                    </td>
                    <td>
                      <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/[0.03] dark:bg-white/[0.05] text-gray-700 dark:text-gray-300 border border-black/[0.04] dark:border-white/[0.06]">
                        {p.payment_mode}
                      </span>
                    </td>
                    <td className={`text-right font-bold text-sm ${
                      isCustomer ? 'text-[#34c759] dark:text-[#30d158]' : 'text-gray-900 dark:text-white'
                    }`}>
                      {isCustomer ? '+ ' : '- '}<Amount value={p.amount} />
                    </td>
                    <td className="text-sm font-mono text-gray-500 dark:text-gray-400">
                      {p.reference_no || '—'}
                    </td>
                    <td className="text-xs text-gray-500 dark:text-gray-400 max-w-[150px] truncate" title={p.notes || ''}>
                      {p.notes || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      {/* Record Payment Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Record Payment Transaction"
        size="md"
        footer={<>
          <button onClick={() => setShowForm(false)} className="btn-secondary cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary cursor-pointer">
            {saving ? 'Saving…' : 'Record Transaction'}
          </button>
        </>}
      >
        <div className="space-y-4">
          {/* Party Type Segmented Control */}
          <div>
            <label className="label text-xs">Transaction Direction</label>
            <div className="grid grid-cols-2 p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => { setF('party_type', 'customer'); setSelectedParty(null); setF('party_id', '') }}
                className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  form.party_type === 'customer'
                    ? 'bg-white dark:bg-white/15 text-[#34c759] dark:text-[#30d158] shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <ArrowDownLeft size={14} /> Customer Receipt (Inflow)
              </button>
              <button
                type="button"
                onClick={() => { setF('party_type', 'supplier'); setSelectedParty(null); setF('party_id', '') }}
                className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  form.party_type === 'supplier'
                    ? 'bg-white dark:bg-white/15 text-amber-600 dark:text-amber-400 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <ArrowUpRight size={14} /> Supplier Payout (Outflow)
              </button>
            </div>
          </div>

          {/* Party Selector */}
          <div>
            <label className="label text-xs">
              Select {form.party_type === 'customer' ? 'Customer' : 'Supplier'} *
            </label>
            {selectedParty ? (
              <div className="flex items-center justify-between p-2.5 px-3 rounded-xl bg-[#0071e3]/8 dark:bg-[#0a84ff]/10 border border-[#0071e3]/20 dark:border-[#0a84ff]/25 backdrop-blur-md">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs bg-[#0071e3]/15 dark:bg-[#0a84ff]/20 text-[#0071e3] dark:text-[#0a84ff] flex-shrink-0">
                    {selectedParty.name ? selectedParty.name.charAt(0).toUpperCase() : 'P'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">{selectedParty.name}</span>
                      {selectedParty.current_balance !== undefined && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          selectedParty.current_balance > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        }`}>
                          Balance: ₹{selectedParty.current_balance?.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {selectedParty.mobile && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{selectedParty.mobile}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedParty(null); setF('party_id', '') }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors ml-2 flex-shrink-0 cursor-pointer"
                  title="Change party"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="relative" ref={partyRef}>
                <div className="search-glass-wrap relative">
                  <Search
                    size={15}
                    className="search-glass-icon cursor-pointer hover:text-[#0071e3] dark:hover:text-[#0a84ff] transition-colors pointer-events-auto"
                    onClick={triggerSearchAllParties}
                  />
                  <input
                    className="search-glass-input"
                    value={partySearch}
                    onChange={e => setPartySearch(e.target.value)}
                    onFocus={triggerSearchAllParties}
                    placeholder={`Search ${form.party_type} by name or mobile…`}
                  />
                </div>
                {partyResults.length > 0 && (
                  <div className="search-glass-dropdown">
                    {partyResults.map(p => (
                      <div
                        key={p.id}
                        onClick={() => { setSelectedParty(p); setF('party_id', p.id); setPartySearch(''); setPartyResults([]) }}
                        className="search-glass-dropdown-item px-3.5 py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 border border-[#0071e3]/20 dark:border-[#0a84ff]/25 text-[#0071e3] dark:text-[#0a84ff] flex-shrink-0">
                            {p.name ? p.name.charAt(0).toUpperCase() : 'P'}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-sm text-gray-900 dark:text-white truncate block">{p.name}</span>
                            {p.mobile && <span className="text-xs text-gray-500 dark:text-gray-400">{p.mobile}</span>}
                          </div>
                        </div>
                        {p.current_balance !== undefined && (
                          <div className="text-right flex-shrink-0">
                            <span className="text-[10px] text-gray-400 block">Due Balance</span>
                            <span className={`text-xs font-bold ${p.current_balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-[#34c759] dark:text-[#30d158]'}`}>
                              ₹{p.current_balance?.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Amount & Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Amount (₹) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input font-semibold text-sm"
                value={form.amount}
                onChange={e => setF('amount', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="label text-xs">Payment Mode</label>
              <GlassSelect
                value={form.payment_mode}
                onChange={v => setF('payment_mode', v)}
                options={['cash','upi','card','cheque','neft'].map(m => ({ value: m, label: m.toUpperCase() }))}
                className="w-full"
              />
            </div>
          </div>

          {/* Date & Reference */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Transaction Date</label>
              <DatePicker className="w-full" value={form.payment_date} onChange={(v) => setF('payment_date', v)} />
            </div>
            <div>
              <label className="label text-xs">Reference No. (UTR/Cheque)</label>
              <input
                className="input font-mono text-sm"
                value={form.reference_no}
                onChange={e => setF('reference_no', e.target.value)}
                placeholder="e.g. UTR123456"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label text-xs">Notes / Particulars</label>
            <input
              className="input text-sm"
              value={form.notes}
              onChange={e => setF('notes', e.target.value)}
              placeholder="e.g. Settlement for Bill #INV-001"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

