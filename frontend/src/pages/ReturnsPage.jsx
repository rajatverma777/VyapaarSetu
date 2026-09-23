import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Search, Plus, Trash2, Printer, FileText, BarChart3,
  RotateCcw, Undo, RefreshCw, X, ShieldAlert, Sparkles, LogOut, Check,
  IndianRupee, ArrowUpRight
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie
} from 'recharts'
import toast from 'react-hot-toast'
import {
  returnAPI, customerAPI, supplierAPI, productAPI, inventoryAPI
} from '../services/api'
import {
  Amount, SearchAutocomplete, GlassSelect, DatePicker,
  Spinner, Pagination, EmptyState, Modal
} from '../components/ui'
import { format } from 'date-fns'

const REASONS = [
  'Expired Stock',
  'Damaged in Transit',
  'Damaged in Storage',
  'Wrong Product Received',
  'Incorrect Strength/Pack',
  'Shortage/Billing Error',
  'Customer Return (General)',
]

export default function ReturnsPage() {
  const [activeTab, setActiveTab] = useState('list') // 'list', 'create', 'analytics'
  
  // List State
  const [returns, setReturns] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loadingList, setLoadingList] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  
  // Create State
  const [type, setType] = useState('customer') // 'customer' or 'supplier'
  const [party, setParty] = useState(null)
  const [notes, setNotes] = useState('')
  const [refInvoice, setRefInvoice] = useState('')
  const [returnDate, setReturnDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [items, setItems] = useState([])
  const [paidAmount, setPaidAmount] = useState('0')
  const [saving, setSaving] = useState(false)
  const [selectedProductBatches, setSelectedProductBatches] = useState({})
  
  // Analytics State
  const [analytics, setAnalytics] = useState(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)

  const loadReturns = async () => {
    setLoadingList(true)
    try {
      const { data } = await returnAPI.list({
        party_type: filterType || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        page,
        limit: 25
      })
      setReturns(data.items)
      setTotal(data.total)
    } catch {
      toast.error('Failed to load return list')
    } finally {
      setLoadingList(false)
    }
  }

  const loadAnalytics = async () => {
    setLoadingAnalytics(true)
    try {
      const { data } = await returnAPI.analytics()
      setAnalytics(data)
    } catch {
      toast.error('Failed to load return analytics')
    } finally {
      setLoadingAnalytics(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'list') loadReturns()
    if (activeTab === 'analytics') loadAnalytics()
  }, [activeTab, page, filterType, fromDate, toDate])

  const handleTypeChange = (newType) => {
    setType(newType)
    setParty(null)
    setItems([])
    setPaidAmount('0')
    setNotes('')
    setRefInvoice('')
  }

  const addProduct = async (p) => {
    // Check duplicate
    if (items.some((i) => i.product_id === p.id)) {
      return toast.error('Product already added')
    }
    
    // Fetch product batches to select from
    try {
      const { data } = await inventoryAPI.batches({ product_id: p.id })
      const batchesList = data.items || []
      setSelectedProductBatches((prev) => ({ ...prev, [p.id]: batchesList }))
      
      const defaultBatch = batchesList.find((b) => b.current_stock > 0) || batchesList[0] || { batch_no: 'DEFAULT', expiry: null, current_stock: 0 }
      
      const rate = type === 'customer' ? p.selling_price : p.purchase_price
      
      const newItem = {
        product_id: p.id,
        product_name: p.name,
        unit: p.unit || 'PCS',
        quantity: 1,
        rate: rate || 0,
        gst_rate: p.gst_rate || 0,
        batch_no: defaultBatch.batch_no,
        expiry: defaultBatch.expiry,
        reason: REASONS[0],
        max_available: defaultBatch.current_stock || 9999
      }
      
      setItems((prev) => [...prev, newItem])
    } catch (e) {
      toast.error('Failed to load batches for product')
    }
  }

  const updateItem = (productId, field, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.product_id !== productId) return item
        
        const updated = { ...item, [field]: value }
        
        // If batch changes, update expiry and max available
        if (field === 'batch_no') {
          const batches = selectedProductBatches[productId] || []
          const selected = batches.find((b) => b.batch_no === value)
          if (selected) {
            updated.expiry = selected.expiry
            updated.max_available = selected.current_stock
          }
        }
        
        return updated
      })
    )
  }

  const removeItem = (productId) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId))
  }

  // Calculate totals
  const calculateTotals = () => {
    let subtotal = 0
    let totalTax = 0
    let grandTotal = 0
    
    items.forEach((item) => {
      const taxable = item.quantity * item.rate
      const tax = taxable * (item.gst_rate / 100)
      subtotal += taxable
      totalTax += tax
      grandTotal += taxable + tax
    })
    
    const balanceAdj = Math.max(0, grandTotal - parseFloat(paidAmount || '0'))
    
    return {
      subtotal: round(subtotal),
      totalTax: round(totalTax),
      grandTotal: round(grandTotal),
      balanceAdj: round(balanceAdj)
    }
  }

  const round = (num) => Math.round((num + Number.EPSILON) * 100) / 100

  const handleSaveReturn = async () => {
    if (!party && type === 'supplier') return toast.error('Please select a supplier')
    if (items.length === 0) return toast.error('Please add at least one product')
    
    // Validate quantities
    for (const item of items) {
      if (item.quantity <= 0) return toast.error(`Invalid quantity for ${item.product_name}`)
      if (type === 'supplier' && item.quantity > item.max_available) {
        return toast.error(`Insufficient stock in batch ${item.batch_no} of ${item.product_name}. Available: ${item.max_available}`)
      }
    }

    setSaving(true)
    try {
      const payload = {
        type,
        party_id: party ? party.id : '',
        reference_id: refInvoice || undefined,
        paid_amount: parseFloat(paidAmount || '0'),
        notes: notes || undefined,
        date: returnDate ? new Date(returnDate).toISOString() : undefined,
        items: items.map((i) => ({
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: parseFloat(i.quantity),
          rate: parseFloat(i.rate),
          gst_rate: parseFloat(i.gst_rate),
          batch_no: i.batch_no,
          expiry: i.expiry,
          reason: i.reason
        }))
      }

      let res
      if (type === 'customer') {
        res = await returnAPI.createCustomer(payload)
      } else {
        res = await returnAPI.createSupplier(payload)
      }

      toast.success(type === 'customer' ? 'Credit Note generated!' : 'Debit Note generated!')
      
      // Reset form
      setParty(null)
      setItems([])
      setPaidAmount('0')
      setNotes('')
      setRefInvoice('')
      setActiveTab('list')
      loadReturns()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to process return')
    } finally {
      setSaving(false)
    }
  }

  const downloadPdf = async (id, rtype, noteNo) => {
    try {
      const blobUrl = await returnAPI.getPdfBlob(id)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${rtype === 'customer' ? 'CreditNote' : 'DebitNote'}-${noteNo}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
    } catch (e) {
      toast.error('Failed to download PDF')
    }
  }

  const summaryMetrics = useMemo(() => {
    let creditCount = 0
    let creditTotal = 0
    let debitCount = 0
    let debitTotal = 0
    let totalRefunded = 0

    returns.forEach(r => {
      const amt = parseFloat(r.total_amount || 0)
      const paid = parseFloat(r.paid_amount || 0)
      totalRefunded += paid
      if (r.type === 'customer') {
        creditCount++
        creditTotal += amt
      } else {
        debitCount++
        debitTotal += amt
      }
    })

    return {
      totalCount: total || returns.length,
      creditCount,
      creditTotal,
      debitCount,
      debitTotal,
      totalRefunded
    }
  }, [returns, total])

  const totals = calculateTotals()

  const COLORS = ['#0071e3', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5856d6', '#00c7be']

  const TABS = [
    { id: 'list', label: 'Returns & Notes', icon: FileText, badge: total },
    { id: 'create', label: 'New Return Note', icon: Plus },
    { id: 'analytics', label: 'Trends & Analytics', icon: BarChart3 }
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            Returns & Note Management
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Generate Credit/Debit Notes, track product returns, and audit inventory shifts
          </p>
        </div>
        <button
          onClick={() => setActiveTab('create')}
          className="btn-primary gap-2 cursor-pointer shadow-lg shadow-blue-500/20"
        >
          <Plus size={16} /> New Return Note
        </button>
      </div>

      {/* Apple Liquid Glass Segmented Tab Bar */}
      <div className="glass-tab-track">
        {TABS.map(t => {
          const isActive = activeTab === t.id
          const TabIcon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`glass-tab-btn capitalize flex items-center gap-2 ${isActive ? 'active' : ''}`}
            >
              {isActive && (
                <>
                  <div className="glass-tab-active-pill" />
                  <div className="glass-tab-active-shadow" />
                </>
              )}
              <TabIcon size={14} className="relative z-10" />
              <span className="relative z-10">{t.label}</span>
              {t.badge !== undefined && t.badge !== null && t.badge > 0 && (
                <span className={`relative z-10 text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                  isActive
                    ? 'bg-black/10 dark:bg-white/20 text-gray-900 dark:text-white'
                    : 'bg-black/5 dark:bg-white/10 text-gray-500 dark:text-gray-400'
                }`}>
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tabs Content */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* 4 Executive KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Total Notes */}
            <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Notes</span>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 dark:border-blue-400/25">
                  <FileText size={16} className="text-[#0071e3] dark:text-[#0a84ff]" />
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  {summaryMetrics.totalCount}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">
                  Recorded credit/debit notes
                </p>
              </div>
            </div>

            {/* Credit Notes (Customer Returns) */}
            <div
              onClick={() => setFilterType(filterType === 'customer' ? '' : 'customer')}
              className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group ${
                filterType === 'customer' ? 'ring-2 ring-emerald-500/40 border-emerald-500/50 bg-emerald-500/[0.04]' : ''
              }`}
              title="Click to filter customer credit notes"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Credit Notes (Sales)</span>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-400/15 border border-emerald-500/20 dark:border-emerald-400/25 group-hover:scale-105 transition-transform">
                  <RotateCcw size={16} className="text-[#34c759] dark:text-[#30d158]" />
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-650 dark:text-emerald-400">
                  <Amount value={summaryMetrics.creditTotal} />
                </div>
                <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1 font-medium">
                  {summaryMetrics.creditCount} customer return notes
                </p>
              </div>
            </div>

            {/* Debit Notes (Supplier Returns) */}
            <div
              onClick={() => setFilterType(filterType === 'supplier' ? '' : 'supplier')}
              className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group ${
                filterType === 'supplier' ? 'ring-2 ring-rose-500/40 border-rose-500/50 bg-rose-500/[0.04]' : ''
              }`}
              title="Click to filter supplier debit notes"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Debit Notes (Purchase)</span>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-rose-500/10 dark:bg-rose-400/15 border border-rose-500/20 dark:border-rose-400/25 group-hover:scale-105 transition-transform">
                  <Undo size={16} className="text-rose-600 dark:text-rose-400" />
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                  <Amount value={summaryMetrics.debitTotal} />
                </div>
                <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-1 font-medium">
                  {summaryMetrics.debitCount} vendor return notes
                </p>
              </div>
            </div>

            {/* Refund Settled */}
            <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Cash Settled</span>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-500/10 dark:bg-amber-400/15 border border-amber-500/20 dark:border-amber-400/25">
                  <IndianRupee size={16} className="text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                  <Amount value={summaryMetrics.totalRefunded} />
                </div>
                <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1 font-medium">
                  Physical cash refunded/received
                </p>
              </div>
            </div>
          </div>

          {/* Filter Glass Bar */}
          <div className="filter-glass-bar flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5 flex-wrap flex-1">
              <GlassSelect
                value={filterType}
                onChange={setFilterType}
                options={[
                  { value: '', label: 'All Returns' },
                  { value: 'customer', label: 'Customer (Credit Notes)' },
                  { value: 'supplier', label: 'Supplier (Debit Notes)' }
                ]}
                placeholder="Filter by type"
                className="w-48"
              />
              <DatePicker className="w-36 flex-shrink-0" value={fromDate} onChange={setFromDate} placeholder="From Date" />
              <DatePicker className="w-36 flex-shrink-0" value={toDate} onChange={setToDate} placeholder="To Date" />
              {(filterType || fromDate || toDate) && (
                <button
                  onClick={() => { setFilterType(''); setFromDate(''); setToDate('') }}
                  className="btn-secondary text-xs px-2.5 py-1.5"
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadReturns}
                disabled={loadingList}
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
                title="Refresh list"
              >
                <RefreshCw size={13} className={loadingList ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {/* Single-Surface Liquid Glass Table Container */}
          <div className="card overflow-hidden">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Note Number</th>
                    <th>Type</th>
                    <th>Party</th>
                    <th>Date</th>
                    <th className="text-right">Total Amount</th>
                    <th className="text-right">Cash Refunded</th>
                    <th className="text-right">Ledger Adj</th>
                    <th>Original Ref</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingList ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12">
                        <Spinner size={30} className="mx-auto" />
                        <p className="text-xs text-gray-500 mt-2 font-medium">Loading return notes…</p>
                      </td>
                    </tr>
                  ) : returns.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <EmptyState
                          icon={RotateCcw}
                          title="No returns found"
                          description="Process returns to create Credit Notes for customers or Debit Notes for suppliers."
                          action={<button onClick={() => setActiveTab('create')} className="btn-primary">Record Return</button>}
                        />
                      </td>
                    </tr>
                  ) : (
                    returns.map((r) => {
                      const isCustomer = r.type === 'customer'
                      return (
                        <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                          <td>
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-lg bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 text-[#0071e3] dark:text-[#0a84ff]">
                              {r.note_number}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${isCustomer ? 'badge-green' : 'badge-red'}`}>
                              {isCustomer ? 'Credit Note' : 'Debit Note'}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-xs font-bold text-gray-700 dark:text-gray-300">
                                {(r.party_name || 'P')[0]?.toUpperCase()}
                              </div>
                              <div className="font-semibold text-gray-900 dark:text-white">
                                {r.party_name}
                              </div>
                            </div>
                          </td>
                          <td className="text-xs text-gray-500">
                            {format(new Date(r.date), 'dd/MM/yyyy')}
                          </td>
                          <td className="text-right font-bold text-gray-900 dark:text-white">
                            <Amount value={r.total_amount} />
                          </td>
                          <td className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                            <Amount value={r.paid_amount} />
                          </td>
                          <td className="text-right font-semibold text-blue-600 dark:text-blue-400">
                            <Amount value={r.balance_amount} />
                          </td>
                          <td>
                            {r.reference_id ? (
                              <span className="font-mono text-xs text-gray-500 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                {r.reference_id}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="text-right">
                            <button
                              onClick={() => downloadPdf(r.id, r.type, r.note_number)}
                              className="btn-secondary text-[11px] px-2.5 py-1 inline-flex items-center gap-1.5"
                              title="Download PDF Note"
                            >
                              <Printer size={13} />
                              PDF
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            {total > 25 && (
              <div className="p-4 border-t border-gray-100 dark:border-white/5">
                <Pagination page={page} total={total} limit={25} onChange={setPage} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE TAB */}
      {activeTab === 'create' && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Form Area */}
          <div className="lg:col-span-2 space-y-4">
            {/* Mode & Party Details */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleTypeChange('customer')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                    type === 'customer'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-bold shadow-sm'
                      : 'border-gray-200 dark:border-white/10 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  <RotateCcw size={16} />
                  Customer Return (Credit Note)
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeChange('supplier')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                    type === 'supplier'
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-400 font-bold shadow-sm'
                      : 'border-gray-200 dark:border-white/10 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  <Undo size={16} />
                  Supplier Return (Debit Note)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="label text-xs">
                    {type === 'customer' ? 'Customer (Optional)' : 'Supplier *'}
                  </label>
                  {party ? (
                    <div className="card p-3 flex items-center justify-between border-blue-500/30 bg-blue-500/[0.04]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-500/10 text-[#0071e3] font-bold text-xs">
                          {(party.name || 'P')[0]?.toUpperCase()}
                        </div>
                        <div>
                          <span className="font-semibold text-sm text-gray-900 dark:text-white block leading-tight">{party.name}</span>
                          <span className="text-xs text-gray-400">{party.mobile || 'No contact'}</span>
                        </div>
                      </div>
                      <button onClick={() => setParty(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <SearchAutocomplete
                      placeholder={type === 'customer' ? 'Search customer (optional)...' : 'Search supplier...'}
                      onSearch={async (query) => {
                        const apiCall = type === 'customer' ? customerAPI.list : supplierAPI.list
                        const { data } = await apiCall({ search: query, limit: 10 })
                        return data
                      }}
                      onSelect={(s) => setParty(s)}
                      itemTemplate={(s) => (
                        <button type="button" className="w-full px-4 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.name}</p>
                          <p className="text-xs text-gray-400">{s.mobile || 'No contact'}</p>
                        </button>
                      )}
                    />
                  )}
                </div>
                <div>
                  <label className="label text-xs">Return Date</label>
                  <DatePicker className="w-full" value={returnDate} onChange={setReturnDate} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs">Original Reference Invoice (Optional)</label>
                  <input
                    type="text"
                    className="input font-mono text-xs"
                    placeholder="e.g. INV-2606-0036"
                    value={refInvoice}
                    onChange={(e) => setRefInvoice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label text-xs">Internal Notes / Reason Remarks</label>
                  <input
                    type="text"
                    className="input text-xs"
                    placeholder="Brief description of the return..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Product Selector */}
            <div className="card p-4 relative z-20">
              <label className="label text-xs mb-1.5 block">Add Items to Return</label>
              <SearchAutocomplete
                placeholder="Search and add product by name or SKU..."
                onSearch={async (query) => {
                  const { data } = await productAPI.search(query, 10)
                  return data
                }}
                onSelect={(p) => addProduct(p)}
                itemTemplate={(p) => (
                  <button type="button" className="w-full px-4 py-2.5 flex justify-between items-center hover:bg-gray-100 dark:hover:bg-white/5 text-left transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.brand ? `${p.brand} · ` : ''}Unit: {p.unit} · GST: {p.gst_rate}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#0071e3] dark:text-[#0a84ff]">
                        ₹{(type === 'customer' ? p.selling_price : p.purchase_price)?.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400">Stock: <b className="text-gray-700 dark:text-gray-200">{p.current_stock}</b></p>
                    </div>
                  </button>
                )}
              />
            </div>

            {/* Items List Table */}
            <div className="card overflow-hidden relative z-10">
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-8">#</th>
                      <th>Product</th>
                      <th className="w-32">Batch No</th>
                      <th className="w-24">Expiry</th>
                      <th className="w-24 text-center">Qty</th>
                      <th className="w-28 text-right">Rate ₹</th>
                      <th className="w-40">Reason</th>
                      <th className="text-right">Total ₹</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-sm text-gray-400 font-medium">
                          No items added yet. Search and select products above to log returns.
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => {
                        const batches = selectedProductBatches[item.product_id] || []
                        const itemTotal = (item.quantity * item.rate) * (1 + item.gst_rate / 100)
                        return (
                          <tr key={item.product_id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                            <td className="text-gray-400 text-xs font-semibold">{idx + 1}</td>
                            <td>
                              <p className="font-semibold text-sm leading-tight text-gray-900 dark:text-white">{item.product_name}</p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500">Unit: {item.unit} · GST {item.gst_rate}%</p>
                            </td>
                            <td>
                              <select
                                className="select text-xs py-1"
                                value={item.batch_no}
                                onChange={(e) => updateItem(item.product_id, 'batch_no', e.target.value)}
                              >
                                {batches.map((b) => (
                                  <option key={b.batch_no} value={b.batch_no}>
                                    {b.batch_no} ({b.current_stock})
                                  </option>
                                ))}
                                {!batches.some(b => b.batch_no === item.batch_no) && (
                                  <option value={item.batch_no}>{item.batch_no}</option>
                                )}
                              </select>
                            </td>
                            <td className="text-xs font-medium text-gray-500">
                              {item.expiry ? format(new Date(item.expiry), 'MM/yy') : 'N/A'}
                            </td>
                            <td>
                              <input
                                type="number"
                                step="any"
                                className="input text-center text-xs py-1 px-2 font-semibold font-mono"
                                value={item.quantity}
                                onChange={(e) => updateItem(item.product_id, 'quantity', parseFloat(e.target.value) || 0)}
                              />
                              {type === 'supplier' && (
                                <p className="text-[10px] text-center text-rose-500 mt-0.5">Max: {item.max_available}</p>
                              )}
                            </td>
                            <td>
                              <input
                                type="number"
                                step="any"
                                className="input text-right text-xs py-1 px-2 font-semibold font-mono"
                                value={item.rate}
                                onChange={(e) => updateItem(item.product_id, 'rate', parseFloat(e.target.value) || 0)}
                              />
                            </td>
                            <td>
                              <select
                                className="select text-xs py-1"
                                value={item.reason}
                                onChange={(e) => updateItem(item.product_id, 'reason', e.target.value)}
                              >
                                {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </td>
                            <td className="text-right font-bold text-sm text-gray-900 dark:text-white">
                              ₹{itemTotal.toFixed(2)}
                            </td>
                            <td className="text-right">
                              <button onClick={() => removeItem(item.product_id)} className="text-rose-500 hover:text-rose-700 p-1">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Pricing Summary Sidepanel */}
          <div className="space-y-4">
            <div className="card p-5 space-y-4">
              <h3 className="section-title text-base font-bold text-gray-900 dark:text-white">
                Return Settlement Summary
              </h3>

              <div className="space-y-2.5 border-b border-gray-150 dark:border-white/10 pb-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Subtotal:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">₹{totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Taxable Value:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">₹{totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">CGST/SGST/IGST:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">₹{totals.totalTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-150 dark:border-white/10 pt-2.5 text-base font-bold">
                  <span className="text-gray-900 dark:text-white">Total Note Value:</span>
                  <span className="text-[#0071e3] dark:text-[#0a84ff]">₹{totals.grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="label text-xs">
                    {type === 'customer' ? 'Immediate Cash Refunded' : 'Immediate Cash Received'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    className="input font-mono font-bold text-emerald-600 border border-emerald-500/20 bg-emerald-500/5 text-lg"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">If cash is paid/received physically, log here. The remaining balance adjusts ledger.</p>
                </div>

                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3.5 text-xs space-y-1">
                  <p className="font-semibold text-blue-700 dark:text-blue-400">Ledger Balance Adjustment:</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">₹{totals.balanceAdj.toFixed(2)}</p>
                  <p className="text-gray-400 text-[11px]">
                    {type === 'customer'
                      ? 'This amount will reduce the customer\'s receivable balance.'
                      : 'This amount will reduce our payable balance to the supplier.'
                    }
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveReturn}
                disabled={saving || items.length === 0}
                className="btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {saving ? (
                  <Spinner size={16} />
                ) : (
                  <>
                    <Check size={16} strokeWidth={2.5} />
                    Confirm & Generate Note
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANALYTICS TAB */}
      {activeTab === 'analytics' && (
        <div className="space-y-5">
          {loadingAnalytics ? (
            <div className="card p-16 text-center">
              <Spinner size={40} className="mx-auto" />
              <p className="text-xs text-gray-500 mt-2 font-medium">Aggregating returns database…</p>
            </div>
          ) : !analytics ? (
            <div className="card p-10 text-center text-sm text-gray-400">No analytics data available</div>
          ) : (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-5 flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Credit Notes (Customer Returns)</p>
                    <p className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 mt-1">
                      ₹{analytics.losses.customer.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{analytics.counts.customer} returns processed</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    <RotateCcw size={20} />
                  </div>
                </div>

                <div className="card p-5 flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Debit Notes (Supplier Returns)</p>
                    <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                      ₹{analytics.losses.supplier.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{analytics.counts.supplier} batch returns sent</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Undo size={20} />
                  </div>
                </div>

                <div className="card p-5 flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Net Return Deficit (Loses)</p>
                    <p className="text-2xl sm:text-3xl font-black text-[#0071e3] dark:text-[#0a84ff] mt-1">
                      ₹{Math.abs(analytics.losses.customer - analytics.losses.supplier).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Combined stock offset valuation</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10 text-[#0071e3] dark:text-[#0a84ff] border border-blue-500/20">
                    <Sparkles size={20} />
                  </div>
                </div>
              </div>

              {/* Charts Row 1 */}
              <div className="grid lg:grid-cols-3 gap-5">
                {/* Timeline trends */}
                <div className="lg:col-span-2 card p-5">
                  <h3 className="section-title text-sm font-bold text-gray-900 dark:text-white mb-4">
                    Return Trends (Last 30 Days)
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analytics.trends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="customer" stroke="#ff3b30" name="Credit Notes" strokeWidth={2} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="supplier" stroke="#34c759" name="Debit Notes" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Reason Share */}
                <div className="card p-5">
                  <h3 className="section-title text-sm font-bold text-gray-900 dark:text-white mb-4">
                    Returns by Reason
                  </h3>
                  <div className="h-64 flex flex-col justify-between">
                    {analytics.reasons.length === 0 ? (
                      <div className="text-center text-sm text-gray-400 my-auto">No return records found</div>
                    ) : (
                      <>
                        <div className="flex-1">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={analytics.reasons}
                                dataKey="value"
                                nameKey="reason"
                                cx="50%"
                                cy="50%"
                                outerRadius={65}
                                fill="#8884d8"
                              >
                                {analytics.reasons.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value) => `₹${value.toFixed(2)}`} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="text-xs space-y-1.5 overflow-y-auto max-h-24 pt-2">
                          {analytics.reasons.map((r, idx) => (
                            <div key={r.reason} className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                              <span className="text-gray-500 truncate max-w-[150px]">{r.reason}</span>
                              <span className="ml-auto font-semibold text-gray-900 dark:text-white">₹{r.value.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Charts Row 2 */}
              <div className="grid lg:grid-cols-2 gap-5">
                {/* Brand Return Rate */}
                <div className="card p-5">
                  <h3 className="section-title text-sm font-bold text-gray-900 dark:text-white mb-4">
                    Return Rate by Brand (%)
                  </h3>
                  <div className="h-60">
                    {analytics.brand_rates.length === 0 ? (
                      <div className="text-center text-sm text-gray-400 py-16">No brand return analytics yet</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.brand_rates} margin={{ bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                          <XAxis dataKey="brand" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(value) => `${value}%`} />
                          <Bar dataKey="rate" fill="#0071e3" name="Return Rate %">
                            {analytics.brand_rates.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.rate > 5 ? '#ff3b30' : '#0071e3'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Product Return Rate */}
                <div className="card p-5">
                  <h3 className="section-title text-sm font-bold text-gray-900 dark:text-white mb-4">
                    High Return Rate Products (%)
                  </h3>
                  <div className="h-60">
                    {analytics.product_rates.length === 0 ? (
                      <div className="text-center text-sm text-gray-400 py-16">No product return analytics yet</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.product_rates} layout="vertical" margin={{ left: 10, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis dataKey="product_name" type="category" tick={{ fontSize: 9 }} width={110} />
                          <Tooltip formatter={(value) => `${value}%`} />
                          <Bar dataKey="rate" fill="#ff9500" name="Return Rate %" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
