import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Warehouse, AlertTriangle, TrendingDown, Package, Settings2,
  Search, ArrowUpRight, ArrowDownRight, Layers, Calendar, Clock,
  Filter, Check, X, ShieldAlert, FileText, ChevronLeft, ChevronRight,
  RefreshCw, CheckCircle2, AlertCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { inventoryAPI, productAPI } from '../services/api'
import { LoadingScreen, Amount, Modal, FormField, EmptyState } from '../components/ui'
import { format, isPast, addDays, isBefore } from 'date-fns'

export default function InventoryPage() {
  const navigate = useNavigate()
  const [status, setStatus]             = useState(null)
  const [lowStock, setLowStock]         = useState([])
  const [lowStockFilter, setLowStockFilter] = useState('all')
  const [lowStockSearch, setLowStockSearch] = useState('')
  const [logs, setLogs]                 = useState([])
  const [logTotal, setLogTotal]         = useState(0)
  const [logPage, setLogPage]           = useState(1)
  const [batchSearch, setBatchSearch]   = useState('')
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [tab, setTab]                   = useState('overview')
  const [batches, setBatches]           = useState([])
  const [batchesTotal, setBatchesTotal] = useState(0)

  // Stock Adjustment Modal
  const [adjModal, setAdjModal]         = useState(false)
  const [adjForm, setAdjForm]           = useState({ product_id: '', adjustment_type: 'add', quantity: 1, reason: '' })
  const [prodSearch, setProdSearch]     = useState('')
  const [prodResults, setProdResults]   = useState([])
  const [selectedProd, setSelectedProd] = useState(null)
  const [saving, setSaving]             = useState(false)
  const prodRef                         = useRef()

  const triggerSearchAllProducts = async () => {
    try {
      const { data } = await productAPI.search('', 50)
      setProdResults(data)
    } catch { /**/ }
  }

  useEffect(() => {
    const h = (e) => { if (!prodRef.current?.contains(e.target)) setProdResults([]) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [statusRes, lowRes] = await Promise.all([
        inventoryAPI.status(),
        inventoryAPI.lowStock({ limit: 100 })
      ])
      setStatus(statusRes.data)
      setLowStock(lowRes.data || [])
    } catch {
      if (!silent) toast.error('Failed to load inventory')
    } finally {
      if (!silent) setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadLogs = async () => {
    try {
      const { data } = await inventoryAPI.logs({ page: logPage, limit: 50 })
      setLogs(data.items || [])
      setLogTotal(data.total || 0)
    } catch { /**/ }
  }

  const loadBatches = async () => {
    try {
      const { data } = await inventoryAPI.batches({ page: 1, limit: 150 })
      setBatches(data.items || [])
      setBatchesTotal(data.total || 0)
    } catch { /**/ }
  }

  const autoRefreshRef = useRef(null)
  useEffect(() => {
    load()
    autoRefreshRef.current = setInterval(() => load(true), 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') load(true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(autoRefreshRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  useEffect(() => { 
    if (tab === 'logs') loadLogs() 
    if (tab === 'batches') loadBatches()
  }, [tab, logPage])

  useEffect(() => {
    if (prodSearch.length < 1) { setProdResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await productAPI.search(prodSearch, 10)
      setProdResults(data || [])
    }, 200)
    return () => clearTimeout(t)
  }, [prodSearch])

  const selectProd = (p) => {
    setSelectedProd(p)
    setAdjForm(f => ({ ...f, product_id: p.id }))
    setProdSearch('')
    setProdResults([])
  }

  const handleAdjust = async () => {
    if (!adjForm.product_id) return toast.error('Please select a product')
    if (!adjForm.quantity || adjForm.quantity <= 0) return toast.error('Enter a valid quantity')
    setSaving(true)
    try {
      const { data } = await inventoryAPI.adjust(adjForm)
      toast.success(`Stock adjusted: ${data.before} → ${data.after}`)
      setAdjModal(false)
      setSelectedProd(null)
      setAdjForm({ product_id: '', adjustment_type: 'add', quantity: 1, reason: '' })
      load()
      if (tab === 'logs') loadLogs()
      if (tab === 'batches') loadBatches()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to adjust stock')
    } finally {
      setSaving(false)
    }
  }

  // Filtered Low Stock
  const filteredLowStock = useMemo(() => {
    let list = lowStock
    if (lowStockFilter === 'out-of-stock') {
      list = list.filter(p => p.current_stock <= 0)
    }
    if (lowStockSearch.trim()) {
      const q = lowStockSearch.toLowerCase()
      list = list.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category_name && p.category_name.toLowerCase().includes(q))
      )
    }
    return list
  }, [lowStock, lowStockFilter, lowStockSearch])

  // Filtered Batches
  const filteredBatches = useMemo(() => {
    if (!batchSearch.trim()) return batches
    const q = batchSearch.toLowerCase()
    return batches.filter(b =>
      (b.product_name && b.product_name.toLowerCase().includes(q)) ||
      (b.sku && b.sku.toLowerCase().includes(q)) ||
      (b.batch_no && b.batch_no.toLowerCase().includes(q))
    )
  }, [batches, batchSearch])

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'low-stock', label: 'Low Stock Alerts', badge: status?.low_stock },
    { id: 'batches', label: 'Batches & Expiry', badge: batchesTotal || batches.length },
    { id: 'logs', label: 'Movement Audit', badge: logTotal || logs.length },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            Inventory & Warehousing
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Real-time stock valuation, batch levels, threshold alerts, and ledger movement logs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(false)}
            disabled={refreshing}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
            title="Refresh inventory"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setAdjModal(true)}
            className="btn-primary gap-2 cursor-pointer shadow-lg shadow-blue-500/20"
          >
            <Settings2 size={16} /> Adjust Stock
          </button>
        </div>
      </div>

      {/* 4 Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Products */}
        <div
          onClick={() => navigate('/products')}
          className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group"
          title="Click to view full products catalog"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Products</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 dark:border-blue-400/25 group-hover:scale-105 transition-transform">
              <Package size={16} className="text-[#0071e3] dark:text-[#0a84ff]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {status?.total_products ?? '—'}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium flex items-center gap-1 group-hover:text-[#0071e3] dark:group-hover:text-[#0a84ff] transition-colors">
              Active catalog items <ArrowUpRight size={12} />
            </p>
          </div>
        </div>

        {/* Low Stock Alert */}
        <div
          onClick={() => {
            setTab('low-stock')
            setLowStockFilter('all')
          }}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group ${
            tab === 'low-stock' && lowStockFilter === 'all' ? 'ring-2 ring-amber-500/40 border-amber-500/50 bg-amber-500/[0.04]' : ''
          }`}
          title="Click to view low stock items"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Low Stock</span>
              {(status?.low_stock ?? 0) > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-500/10 dark:bg-amber-400/15 border border-amber-500/20 dark:border-amber-400/25 group-hover:scale-105 transition-transform">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {status?.low_stock ?? 0}
            </div>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1 font-medium">
              Below reorder threshold
            </p>
          </div>
        </div>

        {/* Out of Stock */}
        <div
          onClick={() => {
            setTab('low-stock')
            setLowStockFilter('out-of-stock')
          }}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group ${
            tab === 'low-stock' && lowStockFilter === 'out-of-stock' ? 'ring-2 ring-rose-500/40 border-rose-500/50 bg-rose-500/[0.04]' : ''
          }`}
          title="Click to filter zero-stock products"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Out of Stock</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-rose-500/10 dark:bg-rose-400/15 border border-rose-500/20 dark:border-rose-400/25 group-hover:scale-105 transition-transform">
              <TrendingDown size={16} className="text-rose-600 dark:text-rose-400" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {status?.out_of_stock ?? 0}
            </div>
            <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-1 font-medium">
              Immediate PO needed
            </p>
          </div>
        </div>

        {/* Total Stock Value */}
        <div
          onClick={() => setTab('batches')}
          className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group"
          title="Click to view batches breakdown"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Stock Value</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-400/15 border border-emerald-500/20 dark:border-emerald-400/25 group-hover:scale-105 transition-transform">
              <Warehouse size={16} className="text-[#34c759] dark:text-[#30d158]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-650 dark:text-emerald-400">
              <Amount value={status?.total_value || 0} />
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium flex items-center gap-1 group-hover:text-[#34c759] dark:group-hover:text-[#30d158] transition-colors">
              At purchase cost · Batches <ArrowUpRight size={12} />
            </p>
          </div>
        </div>
      </div>

      {/* Apple Liquid Glass Segmented Tab Bar */}
      <div className="glass-tab-track">
        {TABS.map(t => {
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id)
                if (t.id === 'low-stock') {
                  setLowStockFilter('all')
                }
              }}
              className={`glass-tab-btn capitalize flex items-center gap-2 ${isActive ? 'active' : ''}`}
            >
              {isActive && (
                <>
                  <div className="glass-tab-active-pill" />
                  <div className="glass-tab-active-shadow" />
                </>
              )}
              <span className="relative z-10">{t.label}</span>
              {t.badge !== undefined && t.badge !== null && (
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

      {loading && tab === 'overview' ? <LoadingScreen /> : (
        <>
          {/* TAB 1: OVERVIEW */}
          {tab === 'overview' && status && (
            <div className="space-y-6">
              {/* Low Stock Preview Card */}
              {lowStock.length > 0 ? (
                <div className="card overflow-hidden">
                  <div className="p-4 sm:px-6 sm:py-4 border-b border-gray-150 dark:border-white/10 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <AlertTriangle size={15} />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                          Attention Required ({lowStock.length} low or zero-stock products)
                        </h2>
                        <p className="text-[11px] text-gray-400">
                          Products currently near or under the minimum safety inventory threshold
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setTab('low-stock')
                        setLowStockFilter('all')
                      }}
                      className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
                    >
                      View All Low Stock <ArrowUpRight size={13} />
                    </button>
                  </div>
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th className="text-right">Current Stock</th>
                          <th className="text-right">Min Threshold</th>
                          <th className="text-right">Purchase Price</th>
                          <th className="text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowStock.slice(0, 8).map(p => {
                          const isZero = p.current_stock <= 0
                          return (
                            <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                              <td>
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-xs font-bold text-gray-700 dark:text-gray-300">
                                    {(p.name || 'P')[0]?.toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-gray-900 dark:text-white leading-tight">
                                      {p.name}
                                    </div>
                                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                                      {p.category_name ? `${p.category_name} · ` : ''}Unit: {p.unit}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="text-right">
                                <span className={`font-bold ${isZero ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                  {p.current_stock} {p.unit}
                                </span>
                              </td>
                              <td className="text-right text-gray-500 dark:text-gray-400 font-medium">
                                {p.min_stock_alert} {p.unit}
                              </td>
                              <td className="text-right text-gray-900 dark:text-gray-200 font-medium">
                                <Amount value={p.purchase_price} />
                              </td>
                              <td className="text-right">
                                <span className={`badge ${isZero ? 'badge-red' : 'badge-amber'}`}>
                                  {isZero ? 'Out of Stock' : 'Low Stock'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="card p-8 text-center flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-3 border border-emerald-500/20">
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">All Stock Levels Healthy</h3>
                  <p className="text-xs text-gray-400 mt-1 max-w-sm">
                    No products have currently breached minimum safety thresholds. All inventory levels are well-stocked.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LOW STOCK TAB */}
          {tab === 'low-stock' && (
            <div className="space-y-4">
              {/* Filter Glass Bar */}
              <div className="filter-glass-bar flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLowStockFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                      lowStockFilter === 'all'
                        ? 'bg-[#0071e3] text-white shadow-md shadow-blue-500/20'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                    }`}
                  >
                    All Low Stock ({lowStock.length})
                  </button>
                  <button
                    onClick={() => setLowStockFilter('out-of-stock')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                      lowStockFilter === 'out-of-stock'
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-500/20'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                    }`}
                  >
                    Out of Stock ({lowStock.filter(p => p.current_stock <= 0).length})
                  </button>
                </div>

                <div className="relative flex-1 max-w-xs">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={lowStockSearch}
                    onChange={e => setLowStockSearch(e.target.value)}
                    placeholder="Search low stock products…"
                    className="input pl-8 py-1.5 text-xs w-full"
                  />
                  {lowStockSearch && (
                    <button onClick={() => setLowStockSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Low Stock Table */}
              <div className="card overflow-hidden">
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Unit</th>
                        <th className="text-right">Current Stock</th>
                        <th className="text-right">Min Threshold</th>
                        <th className="text-right">Est. Valuation</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLowStock.length === 0 ? (
                        <tr>
                          <td colSpan={7}>
                            <EmptyState
                              icon={Package}
                              title={lowStockFilter === 'out-of-stock' ? 'No products out of stock!' : 'No matching low-stock items'}
                              description="All products within this view are currently above the alert threshold."
                            />
                          </td>
                        </tr>
                      ) : (
                        filteredLowStock.map(p => {
                          const isZero = p.current_stock <= 0
                          return (
                            <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                              <td>
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-xs font-bold text-gray-700 dark:text-gray-300">
                                    {(p.name || 'P')[0]?.toUpperCase()}
                                  </div>
                                  <div className="font-semibold text-gray-900 dark:text-white">
                                    {p.name}
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-md">
                                  {p.category_name || '—'}
                                </span>
                              </td>
                              <td className="text-xs text-gray-500">{p.unit}</td>
                              <td className="text-right">
                                <span className={`font-bold px-2 py-0.5 rounded-lg text-xs ${
                                  isZero
                                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                }`}>
                                  {p.current_stock}
                                </span>
                              </td>
                              <td className="text-right text-gray-500 text-xs font-medium">
                                {p.min_stock_alert}
                              </td>
                              <td className="text-right font-medium text-gray-900 dark:text-white">
                                <Amount value={(p.current_stock || 0) * (p.purchase_price || 0)} />
                              </td>
                              <td className="text-right">
                                <button
                                  onClick={() => {
                                    setSelectedProd(p)
                                    setAdjForm(f => ({ ...f, product_id: p.id, adjustment_type: 'add' }))
                                    setAdjModal(true)
                                  }}
                                  className="btn-secondary text-[11px] px-2.5 py-1"
                                >
                                  Adjust
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
          )}

          {/* TAB 3: BATCHES TAB */}
          {tab === 'batches' && (
            <div className="space-y-4">
              {/* Filter Glass Bar */}
              <div className="filter-glass-bar flex items-center justify-between flex-wrap gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={batchSearch}
                    onChange={e => setBatchSearch(e.target.value)}
                    placeholder="Search by product, SKU, or batch number…"
                    className="input pl-8 py-1.5 text-xs w-full"
                  />
                  {batchSearch && (
                    <button onClick={() => setBatchSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  Showing {filteredBatches.length} batch records
                </div>
              </div>

              {/* Batches Table */}
              <div className="card overflow-hidden">
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Batch No</th>
                        <th>Expiry Status</th>
                        <th className="text-right">Stock</th>
                        <th className="text-right">Purchase Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBatches.length === 0 ? (
                        <tr>
                          <td colSpan={6}>
                            <EmptyState icon={Package} title="No tracked batches found" description="When purchase bills or initial stock include batch details, they will be listed here." />
                          </td>
                        </tr>
                      ) : (
                        filteredBatches.map((b, idx) => {
                          const expiryDate = b.expiry ? new Date(b.expiry) : null
                          const isExpired = expiryDate ? isPast(expiryDate) : false
                          const isExpiringSoon = expiryDate && !isExpired ? isBefore(expiryDate, addDays(new Date(), 30)) : false

                          return (
                            <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                              <td>
                                <div className="font-semibold text-gray-900 dark:text-white">
                                  {b.product_name || '—'}
                                </div>
                              </td>
                              <td>
                                <span className="font-mono text-xs text-gray-500 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                  {b.sku || '—'}
                                </span>
                              </td>
                              <td>
                                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-lg bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 text-[#0071e3] dark:text-[#0a84ff]">
                                  {b.batch_no}
                                </span>
                              </td>
                              <td>
                                {expiryDate ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-600 dark:text-gray-300">
                                      {format(expiryDate, 'dd/MM/yyyy')}
                                    </span>
                                    {isExpired && (
                                      <span className="badge badge-red text-[10px]">Expired</span>
                                    )}
                                    {isExpiringSoon && (
                                      <span className="badge badge-amber text-[10px]">Expiring &lt;30d</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400">No Expiry</span>
                                )}
                              </td>
                              <td className="text-right font-bold text-gray-900 dark:text-white">
                                {b.current_stock}
                              </td>
                              <td className="text-right font-medium text-gray-600 dark:text-gray-300">
                                <Amount value={b.purchase_price} />
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
          )}

          {/* TAB 4: LOGS TAB */}
          {tab === 'logs' && (
            <div className="card overflow-hidden">
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Product</th>
                      <th>Type</th>
                      <th className="text-right">Change</th>
                      <th className="text-right">Before</th>
                      <th className="text-right">After</th>
                      <th>Reference Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState icon={Clock} title="No stock movement logs recorded yet" description="Adjustments, sales, and purchases will automatically log their delta here." />
                        </td>
                      </tr>
                    ) : (
                      logs.map(l => {
                        const isPositive = l.quantity > 0
                        return (
                          <tr key={l.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                            <td className="text-xs text-gray-500 whitespace-nowrap">
                              {l.created_at ? format(new Date(l.created_at), 'dd/MM/yy · HH:mm') : '—'}
                            </td>
                            <td className="font-semibold text-sm text-gray-900 dark:text-white">
                              {l.product_name}
                            </td>
                            <td>
                              <span className={`badge ${
                                l.type === 'add' || isPositive ? 'badge-green' : 'badge-red'
                              }`}>
                                {l.type}
                              </span>
                            </td>
                            <td className={`text-right font-bold ${
                              isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              {isPositive ? `+${l.quantity}` : l.quantity}
                            </td>
                            <td className="text-right text-gray-500 font-mono text-xs">{l.before_stock}</td>
                            <td className="text-right font-bold font-mono text-xs text-gray-900 dark:text-white">{l.after_stock}</td>
                            <td className="text-xs text-gray-400 max-w-xs truncate">{l.reference || '—'}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Adjust Modal */}
      <Modal
        open={adjModal}
        onClose={() => { setAdjModal(false); setSelectedProd(null) }}
        title="Inventory Stock Adjustment"
        size="md"
        footer={(
          <>
            <button
              onClick={() => { setAdjModal(false); setSelectedProd(null) }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleAdjust}
              disabled={saving}
              className="btn-primary shadow-lg shadow-blue-500/20"
            >
              {saving ? 'Saving…' : 'Confirm Adjustment'}
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          <FormField label="Product" required>
            {selectedProd ? (
              <div className="card p-3 flex items-center justify-between border-blue-500/30 bg-blue-500/[0.04]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 text-[#0071e3] dark:text-[#0a84ff] font-bold text-xs">
                    {(selectedProd.name || 'P')[0]?.toUpperCase()}
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-gray-900 dark:text-white block leading-tight">
                      {selectedProd.name}
                    </span>
                    <span className="text-gray-400 text-xs">Current Stock: <b className="text-gray-700 dark:text-gray-200">{selectedProd.current_stock}</b></span>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedProd(null); setAdjForm(f => ({ ...f, product_id: '' })) }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="relative" ref={prodRef}>
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 cursor-pointer"
                  onClick={triggerSearchAllProducts}
                />
                <input
                  className="input pl-9 text-sm"
                  value={prodSearch}
                  onChange={e => setProdSearch(e.target.value)}
                  placeholder="Search product name or SKU…"
                />
                {prodResults.length > 0 && (
                  <div className="search-glass-dropdown">
                    {prodResults.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProd(p)}
                        className="search-glass-dropdown-item flex items-center justify-between"
                      >
                        <span className="font-medium text-gray-900 dark:text-white">{p.name}</span>
                        <span className="text-xs text-gray-400">Stock: <b className="text-gray-700 dark:text-gray-200">{p.current_stock}</b></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </FormField>

          <FormField label="Adjustment Type">
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'add', label: 'Add Stock (+)', color: 'text-emerald-600 border-emerald-500/30' },
                { id: 'remove', label: 'Remove (-)', color: 'text-rose-600 border-rose-500/30' },
                { id: 'set', label: 'Set Exact (=)', color: 'text-blue-600 border-blue-500/30' },
              ].map(opt => {
                const isSelected = adjForm.adjustment_type === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAdjForm(f => ({ ...f, adjustment_type: opt.id }))}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                      isSelected
                        ? `bg-[#0071e3]/10 border-[#0071e3] text-[#0071e3] dark:text-[#0a84ff] shadow-sm`
                        : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </FormField>

          <FormField label="Quantity">
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="input font-mono font-semibold"
              value={adjForm.quantity}
              onChange={e => setAdjForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
            />
          </FormField>

          <FormField label="Reason / Remarks">
            <input
              className="input"
              value={adjForm.reason}
              onChange={e => setAdjForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Physical inventory audit, Damaged goods, Stock count adjustment"
            />
          </FormField>
        </div>
      </Modal>
    </div>
  )
}

