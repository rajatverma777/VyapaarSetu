import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Warehouse, AlertTriangle, TrendingDown, TrendingUp, Package, Settings2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { inventoryAPI, productAPI } from '../services/api'
import { LoadingScreen, Amount, Modal, FormField, EmptyState } from '../components/ui'
import { format } from 'date-fns'

export default function InventoryPage() {
  const navigate = useNavigate()
  const [status, setStatus]       = useState(null)
  const [lowStock, setLowStock]   = useState([])
  const [lowStockFilter, setLowStockFilter] = useState('all')
  const [logs, setLogs]           = useState([])
  const [logTotal, setLogTotal]   = useState(0)
  const [logPage, setLogPage]     = useState(1)
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('overview')
  const [batches, setBatches]     = useState([])
  const [batchesTotal, setBatchesTotal] = useState(0)

  const [adjModal, setAdjModal]   = useState(false)
  const [adjForm, setAdjForm]     = useState({ product_id: '', adjustment_type: 'add', quantity: 1, reason: '' })
  const [prodSearch, setProdSearch] = useState('')
  const [prodResults, setProdResults] = useState([])
  const [selectedProd, setSelectedProd] = useState(null)
  const [saving, setSaving]       = useState(false)
  const prodRef = useRef()

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
    try {
      const [statusRes, lowRes] = await Promise.all([
        inventoryAPI.status(),
        inventoryAPI.lowStock({ limit: 50 })
      ])
      setStatus(statusRes.data)
      setLowStock(lowRes.data)
    } catch { if (!silent) toast.error('Failed to load') }
    finally { if (!silent) setLoading(false) }
  }, [])

  const loadLogs = async () => {
    try {
      const { data } = await inventoryAPI.logs({ page: logPage, limit: 50 })
      setLogs(data.items)
      setLogTotal(data.total)
    } catch { /**/ }
  }

  const loadBatches = async () => {
    try {
      const { data } = await inventoryAPI.batches({ page: 1, limit: 100 })
      setBatches(data.items)
      setBatchesTotal(data.total)
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
      setProdResults(data)
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
    if (!adjForm.product_id) return toast.error('Select a product')
    if (!adjForm.quantity)   return toast.error('Enter quantity')
    setSaving(true)
    try {
      const { data } = await inventoryAPI.adjust(adjForm)
      toast.success(`Stock adjusted: ${data.before} → ${data.after}`)
      setAdjModal(false)
      setSelectedProd(null)
      setAdjForm({ product_id: '', adjustment_type: 'add', quantity: 1, reason: '' })
      load()
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed') }
    finally { setSaving(false) }
  }

  const TABS = ['overview', 'low-stock', 'batches', 'logs']

  const filteredLowStock = lowStockFilter === 'out-of-stock'
    ? lowStock.filter(p => p.current_stock <= 0)
    : lowStock;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Inventory</h1>
        <button onClick={() => setAdjModal(true)} className="btn-primary">
          <Settings2 size={15} /> Adjust Stock
        </button>
      </div>

      {/* Tabs */}
      <div className="glass-tab-track">
        {TABS.map(t => {
          const isActive = tab === t
          return (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                if (t === 'low-stock') {
                  setLowStockFilter('all')
                }
              }}
              className={`glass-tab-btn capitalize ${isActive ? 'active' : ''}`}
            >
              {isActive && (
                <>
                  <div className="glass-tab-active-pill" />
                  <div className="glass-tab-active-shadow" />
                </>
              )}
              <span className="relative z-10">{t.replace('-', ' ')}</span>
            </button>
          )
        })}
      </div>

      {loading && tab === 'overview' ? <LoadingScreen /> : (
        <>
          {/* Overview */}
          {tab === 'overview' && status && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { 
                    icon: Package,       
                    label: 'Total Products', 
                    value: status.total_products,     
                    color: 'text-indigo-600 dark:text-indigo-400',
                    action: () => navigate('/products')
                  },
                  { 
                    icon: AlertTriangle, 
                    label: 'Low Stock',       
                    value: status.low_stock,           
                    color: 'text-red-650 dark:text-red-400',
                    action: () => {
                      setTab('low-stock')
                      setLowStockFilter('all')
                    }
                  },
                  { 
                    icon: TrendingDown,  
                    label: 'Out of Stock',    
                    value: status.out_of_stock,        
                    color: 'text-red-650 dark:text-red-400',
                    action: () => {
                      setTab('low-stock')
                      setLowStockFilter('out-of-stock')
                    }
                  },
                  { 
                    icon: Warehouse,     
                    label: 'Stock Value',     
                    value: <Amount value={status.total_value} />, 
                    color: 'text-green-650 dark:text-green-400',
                    action: () => setTab('batches')
                  },
                ].map(({ icon: Icon, label, value, color, action }) => (
                  <div 
                    key={label} 
                    onClick={action}
                    className="card p-5 cursor-pointer hover:scale-[1.02] hover:shadow-lg hover:border-indigo-500/30 transition-all duration-300 group"
                  >
                    <div className={`w-10 h-10 glass-icon-container mb-3 transition-transform duration-300 group-hover:scale-110 ${color}`}>
                      <Icon size={20} />
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white group-hover:text-indigo-650 dark:group-hover:text-indigo-400 transition-colors duration-300">{value}</p>
                    <p className="text-xs text-gray-550 mt-0.5 font-semibold">{label}</p>
                  </div>
                ))}
              </div>

              {/* Low stock preview */}
              {lowStock.length > 0 && (
                <div className="card">
                  <div className="card-header flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-500" />
                    <h2 className="section-title">Low Stock Alert ({lowStock.length} items)</h2>
                  </div>
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Product</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current Stock</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Min Alert</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Purchase Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowStock.slice(0, 10).map(p => (
                          <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <td className="px-4 py-3 text-left font-medium text-gray-900 dark:text-gray-100 border-t border-gray-100 dark:border-gray-700/50">
                              {p.name}
                            </td>
                            <td className="px-4 py-3 text-right border-t border-gray-100 dark:border-gray-700/50">
                              <span className={`font-semibold ${p.current_stock <= 0 ? 'text-red-600' : 'text-orange-600'}`}>
                                {p.current_stock} {p.unit}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700/50">
                              {p.min_stock_alert} {p.unit}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100 border-t border-gray-100 dark:border-gray-700/50">
                              <Amount value={p.purchase_price} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}          {/* Low Stock Tab */}
          {tab === 'low-stock' && (
            <div className="card">
              <div className="px-4 py-3 border-b dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                <div className="flex gap-2">
                  <button 
                    onClick={() => setLowStockFilter('all')} 
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${lowStockFilter === 'all' ? 'bg-indigo-650 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  >
                    All Low Stock ({lowStock.length})
                  </button>
                  <button 
                    onClick={() => setLowStockFilter('out-of-stock')} 
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${lowStockFilter === 'out-of-stock' ? 'bg-red-650 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  >
                    Out of Stock ({lowStock.filter(p => p.current_stock <= 0).length})
                  </button>
                </div>
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr><th>Product</th><th>Category</th><th>Unit</th>
                      <th className="text-right">Stock</th><th className="text-right">Min</th>
                      <th className="text-right">Value</th></tr>
                  </thead>
                  <tbody>
                    {filteredLowStock.length === 0 ? (
                      <tr><td colSpan={6}>
                        <EmptyState 
                          icon={Package} 
                          title={lowStockFilter === 'out-of-stock' ? "No products are out of stock!" : "All stock levels are fine!"} 
                        />
                      </td></tr>
                    ) : filteredLowStock.map(p => (
                      <tr key={p.id}>
                        <td className="font-medium">{p.name}</td>
                        <td className="text-sm text-gray-500">{p.category_name || '—'}</td>
                        <td>{p.unit}</td>
                        <td className="text-right">
                          <span className={`font-semibold ${p.current_stock <= 0 ? 'text-red-650 dark:text-red-400' : 'text-orange-650'}`}>
                            {p.current_stock}
                          </span>
                        </td>
                        <td className="text-right text-gray-500">{p.min_stock_alert}</td>
                        <td className="text-right"><Amount value={(p.current_stock || 0) * (p.purchase_price || 0)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Batches Tab */}
          {tab === 'batches' && (
            <div className="card">
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Batch No</th>
                      <th>Expiry</th>
                      <th className="text-right">Current Stock</th>
                      <th className="text-right">Purchase Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <EmptyState icon={Package} title="No batches tracked yet" />
                        </td>
                      </tr>
                    ) : batches.map((b, idx) => (
                      <tr key={idx}>
                        <td className="font-medium">{b.product_name || '—'}</td>
                        <td className="text-sm text-gray-500">{b.sku || '—'}</td>
                        <td>
                          <span className="badge badge-blue">{b.batch_no}</span>
                        </td>
                        <td className="text-sm text-gray-500">
                          {b.expiry ? format(new Date(b.expiry), 'dd/MM/yyyy') : 'No Expiry'}
                        </td>
                        <td className="text-right font-semibold">
                          {b.current_stock}
                        </td>
                        <td className="text-right">
                          <Amount value={b.purchase_price} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Logs Tab */}
          {tab === 'logs' && (
            <div className="card">
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr><th>Date</th><th>Product</th><th>Type</th>
                      <th className="text-right">Change</th><th className="text-right">Before</th>
                      <th className="text-right">After</th><th>Reference</th></tr>
                  </thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={l.id}>
                        <td className="text-xs text-gray-500">{l.created_at ? format(new Date(l.created_at), 'dd/MM/yy HH:mm') : '—'}</td>
                        <td className="font-medium text-sm">{l.product_name}</td>
                        <td>
                          <span className={`badge ${l.quantity > 0 ? 'badge-green' : 'badge-red'}`}>
                            {l.type}
                          </span>
                        </td>
                        <td className={`text-right font-semibold ${l.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {l.quantity > 0 ? '+' : ''}{l.quantity}
                        </td>
                        <td className="text-right text-gray-500">{l.before_stock}</td>
                        <td className="text-right font-medium">{l.after_stock}</td>
                        <td className="text-xs text-gray-500">{l.reference}</td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-gray-400">No stock logs</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Adjust Modal */}
      <Modal open={adjModal} onClose={() => { setAdjModal(false); setSelectedProd(null) }}
        title="Stock Adjustment" size="md"
        footer={<>
          <button onClick={() => setAdjModal(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleAdjust} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Adjust'}
          </button>
        </>}
      >
        <div className="space-y-4">
          <FormField label="Product" required>
            {selectedProd ? (
              <div className="input flex items-center justify-between">
                <span>{selectedProd.name} <span className="text-gray-500 text-xs">(Stock: {selectedProd.current_stock})</span></span>
                <button onClick={() => { setSelectedProd(null); setAdjForm(f => ({ ...f, product_id: '' })) }} className="text-gray-400">✕</button>
              </div>
            ) : (
              <div className="relative" ref={prodRef}>
                <Search size={16} 
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer hover:text-primary-600 transition-colors z-10" 
                        onClick={triggerSearchAllProducts} 
                />
                <input className="input pl-9" value={prodSearch} onChange={e => setProdSearch(e.target.value)} placeholder="Search product…" />
                {prodResults.length > 0 && (
                  <div className="dropdown-glass">
                    {prodResults.map(p => (
                      <button key={p.id} onClick={() => selectProd(p)}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-indigo-50/60 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5 last:border-0 flex justify-between">
                        <span className="font-medium text-gray-900 dark:text-white">{p.name}</span>
                        <span className="text-gray-500 dark:text-gray-400">Stock: {p.current_stock}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </FormField>
          <FormField label="Adjustment Type">
            <select className="select" value={adjForm.adjustment_type} onChange={e => setAdjForm(f => ({ ...f, adjustment_type: e.target.value }))}>
              <option value="add">Add Stock</option>
              <option value="remove">Remove Stock</option>
              <option value="set">Set Exact Stock</option>
            </select>
          </FormField>
          <FormField label="Quantity">
            <input type="number" min="0.01" step="0.01" className="input"
              value={adjForm.quantity} onChange={e => setAdjForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))} />
          </FormField>
          <FormField label="Reason">
            <input className="input" value={adjForm.reason}
              onChange={e => setAdjForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Physical count, Damage, etc." />
          </FormField>
        </div>
      </Modal>
    </div>
  )
}
