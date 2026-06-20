import { useState, useEffect, useRef } from 'react'
import {
  Search, Plus, Trash2, Printer, FileText, BarChart3,
  RotateCcw, Undo, RefreshCw, X, ShieldAlert, Sparkles, LogOut, Check
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

  const totals = calculateTotals()

  const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Returns & Note Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Generate Credit/Debit Notes, track product returns, and audit inventory shifts.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`btn-secondary text-xs px-3 py-1.5 ${activeTab === 'list' ? 'bg-white/45 dark:bg-white/10 font-bold border-indigo-500/30' : ''}`}
          >
            List
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`btn-primary text-xs px-3 py-1.5 flex items-center gap-1 ${activeTab === 'create' ? 'ring-2 ring-indigo-500/20' : ''}`}
          >
            <Plus size={14} /> New Return
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 ${activeTab === 'analytics' ? 'bg-white/45 dark:bg-white/10 font-bold border-indigo-500/30' : ''}`}
          >
            <BarChart3 size={14} /> Analytics
          </button>
        </div>
      </div>

      {/* Tabs Content */}
      {activeTab === 'list' && (
        <div className="space-y-5">
          {/* Filters Card */}
          <div className="card p-4 flex flex-wrap gap-3 relative z-30">
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
            <DatePicker className="w-36 flex-shrink-0" value={fromDate} onChange={setFromDate} />
            <DatePicker className="w-36 flex-shrink-0" value={toDate} onChange={setToDate} />
            <button
              onClick={() => { setFilterType(''); setFromDate(''); setToDate('') }}
              className="btn-secondary text-xs"
            >
              Clear
            </button>
            <button onClick={loadReturns} className="ml-auto btn-secondary p-2" title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Table Container */}
          <div className="card overflow-hidden relative z-10">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Note Number</th>
                    <th>Type</th>
                    <th>Party</th>
                    <th>Date</th>
                    <th className="text-right">Total Amount</th>
                    <th className="text-right">Refunded</th>
                    <th className="text-right">Ledger Adj</th>
                    <th>Original Ref</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingList ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10">
                        <Spinner size={30} className="mx-auto" />
                        <p className="text-xs text-gray-500 mt-2">Loading returns...</p>
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
                    returns.map((r) => (
                      <tr key={r.id}>
                        <td className="font-mono text-xs font-bold text-primary-600">{r.note_number}</td>
                        <td>
                          <span className={`badge ${r.type === 'customer' ? 'badge--success' : 'badge--error'}`}>
                            {r.type === 'customer' ? 'Credit Note' : 'Debit Note'}
                          </span>
                        </td>
                        <td className="font-semibold">{r.party_name}</td>
                        <td className="text-sm">{format(new Date(r.date), 'dd/MM/yyyy')}</td>
                        <td className="text-right font-bold text-gray-900 dark:text-white">
                          <Amount value={r.total_amount} />
                        </td>
                        <td className="text-right text-green-600">
                          <Amount value={r.paid_amount} />
                        </td>
                        <td className="text-right text-indigo-600">
                          <Amount value={r.balance_amount} />
                        </td>
                        <td className="text-xs text-gray-500">{r.reference_id || 'N/A'}</td>
                        <td>
                          <button
                            onClick={() => downloadPdf(r.id, r.type, r.note_number)}
                            className="btn-icon text-indigo-600 dark:text-indigo-400"
                            title="Download PDF"
                          >
                            <Printer size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {total > 25 && (
              <Pagination page={page} total={total} limit={25} onChange={setPage} />
            )}
          </div>
        </div>
      )}

      {activeTab === 'create' && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Form Area */}
          <div className="lg:col-span-2 space-y-5">
            {/* Mode & Party Details */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleTypeChange('customer')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                    type === 'customer'
                      ? 'bg-green-600/10 border-green-500/40 text-green-700 dark:text-green-400 font-bold shadow-sm'
                      : 'border-gray-250 dark:border-white/5 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
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
                      ? 'bg-red-600/10 border-red-500/40 text-red-700 dark:text-red-400 font-bold shadow-sm'
                      : 'border-gray-250 dark:border-white/5 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
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
                    <div className="input flex items-center justify-between border-indigo-500 bg-indigo-500/5">
                      <span className="font-semibold text-sm">{party.name}</span>
                      <button onClick={() => setParty(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={14} />
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
                        <button type="button" className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700">
                          <p className="text-sm font-medium">{s.name}</p>
                          <p className="text-xs text-gray-500">{s.mobile || 'No contact'}</p>
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
                    className="input"
                    placeholder="e.g. INV-2606-0036"
                    value={refInvoice}
                    onChange={(e) => setRefInvoice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label text-xs">Internal Notes / Reason Remarks</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Brief description of the return..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Product Selector */}
            <div className="card p-4 relative z-20">
              <SearchAutocomplete
                placeholder="Search and add product to return list..."
                onSearch={async (query) => {
                  const { data } = await productAPI.search(query, 10)
                  return data
                }}
                onSelect={(p) => addProduct(p)}
                itemTemplate={(p) => (
                  <button type="button" className="w-full px-4 py-2 flex justify-between hover:bg-gray-100 dark:hover:bg-gray-700 text-left">
                    <div>
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.brand ? `${p.brand} · ` : ''}Unit: {p.unit} · GST: {p.gst_rate}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary-600">
                        ₹{(type === 'customer' ? p.selling_price : p.purchase_price)?.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400">Stock: {p.current_stock}</p>
                    </div>
                  </button>
                )}
              />
            </div>

            {/* Items List Table */}
            <div className="card overflow-hidden relative z-10">
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-8">#</th>
                      <th>Product</th>
                      <th className="w-28">Batch No</th>
                      <th className="w-24">Expiry</th>
                      <th className="w-24 text-center">Qty</th>
                      <th className="w-24 text-right">Rate ₹</th>
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
                          <tr key={item.product_id}>
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
                                className="input text-center text-xs py-1 px-2 border"
                                value={item.quantity}
                                onChange={(e) => updateItem(item.product_id, 'quantity', parseFloat(e.target.value) || 0)}
                              />
                              {type === 'supplier' && (
                                <p className="text-[10px] text-center text-red-500 mt-0.5">Max: {item.max_available}</p>
                              )}
                            </td>
                            <td>
                              <input
                                type="number"
                                step="any"
                                className="input text-right text-xs py-1 px-2 border"
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
                            <td className="text-right font-bold text-sm">
                              ₹{itemTotal.toFixed(2)}
                            </td>
                            <td>
                              <button onClick={() => removeItem(item.product_id)} className="text-red-500 hover:text-red-700">
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
          <div className="space-y-5">
            <div className="card p-5 space-y-4">
              <h3 className="section-title">Return Summary</h3>
              
              <div className="space-y-2 border-b border-gray-100 dark:border-gray-800 pb-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">₹{totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Taxable Value:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">₹{totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">CGST/SGST/IGST:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">₹{totals.totalTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-2 text-base font-bold">
                  <span className="text-gray-950 dark:text-white">Note Value:</span>
                  <span className="text-primary-600">₹{totals.grandTotal.toFixed(2)}</span>
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
                    className="input font-mono font-bold text-green-600 border border-green-500/20 bg-green-500/5 text-lg"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">If money is refunded/received physically, log it here. The rest adjustments ledger balance.</p>
                </div>
                
                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 text-xs space-y-1">
                  <p className="font-semibold text-indigo-700 dark:text-indigo-400">Ledger Balance Adjustment:</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">₹{totals.balanceAdj.toFixed(2)}</p>
                  <p className="text-gray-400">
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
                className="btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2"
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

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {loadingAnalytics ? (
            <div className="card p-16 text-center">
              <Spinner size={40} className="mx-auto" />
              <p className="text-xs text-gray-500 mt-2">Aggregating returns database...</p>
            </div>
          ) : !analytics ? (
            <div className="card p-10 text-center text-sm text-gray-400">No analytics data available</div>
          ) : (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="card p-5 flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Credit Notes Issued (Customer Returns)</p>
                    <p className="text-3xl font-black text-red-600 dark:text-red-400 mt-1">
                      ₹{analytics.losses.customer.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{analytics.counts.customer} returns processed</p>
                  </div>
                  <div className="w-10 h-10 glass-icon-container text-red-500">
                    <RotateCcw size={20} />
                  </div>
                </div>

                <div className="card p-5 flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Debit Notes Issued (Supplier Returns)</p>
                    <p className="text-3xl font-black text-green-600 dark:text-green-400 mt-1">
                      ₹{analytics.losses.supplier.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{analytics.counts.supplier} batch returns sent</p>
                  </div>
                  <div className="w-10 h-10 glass-icon-container text-green-500">
                    <Undo size={20} />
                  </div>
                </div>

                <div className="card p-5 flex items-start justify-between bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border-indigo-500/20">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Net Return Deficit (Loses)</p>
                    <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                      ₹{Math.abs(analytics.losses.customer - analytics.losses.supplier).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Combined stock offset valuation</p>
                  </div>
                  <div className="w-10 h-10 glass-icon-container text-indigo-500">
                    <Sparkles size={20} />
                  </div>
                </div>
              </div>

              {/* Charts Row 1 */}
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Timeline trends */}
                <div className="lg:col-span-2 card p-5">
                  <h3 className="section-title mb-4">Return Trends (Last 30 Days)</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analytics.trends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="customer" stroke="#ef4444" name="Credit Notes" strokeWidth={2} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="supplier" stroke="#10b981" name="Debit Notes" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Reason Share */}
                <div className="card p-5">
                  <h3 className="section-title mb-4">Returns by Reason</h3>
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
                        <div className="text-xs space-y-1 overflow-y-auto max-h-24">
                          {analytics.reasons.map((r, idx) => (
                            <div key={r.reason} className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                              <span className="text-gray-500 truncate max-w-[150px]">{r.reason}</span>
                              <span className="ml-auto font-semibold">₹{r.value.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Charts Row 2 */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Brand Return Rate */}
                <div className="card p-5">
                  <h3 className="section-title mb-4">Return Rate by Brand (%)</h3>
                  <div className="h-60">
                    {analytics.brand_rates.length === 0 ? (
                      <div className="text-center text-sm text-gray-400 py-16">No brand return analytics yet</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.brand_rates} margin={{ bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="brand" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(value) => `${value}%`} />
                          <Bar dataKey="rate" fill="#6366f1" name="Return Rate %">
                            {analytics.brand_rates.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.rate > 5 ? '#ef4444' : '#6366f1'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Product Return Rate */}
                <div className="card p-5">
                  <h3 className="section-title mb-4">High Return Rate Products (%)</h3>
                  <div className="h-60">
                    {analytics.product_rates.length === 0 ? (
                      <div className="text-center text-sm text-gray-400 py-16">No product return analytics yet</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.product_rates} layout="vertical" margin={{ left: 10, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis dataKey="product_name" type="category" tick={{ fontSize: 9 }} width={110} />
                          <Tooltip formatter={(value) => `${value}%`} />
                          <Bar dataKey="rate" fill="#f59e0b" name="Return Rate %" />
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
