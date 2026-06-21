import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart, Plus, Minus, ArrowLeft, ShoppingBag, Search,
  Package, LayoutGrid, List, RefreshCw
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
    <div className="hidden lg:flex items-center gap-3.5 text-[10px] text-gray-500 dark:text-indigo-300/85 bg-indigo-50/40 dark:bg-indigo-500/5 px-3.5 py-1.5 rounded-xl border border-indigo-100/50 dark:border-indigo-500/15">
      {shortcuts.map(([key, label]) => (
        <span key={key} className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-white/90 dark:bg-indigo-500/15 rounded font-bold shadow-sm border border-indigo-100 dark:border-indigo-500/25 text-indigo-600 dark:text-indigo-200">{key}</kbd>
          {label}
        </span>
      ))}
    </div>
  )
}

// ── Cart Tab Button — Dark glass pill style ───────────────────────────────
function CartTab({ cartId, isActive, itemCount, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`btn-cart-tab ${
        isActive ? 'btn-cart-tab-active' : 'btn-cart-tab-inactive'
      }`}
    >
      <ShoppingCart
        size={13}
        className={isActive ? 'text-white dark:text-indigo-100' : 'text-gray-400 dark:text-indigo-400/60'}
      />
      <span>Cart {cartId}</span>
      {itemCount > 0 && (
        <span className={`min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-extrabold px-1.5 transition-all duration-300 ${
          isActive
            ? 'bg-white text-indigo-600 dark:text-indigo-900 shadow-[0_2px_8px_rgba(255,255,255,0.2)]'
            : 'bg-indigo-500 text-white'
        }`}>
          {itemCount}
        </span>
      )}
    </button>
  )
}

// ── Apple Liquid Glass ProductCard ───────────────────────────────────────────
function ProductCard({ product, onAddToCart }) {
  const { activeCart, updateItem, removeItem } = useCart()
  const [adding, setAdding] = useState(false)
  const [added,  setAdded]  = useState(false)
  const isOutOfStock = (product.current_stock ?? 0) <= 0

  // Calculate items of this product in cart
  const cartItems = activeCart?.items?.filter(item => item.product_id === product.id) || []
  const totalQtyInCart = cartItems.reduce((sum, item) => sum + item.qty, 0)

  const handleAdd = async () => {
    if (isOutOfStock || adding) return
    setAdding(true)
    await onAddToCart(product)
    setAdded(true)
    setTimeout(() => { setAdding(false); setAdded(false) }, 900)
  }

  const handleDecrease = (e) => {
    e.stopPropagation()
    // Find index of the item of this product in the active cart
    const itemIndices = activeCart.items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.product_id === product.id)

    if (itemIndices.length === 0) return

    // Decrease or remove the last item in the list
    const { item, idx } = itemIndices[itemIndices.length - 1]
    if (item.qty > 1) {
      updateItem(idx, 'qty', item.qty - 1)
    } else {
      removeItem(idx)
    }
    if ('vibrate' in navigator) navigator.vibrate(30)
  }

  const handleIncrease = (e) => {
    e.stopPropagation()
    handleAdd()
  }

  const stock = product.current_stock ?? 0
  const stockDot   = stock <= 0 ? '#f87171' : stock <= 5 ? '#fbbf24' : '#34d399'
  const stockLabel = stock <= 0 ? 'Out of stock' : `${stock} in stock`

  return (
    <div
      onClick={!isOutOfStock ? (totalQtyInCart > 0 ? undefined : handleAdd) : undefined}
      className={`product-card ${
        isOutOfStock
          ? 'opacity-40 cursor-not-allowed'
          : 'cursor-pointer'
      }`}
    >
      {/* ── Card body ── */}
      <div className="relative p-4 flex-1 flex flex-col gap-2.5">

        {/* Icon + Name */}
        <div className="flex items-start gap-3">
          {/* Glass icon bubble container */}
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center bg-indigo-50/50 dark:bg-indigo-500/10 border border-indigo-100/80 dark:border-indigo-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <Package size={15} className="text-indigo-600 dark:text-indigo-400" />
            </div>

            {/* Badge overlaid on top of the package icon itself - 100% overlap proof */}
            {totalQtyInCart > 0 && (
              <div
                className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold z-10 px-1 border animate-in fade-in zoom-in-75 duration-200"
                style={{
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.85) 0%, rgba(99, 102, 241, 0.95) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  color: '#ffffff',
                  boxShadow: '0 2px 6px rgba(99, 102, 241, 0.4)',
                }}
              >
                {totalQtyInCart}
              </div>
            )}
          </div>

          {/* Title and Brand container */}
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[12.5px] font-semibold text-gray-900 dark:text-white leading-snug line-clamp-2 tracking-[0.01em]">
              {product.name}
            </p>
            {product.brand && (
              <span className="inline-block text-[9px] font-medium mt-1.5 px-2.5 py-0.5 rounded-full truncate max-w-full bg-indigo-50/30 dark:bg-indigo-550/8 border border-indigo-100/40 dark:border-indigo-500/12 text-indigo-600/85 dark:text-indigo-300 tracking-[0.02em]">
                {product.brand}
              </span>
            )}
          </div>
        </div>

        {/* Stock row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className="w-[6px] h-[6px] rounded-full flex-shrink-0"
              style={{
                background: stockDot,
                boxShadow: `0 0 6px ${stockDot}99`,
              }}
            />
            <span className="text-[10px] font-medium text-gray-500 dark:text-indigo-200/60">
              {stockLabel}
            </span>
          </div>
          {(product.gst_rate ?? 0) > 0 && (
            <span className="text-[9px] text-gray-400 dark:text-indigo-300/40">
              GST {product.gst_rate}%
            </span>
          )}
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2 mt-auto">
          <span className="text-[18px] font-bold text-indigo-600 dark:text-indigo-50 tracking-tight">
            ₹{(product.selling_price || 0).toFixed(2)}
          </span>
          {product.mrp > product.selling_price && (
            <span className="text-[10px] line-through text-gray-400 dark:text-indigo-350/30">
              ₹{product.mrp?.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* ── Add to Cart — glass pill / qty controller ── */}
      <div className="px-3 pb-4 z-10">
        {totalQtyInCart > 0 ? (
          <div className="w-full flex items-center justify-between p-1 rounded-[12px] text-[11px] font-semibold tracking-wide transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 duration-200 bg-white/70 dark:bg-indigo-500/5 border border-gray-200/50 dark:border-indigo-500/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]">
            {/* Minus Button */}
            <button
              onClick={handleDecrease}
              className="qty-btn w-7 h-7"
              title="Decrease quantity"
            >
              <Minus size={11} />
            </button>

            {/* Quantity Text */}
            <div className="flex items-center gap-1 select-none">
              <span className="text-[12px] font-extrabold text-indigo-600 dark:text-indigo-300">
                {totalQtyInCart}
              </span>
              <span className="text-[9.5px] text-gray-500 dark:text-indigo-300/60 font-medium">in cart</span>
            </div>

            {/* Plus Button */}
            <button
              onClick={handleIncrease}
              disabled={adding}
              className="qty-btn w-7 h-7"
              title="Increase quantity"
            >
              {adding ? (
                <span className="w-3 h-3 border border-white/30 border-t-white/80 rounded-full animate-spin" />
              ) : (
                <Plus size={11} />
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); handleAdd() }}
            disabled={isOutOfStock || adding}
            className={`btn-add-to-cart ${added ? 'state-added' : ''}`}
          >
            {added ? (
              <><span>✓</span> Added</>
            ) : adding ? (
              <><span className="w-3 h-3 border border-white/30 border-t-white/80 rounded-full animate-spin" /> Adding…</>
            ) : (
              <><Plus size={11} /> Add to Cart</>
            )}
          </button>
        )}
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

  // Load product grid — proper cleanup handles React StrictMode double-invoke
  // Backend max limit is 200 (limit=500 returns 422)
  const loadProductGrid = useCallback(async (signal) => {
    setGridLoading(true)
    try {
      const { data } = await productAPI.list({ limit: 200, page: 1 })
      if (signal?.aborted) return
      const products = data?.items || []
      setAllProducts(products)
      setFilteredProducts(products)
      setGridLoaded(true)
    } catch (e) {
      if (signal?.aborted) return
      console.error('Product load failed:', e?.response?.status, e?.response?.data?.detail || e?.message)
      toast.error(`Failed to load products (${e?.response?.status || 'network error'})`)
    } finally {
      if (!signal?.aborted) setGridLoading(false)
    }
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    loadProductGrid(ctrl.signal)
    return () => ctrl.abort()   // cancels stale call on StrictMode re-run / unmount
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
      <div className="flex flex-col xl:flex-row gap-3 flex-1 min-h-0 overflow-hidden">

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
              onClick={() => loadProductGrid()}
              disabled={gridLoading}
              className="btn-secondary px-3 py-2.5 flex-shrink-0"
              title="Refresh products"
            >
              <RefreshCw size={14} className={gridLoading ? 'animate-spin' : ''} />
            </button>

            {/* Grid / Cart view toggle */}
            <div className="tax-toggle-track flex-shrink-0 w-48 h-[38px] items-center">
              <div
                className="tax-toggle-pill"
                style={{ transform: viewMode === 'cart' ? 'translateX(100%)' : 'translateX(0%)' }}
              />
              <button
                onClick={() => setViewMode('grid')}
                className={`tax-toggle-btn flex items-center justify-center gap-1.5 h-full text-xs font-semibold ${viewMode === 'grid' ? 'tax-toggle-active' : ''}`}
              >
                <LayoutGrid size={13} /> Products
              </button>
              <button
                onClick={() => setViewMode('cart')}
                className={`tax-toggle-btn flex items-center justify-center gap-1.5 h-full text-xs font-semibold ${viewMode === 'cart' ? 'tax-toggle-active' : ''}`}
              >
                <List size={13} /> Cart
                {totalItems > 0 && (
                  <span className={`min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold px-0.5 ${
                    viewMode === 'cart' ? 'bg-white/30 text-white' : 'bg-indigo-500 text-white'
                  }`}>
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ── Product Grid ── */}
          {viewMode === 'grid' && (
            <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pt-1.5">
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
                    {filteredProducts.map((p, i) => (
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
        <div className={`${viewMode === 'grid' ? 'hidden xl:flex' : 'flex'} w-full xl:w-72 flex-shrink-0 flex flex-col min-h-0 overflow-y-auto px-1.5 pt-1.5 pb-2`}>
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
