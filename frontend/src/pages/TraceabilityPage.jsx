import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, ShieldAlert, FileText, ArrowRight, Download,
  Activity, Users, ShoppingBag, Truck, Calendar, Tag, Layers, Trash2, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  traceabilityAPI, productAPI
} from '../services/api'
import {
  Amount, SearchAutocomplete, GlassSelect, Spinner, Modal, ConfirmDialog
} from '../components/ui'
import { format } from 'date-fns'

export default function TraceabilityPage() {
  const [activeTab, setActiveTab] = useState('brand') // 'brand', 'product', 'batch', 'recall'
  
  // Brand Tracking State
  const [brands, setBrands] = useState([])
  const [loadingBrands, setLoadingBrands] = useState(true)
  
  // Product Traceability State
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [productTraceData, setProductTraceData] = useState(null)
  const [loadingProductTrace, setLoadingProductTrace] = useState(false)
  
  // Batch Traceability State
  const [searchBatchNo, setSearchBatchNo] = useState('')
  const [batchTraceData, setBatchTraceData] = useState(null)
  const [loadingBatchTrace, setLoadingBatchTrace] = useState(false)
  
  // Recall Management State
  const [recalls, setRecalls] = useState([])
  const [loadingRecalls, setLoadingRecalls] = useState(true)
  const [recallBatch, setRecallBatch] = useState('')
  const [recallReason, setRecallReason] = useState('')
  const [recallNotes, setRecallNotes] = useState('')
  const [recalling, setRecalling] = useState(false)
  const [affectedCustomers, setAffectedCustomers] = useState([])
  const [showRecallResultModal, setShowRecallResultModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteBrandTarget, setDeleteBrandTarget] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const intervalRef = useRef(null)

  // Brand Sales Modal State
  const [selectedBrand, setSelectedBrand] = useState(null)
  const [brandSales, setBrandSales] = useState([])
  const [loadingBrandSales, setLoadingBrandSales] = useState(false)
  const [showBrandModal, setShowBrandModal] = useState(false)

  const handleBrandClick = async (brandName) => {
    setSelectedBrand(brandName)
    setShowBrandModal(true)
    setLoadingBrandSales(true)
    try {
      const { data } = await traceabilityAPI.brandSales(brandName)
      setBrandSales(data)
    } catch {
      toast.error('Failed to load brand sales details')
    } finally {
      setLoadingBrandSales(false)
    }
  }

  // 1. Load Brand Analytics
  const loadBrandAnalytics = useCallback(async (silent = false) => {
    if (!silent) setLoadingBrands(true)
    else setRefreshing(true)
    try {
      const { data } = await traceabilityAPI.brandAnalytics()
      setBrands(data)
      setLastUpdated(new Date())
    } catch {
      if (!silent) toast.error('Failed to load brand tracking reports')
    } finally {
      setLoadingBrands(false)
      setRefreshing(false)
    }
  }, [])

  // 2. Load Recalls List
  const loadRecalls = async () => {
    setLoadingRecalls(true)
    try {
      const { data } = await traceabilityAPI.listRecalls()
      setRecalls(data)
    } catch {
      toast.error('Failed to load active recalls')
    } finally {
      setLoadingRecalls(false)
    }
  }

  const handleDeleteRecall = async (recallId) => {
    try {
      await traceabilityAPI.deleteRecall(recallId)
      toast.success('Recall record deleted successfully')
      loadRecalls()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete recall record')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleDeleteBrand = async (brandName) => {
    try {
      await traceabilityAPI.deleteBrand(brandName)
      toast.success(`Brand "${brandName}" deleted successfully`)
      loadBrandAnalytics()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete brand')
    } finally {
      setDeleteBrandTarget(null)
    }
  }

  useEffect(() => {
    if (activeTab === 'brand') {
      loadBrandAnalytics()
      // Auto-refresh every 30 seconds when on brand tab
      intervalRef.current = setInterval(() => loadBrandAnalytics(true), 30000)
      // Refresh when page becomes visible
      const onVisible = () => {
        if (document.visibilityState === 'visible' && activeTab === 'brand') loadBrandAnalytics(true)
      }
      document.addEventListener('visibilitychange', onVisible)
      return () => {
        clearInterval(intervalRef.current)
        document.removeEventListener('visibilitychange', onVisible)
      }
    }
    if (activeTab === 'recall') loadRecalls()
  }, [activeTab, loadBrandAnalytics])

  // 3. Search Product Traceability
  const handleProductSelect = async (p) => {
    setSelectedProduct(p)
    setLoadingProductTrace(true)
    try {
      const { data } = await traceabilityAPI.productTraceability(p.id)
      setProductTraceData(data)
    } catch {
      toast.error('Failed to trace product history')
    } finally {
      setLoadingProductTrace(false)
    }
  }

  // 4. Search Batch Traceability
  const handleBatchSearch = async (e) => {
    if (e) e.preventDefault()
    if (!searchBatchNo.trim()) return toast.error('Enter a batch number')
    
    setLoadingBatchTrace(true)
    try {
      const { data } = await traceabilityAPI.batchTraceability(searchBatchNo.trim())
      setBatchTraceData(data)
      if (data.sourcing.length === 0 && data.distribution.length === 0) {
        toast.error('No purchase or sale transaction logs found for this batch.')
      }
    } catch {
      toast.error('Failed to run batch level search')
    } finally {
      setLoadingBatchTrace(false)
    }
  }

  // 5. Initiate Recall Action
  const handleTriggerRecall = async (e) => {
    e.preventDefault()
    if (!recallBatch.trim()) return toast.error('Enter batch number to recall')
    if (!recallReason.trim()) return toast.error('Enter recall reason')
    
    setRecalling(true)
    try {
      const { data } = await traceabilityAPI.createRecall({
        batch_no: recallBatch.trim(),
        reason: recallReason.trim(),
        notes: recallNotes || undefined
      })
      
      setAffectedCustomers(data.affected_customers)
      setShowRecallResultModal(true)
      
      // Reset recall form
      setRecallBatch('')
      setRecallReason('')
      setRecallNotes('')
      loadRecalls()
      
      toast.success('Recall initiated successfully!')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to initiate batch recall')
    } finally {
      setRecalling(false)
    }
  }

  // 6. CSV Contact Exporter
  const exportContactCSV = (contacts, batchNo) => {
    if (!contacts || contacts.length === 0) return toast.error('No contacts to export')
    
    const headers = ['Customer Name', 'Mobile', 'Email', 'Address']
    const rows = contacts.map(c => [
      c.customer_name,
      c.mobile || 'N/A',
      c.email || 'N/A',
      c.address || 'N/A'
    ])
    
    const csvContent = 'data:text/csv;charset=utf-8,' 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n')
      
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Recall_Contacts_Batch_${batchNo}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Trigger recall for batch from Batch Traceability tab
  const handleQuickRecall = (batchNo) => {
    setRecallBatch(batchNo)
    setActiveTab('recall')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Traceability & Recall Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Track brands performance, trace products sales channels, query batch movements, and trigger batch recalls.
          </p>
        </div>
        
        {/* Nav Tabs */}
        <div className="flex gap-2">
          {['brand', 'product', 'batch', 'recall'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`btn-secondary text-xs px-3 py-1.5 capitalize ${
                activeTab === tab ? 'bg-white/45 dark:bg-white/10 font-bold border-indigo-500/30' : ''
              }`}
            >
              {tab === 'brand' && 'Brand Tracking'}
              {tab === 'product' && 'Product Trace'}
              {tab === 'batch' && 'Batch Trace'}
              {tab === 'recall' && 'Recall Center'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs Content */}
      {activeTab === 'brand' && (
        <div className="card overflow-hidden">
          {/* Brand table header with refresh */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Brand Performance</h3>
              {lastUpdated && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  {' · '}Auto-refreshes every 30s
                </p>
              )}
            </div>
            <button
              onClick={() => loadBrandAnalytics(false)}
              disabled={loadingBrands || refreshing}
              className="btn-secondary text-xs gap-1.5 px-3 py-1.5"
            >
              <RefreshCw size={13} className={refreshing || loadingBrands ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th className="text-right">Sales Revenue</th>
                  <th className="text-right">Quantity Sold</th>
                  <th>Top Customers (Value purchased)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingBrands ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10">
                      <Spinner size={30} className="mx-auto" />
                      <p className="text-xs text-gray-500 mt-2">Loading brand analytics...</p>
                    </td>
                  </tr>
                ) : brands.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-gray-400 text-sm">
                      No sales transactions recorded.
                    </td>
                  </tr>
                ) : (
                  brands.map((b) => (
                    <tr key={b.brand} className="cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/35 transition-colors" onClick={() => handleBrandClick(b.brand)}>
                      <td className="font-semibold text-gray-950 dark:text-white flex items-center gap-2">
                        <Tag size={14} className="text-indigo-500" />
                        {b.brand}
                      </td>
                      <td className="text-right font-bold">
                        <Amount value={b.revenue} />
                      </td>
                      <td className="text-right font-medium text-gray-600 dark:text-gray-300">
                        {b.quantity} PCS
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          {b.top_customers.map((c) => (
                            <span
                              key={c.customer_id}
                              className="text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-900/35 border border-indigo-500/15 rounded-lg px-2 py-0.5"
                              title={`Total purchased: ₹${c.revenue.toFixed(2)}`}
                            >
                              {c.customer_name} ({c.quantity} PCS)
                            </span>
                          ))}
                          {b.top_customers.length === 0 && (
                            <span className="text-xs text-gray-400">None</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteBrandTarget(b)
                          }}
                          className="btn-icon text-red-500 hover:bg-red-500/10 p-1 rounded"
                          title="Delete Brand"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'product' && (
        <div className="space-y-5">
          {/* Autocomplete Input */}
          <div className="card p-4 relative z-30">
            <label className="label text-xs">Search Product for Distribution Mapping</label>
            <SearchAutocomplete
              placeholder="Type product name, SKU, or HSN to trace..."
              onSearch={async (query) => {
                const { data } = await productAPI.search(query, 10)
                return data
              }}
              onSelect={handleProductSelect}
              itemTemplate={(p) => (
                <button type="button" className="w-full px-4 py-2 flex justify-between hover:bg-gray-100 dark:hover:bg-gray-700 text-left">
                  <div>
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-gray-400">Brand: {p.brand || 'N/A'}</p>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    Stock: {p.current_stock}
                  </div>
                </button>
              )}
            />
          </div>

          {loadingProductTrace ? (
            <div className="card p-16 text-center">
              <Spinner size={35} className="mx-auto" />
              <p className="text-xs text-gray-500 mt-2">Compiling customer invoice records...</p>
            </div>
          ) : productTraceData ? (
            <div className="grid lg:grid-cols-3 gap-6 relative z-10">
              {/* Customer Summary List */}
              <div className="card p-5 space-y-4">
                <h3 className="section-title">Customer Purchasing Distribution</h3>
                <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto pr-1">
                  {productTraceData.customer_summary.map((cust, idx) => (
                    <div key={idx} className="py-2.5 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{cust.customer_name}</p>
                        <p className="text-xs text-gray-400">{cust.invoice_count} invoices</p>
                      </div>
                      <span className="font-bold text-sm text-indigo-600 bg-indigo-500/5 px-2 py-0.5 rounded-lg">
                        {cust.total_qty} PCS
                      </span>
                    </div>
                  ))}
                  {productTraceData.customer_summary.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-10">No customer invoices found</p>
                  )}
                </div>
              </div>

              {/* Detailed Sales History */}
              <div className="lg:col-span-2 card p-5 space-y-4">
                <h3 className="section-title">Product Movement Sales History</h3>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Customer</th>
                        <th>Sale Date</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Rate</th>
                        <th className="text-right">Total</th>
                        <th>Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productTraceData.purchase_history.map((h) => (
                        <tr key={h.id}>
                          <td className="font-mono text-xs text-primary-600 font-bold">{h.invoice_number}</td>
                          <td className="font-semibold">{h.customer_name}</td>
                          <td className="text-xs text-gray-500">{format(new Date(h.sale_date), 'dd/MM/yyyy')}</td>
                          <td className="text-right font-medium">{h.quantity}</td>
                          <td className="text-right text-xs"><Amount value={h.rate} /></td>
                          <td className="text-right font-bold"><Amount value={h.total_amount} /></td>
                          <td className="font-mono text-xs font-semibold text-gray-600">{h.batch_no}</td>
                        </tr>
                      ))}
                      {productTraceData.purchase_history.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-10 text-sm text-gray-400">
                            No sales transactions recorded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-12 text-center text-sm text-gray-400">
              Select a product above to view its customer purchase histories.
            </div>
          )}
        </div>
      )}

      {activeTab === 'batch' && (
        <div className="space-y-5">
          {/* Query Bar */}
          <div className="card p-4">
            <form onSubmit={handleBatchSearch} className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  className="input pl-9"
                  placeholder="Enter batch number (e.g., BT-2606-0002)..."
                  value={searchBatchNo}
                  onChange={(e) => setSearchBatchNo(e.target.value)}
                />
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-indigo-300/70" />
              </div>
              <button type="submit" disabled={loadingBatchTrace} className="btn-primary py-2 px-6 text-sm">
                {loadingBatchTrace ? <Spinner size={16} /> : 'Search Batch'}
              </button>
            </form>
          </div>

          {loadingBatchTrace ? (
            <div className="card p-16 text-center">
              <Spinner size={35} className="mx-auto" />
              <p className="text-xs text-gray-500 mt-2">Querying batch transaction maps...</p>
            </div>
          ) : batchTraceData ? (
            <div className="space-y-6">
              {/* Batch General Details Card */}
              {batchTraceData.batch_details.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {batchTraceData.batch_details.map((b, idx) => (
                    <div key={idx} className="card p-4 space-y-1 border border-indigo-500/10">
                      <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Active Inventory Batch</p>
                      <p className="text-lg font-black font-mono">{b.batch_no}</p>
                      <p className="text-xs text-gray-500">Stock: <b className="text-gray-900 dark:text-white">{b.current_stock} PCS</b></p>
                      <p className="text-xs text-gray-500">Expiry: <b>{b.expiry ? format(new Date(b.expiry), 'MM/yy') : 'N/A'}</b></p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-500/20 rounded-xl p-4 text-xs flex gap-2.5 text-yellow-800 dark:text-yellow-400">
                  <ShieldAlert size={16} className="flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Unlisted Batch</p>
                    <p className="mt-0.5">This batch does not have active stock in inventory. Showing transaction logs only.</p>
                  </div>
                </div>
              )}

              {/* Sourcing and Distribution Tables */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Sourcing */}
                <div className="card p-5 space-y-4">
                  <h3 className="section-title flex items-center gap-2 text-green-700 dark:text-green-400">
                    <ShoppingBag size={16} />
                    Sourcing (Supplier Purchases)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Pur Invoice</th>
                          <th>Supplier</th>
                          <th>Purchase Date</th>
                          <th className="text-right">Qty</th>
                          <th className="text-right">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchTraceData.sourcing.map((s, idx) => (
                          <tr key={idx}>
                            <td className="font-mono text-xs font-bold text-green-600">{s.invoice_number}</td>
                            <td className="font-semibold">{s.supplier_name}</td>
                            <td className="text-xs text-gray-500">{format(new Date(s.purchase_date), 'dd/MM/yyyy')}</td>
                            <td className="text-right font-bold">{s.quantity}</td>
                            <td className="text-right text-xs"><Amount value={s.rate} /></td>
                          </tr>
                        ))}
                        {batchTraceData.sourcing.length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center py-10 text-sm text-gray-400">
                              No purchase logs found for this batch.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Distribution */}
                <div className="card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="section-title flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                      <Users size={16} />
                      Distribution (Customer Sales)
                    </h3>
                    {batchTraceData.distribution.length > 0 && (
                      <button
                        onClick={() => handleQuickRecall(batchTraceData.batch_no)}
                        className="btn-primary bg-red-600 hover:bg-red-700 text-[10px] px-2 py-1 flex items-center gap-1"
                      >
                        <ShieldAlert size={10} /> Recall Batch
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Sale Invoice</th>
                          <th>Customer</th>
                          <th>Sale Date</th>
                          <th className="text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchTraceData.distribution.map((d, idx) => (
                          <tr key={idx}>
                            <td className="font-mono text-xs font-bold text-indigo-600">{d.invoice_number}</td>
                            <td className="font-semibold">{d.customer_name}</td>
                            <td className="text-xs text-gray-500">{format(new Date(d.sale_date), 'dd/MM/yyyy')}</td>
                            <td className="text-right font-bold">{d.quantity}</td>
                          </tr>
                        ))}
                        {batchTraceData.distribution.length === 0 && (
                          <tr>
                            <td colSpan={4} className="text-center py-10 text-sm text-gray-400">
                              No customer sales logs found for this batch.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-12 text-center text-sm text-gray-400">
              Query a batch number above to audit its end-to-end movement history.
            </div>
          )}
        </div>
      )}

      {activeTab === 'recall' && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recall trigger form */}
          <div className="card p-5 space-y-4 h-fit">
            <h3 className="section-title flex items-center gap-2 text-red-600">
              <ShieldAlert size={18} />
              Initiate Product Recall
            </h3>
            <form onSubmit={handleTriggerRecall} className="space-y-4">
              <div>
                <label className="label text-xs">Batch Number to Recall *</label>
                <input
                  type="text"
                  className="input font-mono uppercase"
                  placeholder="e.g. BT-2606-0002"
                  value={recallBatch}
                  onChange={(e) => setRecallBatch(e.target.value)}
                />
              </div>
              <div>
                <label className="label text-xs">Recall Reason *</label>
                <select
                  className="select"
                  value={recallReason}
                  onChange={(e) => setRecallReason(e.target.value)}
                >
                  <option value="">Select Reason...</option>
                  <option value="Manufacturer Quality recall">Manufacturer Quality Recall</option>
                  <option value="Packaging Defect">Packaging Defect</option>
                  <option value="Contamination Concern">Contamination Concern</option>
                  <option value="Adverse Reaction Reports">Adverse Reaction Reports</option>
                  <option value="Mislabeled Batch Info">Mislabeled Batch Info</option>
                </select>
              </div>
              <div>
                <label className="label text-xs">Additional Details / Notes</label>
                <textarea
                  className="input h-20 py-2 text-xs"
                  placeholder="Enter details about instructions, action steps..."
                  value={recallNotes}
                  onChange={(e) => setRecallNotes(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={recalling}
                className="btn-primary bg-red-600 hover:bg-red-700 w-full py-2.5 font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                {recalling ? <Spinner size={14} /> : (
                  <>
                    <ShieldAlert size={14} />
                    Run Recall & Identify Contacts
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Recalls List */}
          <div className="lg:col-span-2 card p-5 space-y-4">
            <h3 className="section-title">Recall Event Audit Trails</h3>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Recall Date</th>
                    <th>Reason</th>
                    <th className="text-center">Contacts</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRecalls ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10">
                        <Spinner size={25} className="mx-auto" />
                        <p className="text-xs text-gray-500 mt-2">Loading recall logs...</p>
                      </td>
                    </tr>
                  ) : recalls.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                        No batch recall events initiated yet.
                      </td>
                    </tr>
                  ) : (
                    recalls.map((r) => (
                      <tr key={r.id}>
                        <td className="font-mono text-xs font-bold text-red-600">{r.batch_no}</td>
                        <td className="text-xs text-gray-500">{format(new Date(r.date), 'dd/MM/yyyy HH:mm')}</td>
                        <td className="font-medium text-xs truncate max-w-[150px]" title={r.reason}>
                          {r.reason}
                        </td>
                        <td className="text-center font-bold text-gray-900 dark:text-white">
                          {r.affected_customers_count}
                        </td>
                        <td>
                          <span className="badge badge--error capitalize">recalled</span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={async () => {
                                try {
                                  const { data } = await traceabilityAPI.createRecall({ batch_no: r.batch_no, reason: r.reason })
                                  exportContactCSV(data.affected_customers, r.batch_no)
                                } catch {
                                  toast.error('Failed to export list')
                                }
                              }}
                              className="btn-secondary text-[10px] px-2 py-1 flex items-center gap-1 border border-red-500/10 text-red-600 bg-red-500/5 hover:bg-red-500/10"
                            >
                              <Download size={10} /> Export CSV
                            </button>
                            <button
                              onClick={() => setDeleteTarget(r)}
                              className="btn-icon text-red-500 hover:bg-red-500/10 p-1 rounded"
                              title="Delete Recall Record"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Recall Result Modal */}
      <Modal
        open={showRecallResultModal}
        onClose={() => setShowRecallResultModal(false)}
        title={`Recall Report Summary - Batch: ${affectedCustomers.length > 0 ? recallBatch : 'N/A'}`}
        size="lg"
        footer={(
          <>
            <button onClick={() => setShowRecallResultModal(false)} className="btn-secondary">Close</button>
            <button
              onClick={() => exportContactCSV(affectedCustomers, recallBatch || 'RECALL')}
              disabled={affectedCustomers.length === 0}
              className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-1.5"
            >
              <Download size={14} /> Export Customer List (CSV)
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 flex gap-3 text-red-800 dark:text-red-400">
            <ShieldAlert size={20} className="flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">Action Initiated</p>
              <p className="text-xs mt-1">
                Batch has been recalled. Found <b>{affectedCustomers.length}</b> customer(s) who purchased products from this batch. 
                Export the CSV list to contact them immediately.
              </p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-60">
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Mobile</th>
                    <th>Email</th>
                    <th>Address</th>
                  </tr>
                </thead>
                <tbody>
                  {affectedCustomers.map((c, idx) => (
                    <tr key={idx}>
                      <td className="font-semibold">{c.customer_name}</td>
                      <td className="font-mono text-xs">{c.mobile || 'N/A'}</td>
                      <td className="text-xs text-gray-500">{c.email || 'N/A'}</td>
                      <td className="text-xs max-w-[200px] truncate">{c.address || 'N/A'}</td>
                    </tr>
                  ))}
                  {affectedCustomers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-gray-400 text-sm">
                        No customers purchased items from this batch.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      {/* Brand Sales Details Modal */}
      <Modal
        open={showBrandModal}
        onClose={() => setShowBrandModal(false)}
        title={`Sales Details - ${selectedBrand || ''}`}
        size="lg"
        footer={(
          <button onClick={() => setShowBrandModal(false)} className="btn-secondary">Close</button>
        )}
      >
        <div className="space-y-4">
          {loadingBrandSales ? (
            <div className="py-10 text-center">
              <Spinner size={30} className="mx-auto" />
              <p className="text-xs text-gray-500 mt-2">Loading sold products list...</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Customer</th>
                      <th>Invoice No.</th>
                      <th>Sale Date</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Total</th>
                      <th>Batch No.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandSales.map((h, idx) => (
                      <tr key={idx}>
                        <td className="font-semibold">{h.product_name}</td>
                        <td className="font-semibold text-gray-700 dark:text-gray-300">{h.customer_name}</td>
                        <td className="font-mono text-xs text-primary-600 font-bold">{h.invoice_number}</td>
                        <td className="text-xs text-gray-500">
                          {(() => { try { return format(new Date(h.sale_date), 'dd/MM/yyyy') } catch { return 'N/A' } })()}
                        </td>
                        <td className="text-right font-medium">{h.quantity}</td>
                        <td className="text-right text-xs"><Amount value={h.rate} /></td>
                        <td className="text-right font-bold"><Amount value={h.total_amount} /></td>
                        <td className="font-mono text-xs text-gray-600">{h.batch_no || 'DEFAULT'}</td>
                      </tr>
                    ))}
                    {brandSales.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-sm text-gray-400">
                          No sales transactions recorded for this brand.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDeleteRecall(deleteTarget?.id)}
        title="Delete Recall Event"
        message={`Are you sure you want to delete the recall record for batch "${deleteTarget?.batch_no}"?`}
        danger
      />

      <ConfirmDialog
        open={!!deleteBrandTarget}
        onClose={() => setDeleteBrandTarget(null)}
        onConfirm={() => handleDeleteBrand(deleteBrandTarget?.brand)}
        title="Delete Brand"
        message={`Are you sure you want to delete the brand "${deleteBrandTarget?.brand}"? This will clear the brand field for all of its products.`}
        danger
      />
    </div>
  )
}
