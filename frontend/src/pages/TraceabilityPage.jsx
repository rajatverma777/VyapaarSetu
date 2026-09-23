import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Search, ShieldAlert, FileText, ArrowRight, Download,
  Activity, Users, ShoppingBag, Truck, Calendar, Tag, Layers, Trash2, RefreshCw,
  IndianRupee, ArrowUpRight, CheckCircle2, AlertCircle, X
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  traceabilityAPI, productAPI
} from '../services/api'
import {
  Amount, SearchAutocomplete, GlassSelect, Spinner, Modal, ConfirmDialog, EmptyState
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
      setBrands(data || [])
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
      setRecalls(data || [])
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
      intervalRef.current = setInterval(() => loadBrandAnalytics(true), 30000)
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

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    let totalRevenue = 0
    let totalQty = 0
    brands.forEach(b => {
      totalRevenue += parseFloat(b.revenue || 0)
      totalQty += parseFloat(b.quantity || 0)
    })
    return {
      brandsCount: brands.length,
      totalRevenue,
      totalQty,
      recallsCount: recalls.length
    }
  }, [brands, recalls])

  const TABS = [
    { id: 'brand', label: 'Brand Tracking', icon: Tag, badge: brands.length },
    { id: 'product', label: 'Product Trace', icon: ShoppingBag },
    { id: 'batch', label: 'Batch Audit', icon: Layers },
    { id: 'recall', label: 'Recall Center', icon: ShieldAlert, badge: recalls.length }
  ]

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

  const handleQuickRecall = (batchNo) => {
    setRecallBatch(batchNo)
    setActiveTab('recall')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            Traceability & Safety Hub
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            End-to-end supply chain auditing, brand performance, batch movements, and recall management
          </p>
        </div>
      </div>

      {/* 4 Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Tracked Brands */}
        <div
          onClick={() => setActiveTab('brand')}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group ${
            activeTab === 'brand' ? 'ring-2 ring-blue-500/40 border-blue-500/50 bg-blue-500/[0.04]' : ''
          }`}
          title="Click to view brand performance"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Tracked Brands</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 dark:border-blue-400/25 group-hover:scale-105 transition-transform">
              <Tag size={16} className="text-[#0071e3] dark:text-[#0a84ff]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {summaryMetrics.brandsCount}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium flex items-center gap-1 group-hover:text-[#0071e3] dark:group-hover:text-[#0a84ff] transition-colors">
              Active manufacturer lines <ArrowUpRight size={12} />
            </p>
          </div>
        </div>

        {/* Tracked Revenue */}
        <div
          onClick={() => setActiveTab('brand')}
          className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group"
          title="Click to view brand sales revenue"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Brand Revenue</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-400/15 border border-emerald-500/20 dark:border-emerald-400/25 group-hover:scale-105 transition-transform">
              <IndianRupee size={16} className="text-[#34c759] dark:text-[#30d158]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-650 dark:text-emerald-400">
              <Amount value={summaryMetrics.totalRevenue} />
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">
              Aggregated brand sales volume
            </p>
          </div>
        </div>

        {/* Volume Audited */}
        <div
          onClick={() => setActiveTab('product')}
          className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group"
          title="Click to trace products"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Volume Sold</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-500/10 dark:bg-amber-400/15 border border-amber-500/20 dark:border-amber-400/25 group-hover:scale-105 transition-transform">
              <ShoppingBag size={16} className="text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {summaryMetrics.totalQty.toLocaleString('en-IN')} PCS
            </div>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1 font-medium flex items-center gap-1">
              Trace product movement <ArrowUpRight size={12} />
            </p>
          </div>
        </div>

        {/* Active Recalls */}
        <div
          onClick={() => setActiveTab('recall')}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group ${
            summaryMetrics.recallsCount > 0 ? 'ring-2 ring-rose-500/40 border-rose-500/50 bg-rose-500/[0.04]' : ''
          }`}
          title="Click to view recalls"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Safety Recalls</span>
              {summaryMetrics.recallsCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </div>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-rose-500/10 dark:bg-rose-400/15 border border-rose-500/20 dark:border-rose-400/25 group-hover:scale-105 transition-transform">
              <ShieldAlert size={16} className="text-rose-600 dark:text-rose-400" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {summaryMetrics.recallsCount}
            </div>
            <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-1 font-medium">
              {summaryMetrics.recallsCount === 0 ? 'All batches compliant' : 'Active recall actions'}
            </p>
          </div>
        </div>
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
      {activeTab === 'brand' && (
        <div className="card overflow-hidden">
          {/* Brand table header with refresh */}
          <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-3 border-b border-gray-150 dark:border-white/10 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Brand Sales & Distribution</h3>
              {lastUpdated && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  {' · '}Auto-refreshes every 30s
                </p>
              )}
            </div>
            <button
              onClick={() => loadBrandAnalytics(false)}
              disabled={loadingBrands || refreshing}
              className="btn-secondary text-xs gap-1.5 px-3 py-1.5 flex items-center"
            >
              <RefreshCw size={13} className={refreshing || loadingBrands ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Brand Name</th>
                  <th className="text-right">Sales Revenue</th>
                  <th className="text-right">Quantity Sold</th>
                  <th>Top Channel Partners (Volume)</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingBrands ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12">
                      <Spinner size={30} className="mx-auto" />
                      <p className="text-xs text-gray-500 mt-2 font-medium">Aggregating brand analytics…</p>
                    </td>
                  </tr>
                ) : brands.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        icon={Tag}
                        title="No brand sales recorded"
                        description="As sales invoices are generated for branded products, performance analytics will appear here."
                      />
                    </td>
                  </tr>
                ) : (
                  brands.map((b) => (
                    <tr
                      key={b.brand}
                      className="cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                      onClick={() => handleBrandClick(b.brand)}
                    >
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 text-[#0071e3] dark:text-[#0a84ff]">
                            <Tag size={15} />
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white block leading-tight">{b.brand}</span>
                            <span className="text-[11px] text-gray-400">Click to view items & invoices</span>
                          </div>
                        </div>
                      </td>
                      <td className="text-right font-bold text-gray-900 dark:text-white">
                        <Amount value={b.revenue} />
                      </td>
                      <td className="text-right font-semibold text-gray-700 dark:text-gray-300">
                        {b.quantity} PCS
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1.5 max-w-md">
                          {b.top_customers.map((c) => (
                            <span
                              key={c.customer_id}
                              className="text-[11px] font-semibold bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1 text-gray-700 dark:text-gray-300"
                              title={`Total purchased: ₹${c.revenue.toFixed(2)}`}
                            >
                              {c.customer_name} <span className="text-[#0071e3] dark:text-[#0a84ff]">({c.quantity} PCS)</span>
                            </span>
                          ))}
                          {b.top_customers.length === 0 && (
                            <span className="text-xs text-gray-400">No partner invoices</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteBrandTarget(b)
                          }}
                          className="btn-icon text-rose-500 hover:bg-rose-500/10 p-1.5 rounded-lg transition-colors"
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
        <div className="space-y-4">
          {/* Autocomplete Input */}
          <div className="card p-4 relative z-30">
            <label className="label text-xs mb-1.5 block">Search Product to Map End-to-End Distribution</label>
            <SearchAutocomplete
              placeholder="Type product name, SKU, or HSN to trace sales…"
              onSearch={async (query) => {
                const { data } = await productAPI.search(query, 10)
                return data
              }}
              onSelect={handleProductSelect}
              itemTemplate={(p) => (
                <button type="button" className="w-full px-4 py-2.5 flex justify-between items-center hover:bg-gray-100 dark:hover:bg-white/5 text-left transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{p.name}</p>
                    <p className="text-xs text-gray-400">Brand: {p.brand || 'Unbranded'}</p>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    Stock: <b className="text-gray-700 dark:text-gray-200">{p.current_stock}</b> {p.unit}
                  </div>
                </button>
              )}
            />
          </div>

          {loadingProductTrace ? (
            <div className="card p-16 text-center">
              <Spinner size={35} className="mx-auto" />
              <p className="text-xs text-gray-500 mt-2 font-medium">Compiling customer invoice records…</p>
            </div>
          ) : productTraceData ? (
            <div className="grid lg:grid-cols-3 gap-5 relative z-10">
              {/* Customer Summary List */}
              <div className="card p-5 space-y-3">
                <h3 className="section-title text-sm font-bold text-gray-900 dark:text-white">
                  Customer Purchasing Distribution
                </h3>
                <div className="divide-y divide-gray-100 dark:divide-white/5 max-h-96 overflow-y-auto pr-1">
                  {productTraceData.customer_summary.map((cust, idx) => (
                    <div key={idx} className="py-2.5 flex justify-between items-center">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-500/10 text-[#0071e3] font-bold text-xs">
                          {(cust.customer_name || 'C')[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{cust.customer_name}</p>
                          <p className="text-xs text-gray-400">{cust.invoice_count} sales invoices</p>
                        </div>
                      </div>
                      <span className="font-bold text-xs text-[#0071e3] dark:text-[#0a84ff] bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 px-2 py-0.5 rounded-lg">
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
              <div className="lg:col-span-2 card overflow-hidden">
                <div className="p-4 sm:px-6 border-b border-gray-150 dark:border-white/10">
                  <h3 className="section-title text-sm font-bold text-gray-900 dark:text-white">
                    Movement & Sales Audit Trails
                  </h3>
                </div>
                <div className="table-container">
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
                        <tr key={h.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                          <td>
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-lg bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 text-[#0071e3] dark:text-[#0a84ff]">
                              {h.invoice_number}
                            </span>
                          </td>
                          <td className="font-semibold text-gray-900 dark:text-white">{h.customer_name}</td>
                          <td className="text-xs text-gray-500">{format(new Date(h.sale_date), 'dd/MM/yyyy')}</td>
                          <td className="text-right font-bold text-gray-900 dark:text-white">{h.quantity}</td>
                          <td className="text-right text-xs"><Amount value={h.rate} /></td>
                          <td className="text-right font-bold"><Amount value={h.total_amount} /></td>
                          <td>
                            <span className="font-mono text-xs text-gray-500 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded">
                              {h.batch_no || 'DEFAULT'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {productTraceData.purchase_history.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-10 text-sm text-gray-400">
                            No sales transactions recorded for this product.
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
              Select a product above to audit its customer distribution network.
            </div>
          )}
        </div>
      )}

      {activeTab === 'batch' && (
        <div className="space-y-4">
          {/* Query Bar */}
          <div className="card p-4">
            <form onSubmit={handleBatchSearch} className="flex gap-3">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  className="input pl-9 text-sm"
                  placeholder="Enter batch number (e.g. BT-2606-0002)…"
                  value={searchBatchNo}
                  onChange={(e) => setSearchBatchNo(e.target.value)}
                />
                {searchBatchNo && (
                  <button
                    type="button"
                    onClick={() => setSearchBatchNo('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loadingBatchTrace}
                className="btn-primary py-2 px-6 text-sm shadow-lg shadow-blue-500/20"
              >
                {loadingBatchTrace ? <Spinner size={16} /> : 'Search Batch'}
              </button>
            </form>
          </div>

          {loadingBatchTrace ? (
            <div className="card p-16 text-center">
              <Spinner size={35} className="mx-auto" />
              <p className="text-xs text-gray-500 mt-2 font-medium">Querying batch movement graph…</p>
            </div>
          ) : batchTraceData ? (
            <div className="space-y-4">
              {/* Batch General Details Card */}
              {batchTraceData.batch_details.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                  {batchTraceData.batch_details.map((b, idx) => (
                    <div key={idx} className="card p-4 space-y-1 border-blue-500/20 bg-blue-500/[0.03]">
                      <p className="text-[10px] font-bold text-[#0071e3] dark:text-[#0a84ff] uppercase tracking-wider">Active Inventory Batch</p>
                      <p className="text-lg font-black font-mono text-gray-900 dark:text-white">{b.batch_no}</p>
                      <p className="text-xs text-gray-500">Stock: <b className="text-gray-900 dark:text-white">{b.current_stock} PCS</b></p>
                      <p className="text-xs text-gray-500">Expiry: <b>{b.expiry ? format(new Date(b.expiry), 'MM/yy') : 'N/A'}</b></p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card p-4 border border-amber-500/20 bg-amber-500/[0.04] text-xs flex gap-2.5 text-amber-800 dark:text-amber-400">
                  <ShieldAlert size={16} className="flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Unlisted / Depleted Batch</p>
                    <p className="mt-0.5 text-gray-500 dark:text-gray-400">This batch currently has no active unsold stock on hand. Historical supply and distribution logs are shown below.</p>
                  </div>
                </div>
              )}

              {/* Sourcing and Distribution Tables */}
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Sourcing */}
                <div className="card overflow-hidden">
                  <div className="p-4 sm:px-6 border-b border-gray-150 dark:border-white/10 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <ShoppingBag size={14} />
                    </div>
                    <h3 className="section-title text-sm font-bold text-gray-900 dark:text-white">
                      Sourcing (Vendor Inward Bills)
                    </h3>
                  </div>
                  <div className="table-container">
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
                          <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                            <td>
                              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-lg bg-emerald-500/10 dark:bg-emerald-400/15 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                {s.invoice_number}
                              </span>
                            </td>
                            <td className="font-semibold text-gray-900 dark:text-white">{s.supplier_name}</td>
                            <td className="text-xs text-gray-500">{format(new Date(s.purchase_date), 'dd/MM/yyyy')}</td>
                            <td className="text-right font-bold text-gray-900 dark:text-white">{s.quantity}</td>
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
                <div className="card overflow-hidden">
                  <div className="p-4 sm:px-6 border-b border-gray-150 dark:border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-blue-500/10 text-[#0071e3] dark:text-[#0a84ff]">
                        <Users size={14} />
                      </div>
                      <h3 className="section-title text-sm font-bold text-gray-900 dark:text-white">
                        Distribution (Customer Outward Bills)
                      </h3>
                    </div>
                    {batchTraceData.distribution.length > 0 && (
                      <button
                        onClick={() => handleQuickRecall(batchTraceData.batch_no)}
                        className="btn-primary bg-rose-600 hover:bg-rose-700 text-[11px] px-2.5 py-1 flex items-center gap-1 shadow-sm"
                      >
                        <ShieldAlert size={12} /> Recall Batch
                      </button>
                    )}
                  </div>
                  <div className="table-container">
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
                          <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                            <td>
                              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-lg bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 text-[#0071e3] dark:text-[#0a84ff]">
                                {d.invoice_number}
                              </span>
                            </td>
                            <td className="font-semibold text-gray-900 dark:text-white">{d.customer_name}</td>
                            <td className="text-xs text-gray-500">{format(new Date(d.sale_date), 'dd/MM/yyyy')}</td>
                            <td className="text-right font-bold text-gray-900 dark:text-white">{d.quantity}</td>
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
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Recall trigger form */}
          <div className="card p-5 space-y-4 h-fit border-rose-500/20 bg-rose-500/[0.02]">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-rose-500/10 border border-rose-500/20">
                <ShieldAlert size={18} />
              </div>
              <h3 className="section-title text-base font-bold">
                Initiate Product Recall
              </h3>
            </div>
            <form onSubmit={handleTriggerRecall} className="space-y-3.5">
              <div>
                <label className="label text-xs">Batch Number to Recall *</label>
                <input
                  type="text"
                  className="input font-mono uppercase font-semibold text-xs"
                  placeholder="e.g. BT-2606-0002"
                  value={recallBatch}
                  onChange={(e) => setRecallBatch(e.target.value)}
                />
              </div>
              <div>
                <label className="label text-xs">Recall Reason *</label>
                <select
                  className="select text-xs"
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
                <label className="label text-xs">Additional Details / Action Steps</label>
                <textarea
                  className="input h-20 py-2 text-xs"
                  placeholder="Enter details about safety warnings, return instructions..."
                  value={recallNotes}
                  onChange={(e) => setRecallNotes(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={recalling}
                className="btn-primary bg-rose-600 hover:bg-rose-700 w-full py-2.5 font-semibold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-rose-500/20"
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
          <div className="lg:col-span-2 card overflow-hidden">
            <div className="p-4 sm:px-6 border-b border-gray-150 dark:border-white/10">
              <h3 className="section-title text-sm font-bold text-gray-900 dark:text-white">
                Recall Event Audit Trails
              </h3>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Recall Date</th>
                    <th>Reason</th>
                    <th className="text-center">Contacts</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRecalls ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10">
                        <Spinner size={25} className="mx-auto" />
                        <p className="text-xs text-gray-500 mt-2 font-medium">Loading recall logs…</p>
                      </td>
                    </tr>
                  ) : recalls.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                        No batch recall events initiated yet.
                      </td>
                    </tr>
                  ) : (
                    recalls.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                        <td>
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-rose-500/10 dark:bg-rose-400/15 border border-rose-500/20 text-rose-600 dark:text-rose-400">
                            {r.batch_no}
                          </span>
                        </td>
                        <td className="text-xs text-gray-500">{format(new Date(r.date), 'dd/MM/yyyy HH:mm')}</td>
                        <td className="font-medium text-xs truncate max-w-[150px]" title={r.reason}>
                          {r.reason}
                        </td>
                        <td className="text-center font-bold text-gray-900 dark:text-white">
                          {r.affected_customers_count}
                        </td>
                        <td>
                          <span className="badge badge-red capitalize">recalled</span>
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={async () => {
                                try {
                                  const { data } = await traceabilityAPI.createRecall({ batch_no: r.batch_no, reason: r.reason })
                                  exportContactCSV(data.affected_customers, r.batch_no)
                                } catch {
                                  toast.error('Failed to export list')
                                }
                              }}
                              className="btn-secondary text-[10px] px-2 py-1 flex items-center gap-1 border border-rose-500/20 text-rose-600 bg-rose-500/5 hover:bg-rose-500/10"
                            >
                              <Download size={10} /> CSV
                            </button>
                            <button
                              onClick={() => setDeleteTarget(r)}
                              className="btn-icon text-rose-500 hover:bg-rose-500/10 p-1 rounded"
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
              className="btn-primary bg-rose-600 hover:bg-rose-700 flex items-center gap-1.5 shadow-lg shadow-rose-500/20"
            >
              <Download size={14} /> Export Customer List (CSV)
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 flex gap-3 text-rose-800 dark:text-rose-400">
            <ShieldAlert size={20} className="flex-shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Action Initiated</p>
              <p className="text-xs mt-1 text-gray-600 dark:text-gray-300">
                Batch has been recalled. Found <b>{affectedCustomers.length}</b> customer(s) who purchased products from this batch. 
                Export the CSV list to contact them immediately.
              </p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="table-container max-h-60 overflow-y-auto">
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
                      <td className="font-semibold text-gray-900 dark:text-white">{c.customer_name}</td>
                      <td className="font-mono text-xs text-[#0071e3] dark:text-[#0a84ff]">{c.mobile || 'N/A'}</td>
                      <td className="text-xs text-gray-500">{c.email || 'N/A'}</td>
                      <td className="text-xs max-w-[200px] truncate text-gray-500">{c.address || 'N/A'}</td>
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
              <p className="text-xs text-gray-500 mt-2 font-medium">Loading sold products list…</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="table-container max-h-96 overflow-y-auto">
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
                      <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="font-semibold text-gray-900 dark:text-white">{h.product_name}</td>
                        <td className="font-semibold text-gray-700 dark:text-gray-300">{h.customer_name}</td>
                        <td>
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-lg bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 text-[#0071e3] dark:text-[#0a84ff]">
                            {h.invoice_number}
                          </span>
                        </td>
                        <td className="text-xs text-gray-500">
                          {(() => { try { return format(new Date(h.sale_date), 'dd/MM/yyyy') } catch { return 'N/A' } })()}
                        </td>
                        <td className="text-right font-bold text-gray-900 dark:text-white">{h.quantity}</td>
                        <td className="text-right text-xs"><Amount value={h.rate} /></td>
                        <td className="text-right font-bold"><Amount value={h.total_amount} /></td>
                        <td>
                          <span className="font-mono text-xs text-gray-500 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded">
                            {h.batch_no || 'DEFAULT'}
                          </span>
                        </td>
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

