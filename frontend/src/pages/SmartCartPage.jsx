import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart, Plus, ArrowLeft, ShoppingBag, Search,
  Package, AlertCircle, LayoutGrid, List, RefreshCw, Zap
} from 'lucide-react'
import toast from 'react-hot-toast'

import { CartProvider, useCart, calcTotals } from '../components/cart/CartContext'
import ProductSearchBar from '../components/cart/ProductSearchBar'
import CartItemRow from '../components/cart/CartItemRow'
import CartSummaryPanel from '../components/cart/CartSummaryPanel'
import CustomerPanel from '../components/cart/CustomerPanel'
import BatchSelector from '../components/cart/BatchSelector'
import CheckoutModal from '../components/cart/CheckoutModal'
import { settingsAPI, productAPI, inventoryAPI } from '../services/api'

// ── Keyboard shortcut hint bar ─────────────────────────────────────────────
function ShortcutBar() {
  const shortcuts = [['F2','Search'],['F4','Customer'],['F8','Draft'],['F9','Checkout']]
  return (
    <div className="hidden lg:flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400 bg-white/25 dark:bg-white/5 px-3 py-1.5 rounded-xl border border-gray-200/50 dark:border-white/8">
      {shortcuts.map(([key, label]) => (
        <span key={key} className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-white/80 dark:bg-gray-700 rounded font-bold shadow-sm border border-gray-200/60 dark:border-white/10">{key}</kbd>
          {label}
        </span>
      ))}
    </div>
  )
}

// ── Cart Tab Button — FIXED colours ──────────────────────────────────────────
function CartTab({ cartId, isActive, itemCount, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 border ${
        isActive
          ? 'text-white border-indigo-500/60'
          : 'text-gray-600 dark:text-gray-300 border-gray-300/60 dark:border-white/10 hover:border-indigo-400/50 hover:text-indigo-600 dark:hover:text-indigo-300'
      }`}
      style={isActive ? {
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        boxShadow: '0 4px 16px rgba(99,102,241,0.35), inset 0 1px 1px rgba(255,255,255,0.25)',
      } : {
        background: 'rgba(255,255,255,0.5)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <ShoppingCart size={13} />
      <span>Cart {cartId}</span>
      {itemCount > 0 && (
        <span className={`min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-bold px-1 ${
          isActive ? 'bg-white/30 text-white' : 'bg-indigo-500 text-white'
        }`}>
          {itemCount}
        </span>
      )}
    </button>
  )
}

// ── Product Card for the browse grid ────────────────────────────────────────
function ProductCard({ product, onAddToCart }) {
  const [adding, setAdding] = useState(false)
  const isOutOfStock = (product.current_stock ?? 0) <= 0

  const handleAdd = async () => {
    if (isOutOfStock) return
    setAdding(true)
    await onAddToCart(product)
    setTimeout(() => setAdding(false), 600)
  }

  const stockColor = product.current_stock <= 0
    ? 'text-red-500'
    : product.current_stock <= 5
    ? 'text-orange-500'
    : 'text-emerald-600 dark:text-emerald-400'

  return (
    <div className={`group relative rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col ${
      isOutOfStock
        ? 'opacity-60 border-gray-200/50 dark:border-white/5'
        : 'border-white/60 dark:border-white/8 hover:border-indigo-400/40 hover:shadow-lg hover:-translate-y-0.5'
    }`}
      style={{
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Stock badge */}
      {isOutOfStock && (
        <div className="absolute top-2 right-2 z-10">
          <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md">Out of Stock</span>
        </div>
      )}

      <div className="p-3 flex-1">
        {/* Icon + Name */}
        <div className="flex items-start gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isOutOfStock ? 'bg-gray-100' : 'bg-indigo-50 dark:bg-indigo-900/30'
          }`}>
            {isOutOfStock
              ? <AlertCircle size={16} className="text-gray-400" />
              : <Package size={16} className="text-indigo-500" />
            }
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2">
              {product.name}
            </p>
            {product.brand && (
              <span className="inline-block text-[9px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded mt-0.5">
                {product.brand}
              </span>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="mt-2 space-y-1">
          {product.sku && (
            <p className="text-[10px] text-gray-400 font-mono">SKU: {product.sku}</p>
          )}
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-semibold ${stockColor}`}>
              Stock: {product.current_stock ?? 0} {product.unit || ''}
            </span>
            <span className="text-[10px] text-gray-400">GST {product.gst_rate || 0}%</span>
          </div>
        </div>

        {/* Price */}
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">
            ₹{(product.selling_price || 0).toFixed(2)}
          </span>
          {product.mrp && product.mrp > product.selling_price && (
            <span className="text-[10px] text-gray-400 line-through">₹{product.mrp.toFixed(2)}</span>
          )}
        </div>
      </div>

      {/* Add to Cart button */}
      <div className="px-3 pb-3">
        <button
          onClick={handleAdd}
          disabled={isOutOfStock || adding}
          className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 border ${
            isOutOfStock
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-transparent cursor-not-allowed'
              : adding
              ? 'border-emerald-400/60 text-emerald-600'
              : 'border-indigo-400/50 text-indigo-600 dark:text-indigo-300 hover:text-white hover:border-transparent active:scale-95'
          }`}
          style={!isOutOfStock && !adding ? {
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%)',
          } : adding ? {
            background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.08) 100%)',
          } : {}}
          onMouseEnter={e => {
            if (!isOutOfStock && !adding) {
              e.currentTarget.style.background = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
            }
          }}
          onMouseLeave={e => {
            if (!isOutOfStock && !adding) {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%)'
            }
          }}
        >
          {adding ? (
            <><span className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-500 rounded-full animate-spin" /> Added!</>
          ) : (
            <><Plus size={12} /> Add to Cart</>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Inner SmartCart ──────────────────────────────────────────────────────────
function SmartCartInner() {
  const navigate = useNavigate()
  const { CART_IDS, activeId, setActiveId, activeCart, addProduct, getCartItemCount } = useCart()
  const { items, isIgst, discPct } = activeCart
  const totals = calcTotals(items, discPct, isIgst)

  const [company, setCompany]       = useState(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [batchPicker, setBatchPicker]   = useState(null)

  // Product grid state
  const [allProducts, setAllProducts]     = useState([])
  const [filteredProducts, setFilteredProducts] = useState([])
  const [gridSearch, setGridSearch]       = useState('')
  const [gridLoading, setGridLoading]     = useState(false)
  const [viewMode, setViewMode]           = useState('grid') // 'grid' | 'cart'
  const [gridLoaded, setGridLoaded]       = useState(false)

  const searchRef = useRef()
  const customerSearchRef = useRef()
  const gridSearchRef = useRef()

  // Load company
  useEffect(() => {
    settingsAPI.getCompany().then(({ data }) => setCompany(data)).catch(() => {})
  }, [])

  // Load product grid
  const loadProductGrid = useCallback(async () => {
    setGridLoading(true)
    try {
      const { data } = await productAPI.search('', 200)
      setAllProducts(data || [])
      setFilteredProducts(data || [])
      setGridLoaded(true)
    } catch { toast.error('Could not load products') }
    finally { setGridLoading(false) }
  }, [])

  useEffect(() => {
    loadProductGrid()
  }, [loadProductGrid])

  // Filter product grid by search
  useEffect(() => {
    if (!gridSearch.trim()) {
      setFilteredProducts(allProducts)
    } else {
      const q = gridSearch.toLowerCase()
      setFilteredProducts(allProducts.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.includes(q)
      ))
    }
  }, [gridSearch, allProducts])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F2') { e.preventDefault(); gridSearchRef.current?.focus() }
      if (e.key === 'F4') { e.preventDefault(); customerSearchRef.current?.focus() }
      if (e.key === 'F8') { e.preventDefault(); handleSaveDraft() }
      if (e.key === 'F9') { e.preventDefault(); if (items.length > 0) setShowCheckout(true) }
      if (e.key === 'Escape') { setShowCheckout(false); setBatchPicker(null) }
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); gridSearchRef.current?.focus() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [items.length])

  const handleSaveDraft = useCallback(() => {
    toast.success(`Cart ${activeId} saved as draft`, { icon: '💾' })
  }, [activeId])

  // Add product with batch check
  const handleAddToCart = useCallback(async (product) => {
    try {
      const { data } = await inventoryAPI.batches({ product_id: product.id, limit: 50 })
      const batches = (data?.items || []).filter(b => (b.current_stock || 0) > 0)
      if (batches.length > 1) {
        setBatchPicker({ product, batches })
        return
      }
      if (batches.length === 1) {
        addProduct(product, batches[0])
      } else {
        addProduct(product, null)
      }
    } catch {
      addProduct(product, null)
    }
    if ('vibrate' in navigator) navigator.vibrate(30)
  }, [addProduct])

  const handleProductSelect = useCallback((product, batchInfo) => {
    addProduct(product, batchInfo)
    if ('vibrate' in navigator) navigator.vibrate(30)
  }, [addProduct])

  const handleBatchSelect = useCallback((product, batches) => {
    setBatchPicker({ product, batches })
  }, [])

  const handleBatchConfirm = useCallback((product, batch) => {
    addProduct(product, batch)
    setBatchPicker(null)
  }, [addProduct])

  const totalItems = items.reduce((s, i) => s + i.qty, 0)

  return (
    <div className="flex flex-col h-full gap-3 min-h-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/sales')} className="btn-icon w-8 h-8">
            <ArrowLeft size={15} />
          </button>
          <h1 className="page-title">Smart Cart</h1>
          <ShortcutBar />
        </div>

        {/* Cart tabs */}
        <div className="flex items-center gap-2">
          {CART_IDS.map(id => (
            <CartTab
              key={id}
              cartId={id}
              isActive={id === activeId}
              itemCount={getCartItemCount(id)}
              onClick={() => setActiveId(id)}
            />
          ))}
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="flex gap-3 flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT: Products + Cart workspace ── */}
        <div className="flex flex-col flex-1 min-w-0 gap-3 min-h-0 overflow-hidden">

          {/* Customer */}
          <div className="card p-3 relative z-30 flex-shrink-0">
            <CustomerPanel company={company} inputRef={customerSearchRef} />
          </div>

          {/* View toggle + product grid search */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Grid search bar */}
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                ref={gridSearchRef}
                type="text"
                value={gridSearch}
                onChange={e => setGridSearch(e.target.value)}
                placeholder="Search products… (F2)"
                className="input pl-9 py-2.5 text-sm w-full"
                autoComplete="off"
              />
              {gridSearch && (
                <button
                  onClick={() => setGridSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              )}
            </div>

            {/* Refresh */}
            <button
              onClick={loadProductGrid}
              disabled={gridLoading}
              className="btn-secondary px-3 py-2.5 flex-shrink-0"
              title="Refresh products"
            >
              <RefreshCw size={14} className={gridLoading ? 'animate-spin' : ''} />
            </button>

            {/* Grid / Cart view toggle */}
            <div className="flex rounded-xl overflow-hidden border border-gray-200/60 dark:border-white/10 flex-shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-all ${
                  viewMode === 'grid'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-white/50 dark:bg-white/5 text-gray-500 hover:text-indigo-600'
                }`}
              >
                <LayoutGrid size={13} /> Products
              </button>
              <button
                onClick={() => setViewMode('cart')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-all border-l border-gray-200/60 dark:border-white/10 relative ${
                  viewMode === 'cart'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-white/50 dark:bg-white/5 text-gray-500 hover:text-indigo-600'
                }`}
              >
                <List size={13} /> Cart
                {totalItems > 0 && (
                  <span className={`min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold px-0.5 ${
                    viewMode === 'cart' ? 'bg-white/30' : 'bg-indigo-500 text-white'
                  }`}>
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ── Product Grid ── */}
          {viewMode === 'grid' && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              {gridLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className="h-44 rounded-2xl bg-white/40 dark:bg-white/5 animate-pulse border border-white/60 dark:border-white/8" />
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Package size={40} className="text-gray-300 mb-3" />
                  <p className="text-sm text-gray-500">No products found for "<strong>{gridSearch}</strong>"</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mb-3 flex-shrink-0">
                    {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
                    {gridSearch && ` for "${gridSearch}"`}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-4">
                    {filteredProducts.map(p => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        onAddToCart={handleAddToCart}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Cart Table ── */}
          {viewMode === 'cart' && (
            <div className="card overflow-hidden flex-1 flex flex-col min-h-0 relative z-10">
              <div className="overflow-y-auto flex-1">
                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-4">
                      <ShoppingBag size={28} className="text-indigo-400" />
                    </div>
                    <h3 className="text-base font-bold text-gray-600 dark:text-gray-300 mb-1">Cart is empty</h3>
                    <p className="text-sm text-gray-400 mb-4">Switch to Products tab to add items</p>
                    <button
                      onClick={() => setViewMode('grid')}
                      className="btn-primary text-sm gap-2"
                    >
                      <LayoutGrid size={14} /> Browse Products
                    </button>
                  </div>
                ) : (
                  <table className="table w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className="px-3 w-8">#</th>
                        <th className="px-2">Product</th>
                        <th className="px-2 w-12 text-center">Unit</th>
                        <th className="px-2 w-28 text-center">Qty</th>
                        <th className="px-2 w-24 text-right">Rate ₹</th>
                        <th className="px-2 w-16 text-center">Disc%</th>
                        <th className="px-2 w-24 text-right">Taxable</th>
                        <th className="px-2 w-28 text-right">GST</th>
                        <th className="px-2 w-24 text-right">Total</th>
                        <th className="px-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <CartItemRow key={item._key || idx} item={item} idx={idx} isIgst={isIgst} />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-indigo-200/60 dark:border-indigo-700/30 bg-indigo-50/30 dark:bg-indigo-900/10">
                        <td colSpan={6} className="px-3 py-2.5 text-xs font-semibold text-gray-500">
                          {items.length} items · {items.reduce((s, i) => s + i.qty, 0)} units
                        </td>
                        <td className="px-2 py-2.5 text-right text-sm font-semibold text-gray-700 dark:text-gray-200">
                          ₹{totals.totalTaxable.toFixed(2)}
                        </td>
                        <td className="px-2 py-2.5 text-right text-xs text-gray-500">
                          {isIgst ? `₹${totals.totalIgst.toFixed(2)}` : `₹${(totals.totalCgst + totals.totalSgst).toFixed(2)}`}
                        </td>
                        <td className="px-2 py-2.5 text-right font-bold text-base text-indigo-700 dark:text-indigo-300">
                          ₹{totals.grandTotal.toFixed(2)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Summary panel ── */}
        <div className="w-72 flex-shrink-0 flex flex-col min-h-0 overflow-y-auto">
          <CartSummaryPanel
            onCheckout={() => setShowCheckout(true)}
            onSaveDraft={handleSaveDraft}
          />
        </div>
      </div>

      {/* ── Modals ── */}
      {batchPicker && (
        <BatchSelector
          product={batchPicker.product}
          batches={batchPicker.batches}
          onSelect={handleBatchConfirm}
          onClose={() => setBatchPicker(null)}
        />
      )}

      {showCheckout && (
        <CheckoutModal
          onClose={() => setShowCheckout(false)}
          onSuccess={() => {
            setShowCheckout(false)
            setTimeout(() => gridSearchRef.current?.focus(), 300)
          }}
        />
      )}
    </div>
  )
}

// ── Default export wrapped in CartProvider ────────────────────────────────────
export default function SmartCartPage() {
  return (
    <CartProvider>
      <SmartCartInner />
    </CartProvider>
  )
}
